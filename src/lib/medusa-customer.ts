/**
 * Ecosystem SSO → Medusa orders for the /me portal.
 *
 * The member is already authenticated against the PLATFORM Supabase project
 * (the SSR cookie session). We hand that access token to Medusa's `supabase`
 * auth provider (POST /auth/customer/supabase — the provider is registered
 * under id `supabase` in the backend medusa-config), which verifies the JWT and
 * returns a Medusa customer JWT. We then list the customer's orders with that
 * JWT plus the Rollout publishable key (attribution).
 *
 * READ-ONLY + non-destructive: we never create a Medusa customer here (unlike
 * the storefront's loginWithSupabase). If the ecosystem identity has no linked
 * Medusa customer yet, /store/orders returns nothing and we render an empty
 * state — the exchange itself still proves the plumbing works.
 *
 * Server-only.
 */
import 'server-only';
import { getSupabaseServer } from './supabase/server';
import { MEDUSA_URL, MEDUSA_PUBLISHABLE_KEY } from './medusa';

export type MedusaOrderItem = {
    id: string;
    title: string | null;
    quantity: number | null;
    unit_price: number | null;
    thumbnail: string | null;
};

export type MedusaOrder = {
    id: string;
    display_id: number | string | null;
    status: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    total: number | null;
    currency_code: string | null;
    created_at: string | null;
    vendor: string | null;
    /** True for an event package (order.metadata.event_id) — not a store buy. */
    is_event: boolean;
    /** The event id, when is_event — used to show the refund policy cutoff. */
    event_id: string | null;
    items: MedusaOrderItem[];
};

export type OrdersResult = {
    /** true when the Supabase→Medusa token exchange succeeded (200). */
    exchanged: boolean;
    orders: MedusaOrder[];
    /** Non-fatal explanation for an empty list or a failed exchange. */
    note: string | null;
};

function pkHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        'x-publishable-api-key': MEDUSA_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        ...(extra ?? {}),
    };
}

/**
 * Hand a Supabase access token to Medusa's `supabase` auth provider and return
 * the resulting Medusa token. For an identity that is not yet linked to a
 * customer this is a registration-scoped token; once a customer exists it is an
 * actor-scoped (customer) token. Returns null on any failure.
 */
async function authExchange(accessToken: string): Promise<string | null> {
    try {
        const res = await fetch(`${MEDUSA_URL}/auth/customer/supabase`, {
            method: 'POST',
            headers: pkHeaders(),
            body: JSON.stringify({ token: accessToken }),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const json = await res.json();
        const token = json?.token;
        return typeof token === 'string' ? token : null;
    } catch {
        return null;
    }
}

/**
 * Exchange the caller's Supabase access token for a Medusa customer JWT.
 * Returns null when there is no session or the exchange fails.
 */
async function exchangeForMedusaToken(): Promise<string | null> {
    const supabase = await getSupabaseServer();
    const {
        data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return null;
    return authExchange(accessToken);
}

/**
 * True when a Medusa token resolves to a live, readable actor (GET
 * /store/customers/me succeeds). False on 401/404 AND on a network error —
 * callers that need to tell "not linked" apart from "network hiccup" use the
 * raw fetch instead; this is only for the bounded verify-before-trusting
 * passes below.
 */
async function verifyMedusaToken(token: string): Promise<boolean> {
    try {
        const res = await fetch(`${MEDUSA_URL}/store/customers/me`, {
            method: 'GET',
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            cache: 'no-store',
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * The signed-in platform user's id, for diagnostic logging only (never a
 * token, never PII beyond the id itself). Best-effort: null on any failure.
 */
export async function getSessionUserId(): Promise<string | null> {
    try {
        const supabase = await getSupabaseServer();
        const {
            data: { session },
        } = await supabase.auth.getSession();
        return session?.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * A vendor worth showing. The backend stamps metadata.vendor = 'unknown' on an
 * order with no selling shop — an event package, by design — and /me/orders
 * printed the literal word (R12, lane RV). Absent is the honest value.
 */
function vendorLabel(raw: unknown): string | null {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v || v.toLowerCase() === 'unknown') return null;
    return v;
}

/** Best-effort first/last name from Supabase user metadata (may be empty). */
function nameParts(user: {
    user_metadata?: Record<string, unknown> | null;
}): { firstName?: string; lastName?: string } {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const first = typeof meta.first_name === 'string' ? meta.first_name : '';
    const last = typeof meta.last_name === 'string' ? meta.last_name : '';
    if (first || last) return { firstName: first || undefined, lastName: last || undefined };

    const full =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        (typeof meta.display_name === 'string' && meta.display_name) ||
        '';
    if (full.trim()) {
        const parts = full.trim().split(/\s+/);
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
    }
    return {};
}

/**
 * Resolve the signed-in platform user to a linked Medusa customer, creating one
 * on first sight, and return an actor-scoped Medusa customer JWT. Mirrors the
 * NeferStock storefront's `loginWithSupabase` sequence (find-or-create), but is
 * fully best-effort: returns null when there is no session or any step fails, so
 * a caller can safely fall back to anonymous behaviour.
 *
 *   1. Exchange the platform JWT for a Medusa token.
 *   2. If GET /store/customers/me succeeds, the identity is already linked — the
 *      token is actor-scoped; return it.
 *   3. Otherwise create + link the customer with the registration-scoped token,
 *      stamping metadata.supabase_user_id (the one ecosystem id).
 *   4. Re-exchange to obtain the now actor-scoped token and return it, but only
 *      after re-verifying it — see the KNOWN GAP below.
 *
 * KNOWN GAP (diagnosed 2026-09-24, rollout.club "Couldn't start checkout"):
 * Medusa's `supabase` auth provider returns 200 for an identity whose
 * app_metadata still points at a Medusa customer that was deleted out from
 * under it (e.g. a test-data sweep). That 200 hands back a token scoped to a
 * MISSING actor. Medusa's own authenticate middleware then rejects EVERY
 * authenticated store call carrying that token with 401 — including step 3's
 * POST /store/customers — so "create + re-exchange" cannot relink a dangling
 * identity: step 3 401s, the retry re-exchanges the SAME stale identity, and
 * authExchange hands back the SAME broken token forever. The only real fix is
 * clearing the stale link server-side (Medusa's admin auth-identities API),
 * and src/lib/medusa-admin.ts exposes no such route today (it is scoped to
 * vendor orders/products/pulse) — so this cannot self-heal from the web app.
 * Rather than hand a caller a token that looks valid but 401s on every store
 * call, step 4 below re-verifies the token it is about to return and fails
 * closed (null) when it is still broken, so callers refuse BEFORE taking
 * money instead of 401ing after (see event-cart.ts's eventMedusaFetch, which
 * also does one bounded relink-and-retry of its own for calls that slip
 * through with a token that was valid when fetched but stops being so).
 */
export async function ensureMedusaCustomerToken(): Promise<string | null> {
    const supabase = await getSupabaseServer();
    const {
        data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const user = session?.user;
    if (!accessToken || !user) return null;

    // 1. Platform JWT → Medusa token.
    const token = await authExchange(accessToken);
    if (!token) return null;

    // 2. Already linked? Then this token is actor-scoped and we're done.
    let linked: boolean;
    try {
        linked = await verifyMedusaToken(token);
        if (linked) return token;
        // 401/404 = authenticated identity with no linked customer yet (or a
        // dangling one — see KNOWN GAP above) → attempt to create/relink.
    } catch {
        return token; // transient — use what we have rather than block the caller
    }

    // 3. Create + link the Medusa customer with the registration-scoped token.
    const { firstName, lastName } = nameParts(user);
    let relinkedToken: string | null = null;
    try {
        const createRes = await fetch(`${MEDUSA_URL}/store/customers`, {
            method: 'POST',
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            body: JSON.stringify({
                email: user.email ?? undefined,
                first_name: firstName,
                last_name: lastName,
                metadata: { supabase_user_id: user.id },
            }),
            cache: 'no-store',
        });
        if (!createRes.ok) {
            // A concurrent request may have created it first (or this is the
            // KNOWN GAP dangling-identity case, which 401s here too) —
            // re-exchange once to pick up whatever the identity now resolves
            // to, then verify it below rather than trust it blindly.
            relinkedToken = await authExchange(accessToken);
        } else {
            // 4. Re-exchange → actor-scoped customer token now that the link exists.
            relinkedToken = await authExchange(accessToken);
        }
    } catch {
        return token;
    }

    if (!relinkedToken) return token;
    // Bounded: exactly one verify of the post-relink token. If it is STILL
    // unusable, this is the dangling-identity gap, not a transient blip —
    // fail closed instead of handing back a token that will 401 downstream.
    const ok = await verifyMedusaToken(relinkedToken);
    if (ok) return relinkedToken;

    const uid = await getSessionUserId();
    console.error(
        `[medusa-customer] identity for member ${uid ?? 'unknown'} still does not resolve to a live Medusa actor after create+re-exchange — likely a dangling auth_identity (see KNOWN GAP in ensureMedusaCustomerToken). Refusing to hand back a token that would 401 downstream.`,
    );
    return null;
}

/**
 * List the signed-in member's Medusa orders (Rollout-attributed). Always
 * resolves — errors and the not-a-customer case surface as an empty list with
 * a note, never a throw.
 */
export async function loadMyOrders(): Promise<OrdersResult> {
    const medusaToken = await exchangeForMedusaToken();
    if (!medusaToken) {
        return {
            exchanged: false,
            orders: [],
            note: 'Could not connect your account to the store right now.',
        };
    }

    try {
        const url = new URL(`${MEDUSA_URL}/store/orders`);
        url.searchParams.set('limit', '50');
        url.searchParams.set('order', '-created_at');
        url.searchParams.set(
            'fields',
            'id,display_id,status,payment_status,fulfillment_status,total,currency_code,created_at,metadata,*items',
        );
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: pkHeaders({ Authorization: `Bearer ${medusaToken}` }),
            cache: 'no-store',
        });
        if (res.status === 401 || res.status === 404) {
            // Authenticated identity but no linked Medusa customer yet.
            return { exchanged: true, orders: [], note: null };
        }
        if (!res.ok) {
            return { exchanged: true, orders: [], note: `Store responded ${res.status}.` };
        }
        const json = await res.json();
        const orders: MedusaOrder[] = ((json?.orders ?? []) as any[]).map((o) => ({
            id: o.id,
            display_id: o.display_id ?? null,
            status: o.status ?? null,
            payment_status: o.payment_status ?? null,
            fulfillment_status: o.fulfillment_status ?? null,
            total: o.total ?? null,
            currency_code: o.currency_code ?? null,
            created_at: o.created_at ?? null,
            vendor: vendorLabel(o?.metadata?.vendor),
            is_event: !!o?.metadata?.event_id,
            event_id: typeof o?.metadata?.event_id === 'string' ? o.metadata.event_id : null,
            items: (o.items ?? []).map((it: any) => ({
                id: it.id,
                title: it.title ?? it.product_title ?? null,
                quantity: it.quantity ?? null,
                unit_price: it.unit_price ?? null,
                thumbnail: it.thumbnail ?? null,
            })),
        }));
        return { exchanged: true, orders, note: null };
    } catch (e: any) {
        return { exchanged: true, orders: [], note: e?.message ?? 'Order lookup failed.' };
    }
}

export function formatMoney(amount: number | null, currency: string | null): string {
    if (amount == null) return '—';
    const cur = (currency ?? 'usd').toUpperCase();
    const prefix = cur === 'USD' ? '$' : cur + ' ';
    return `${prefix}${Number(amount).toFixed(2)}`;
}

/* ─── Single order detail (/me/orders/[id]) ──────────────────────────────────
 * Adds shipping address + method, totals breakdown, and best-effort payment /
 * fulfillment detail on top of the list shape. Everything is read from the
 * authenticated customer's STORE token — never the admin API — so ownership is
 * enforced by Medusa (a foreign order id 404s), and any field the store API
 * withholds simply comes back null and renders as a graceful fallback.
 */

export type MedusaAddress = {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    address_1: string | null;
    address_2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country_code: string | null;
    phone: string | null;
};

export type MedusaShippingMethod = {
    id: string;
    name: string | null;
    amount: number | null;
};

export type MedusaPayment = {
    id: string;
    amount: number | null;
    currency_code: string | null;
    provider_id: string | null;
    captured_at: string | null;
    canceled_at: string | null;
    /** Card brand + last4, ONLY when the store API surfaces them (often not). */
    cardBrand: string | null;
    cardLast4: string | null;
};

export type MedusaTracking = {
    number: string | null;
    url: string | null;
};

export type MedusaFulfillment = {
    id: string;
    shipped_at: string | null;
    delivered_at: string | null;
    packed_at: string | null;
    /** Tracking numbers + carrier URLs attached when the fulfillment shipped. */
    tracking: MedusaTracking[];
};

export type MedusaOrderDetail = MedusaOrder & {
    email: string | null;
    /** Items-only subtotal — Medusa's `subtotal` includes shipping. */
    subtotal: number | null;
    shipping_total: number | null;
    tax_total: number | null;
    discount_total: number | null;
    shipping_address: MedusaAddress | null;
    shipping_methods: MedusaShippingMethod[];
    payments: MedusaPayment[];
    fulfillments: MedusaFulfillment[];
};

export type OrderDetailResult =
    | { exchanged: false; order: null; note: string }
    | { exchanged: true; order: null; notFound: true }
    | { exchanged: true; order: MedusaOrderDetail; notFound?: false };

function mapAddress(a: any): MedusaAddress | null {
    if (!a || typeof a !== 'object') return null;
    return {
        first_name: a.first_name ?? null,
        last_name: a.last_name ?? null,
        company: a.company ?? null,
        address_1: a.address_1 ?? null,
        address_2: a.address_2 ?? null,
        city: a.city ?? null,
        province: a.province ?? null,
        postal_code: a.postal_code ?? null,
        country_code: a.country_code ?? null,
        phone: a.phone ?? null,
    };
}

/** Best-effort card brand/last4 dig — Stripe stashes these in payment.data
 *  under a few shapes across versions; return null when absent. */
function cardFromPaymentData(data: any): { brand: string | null; last4: string | null } {
    if (!data || typeof data !== 'object') return { brand: null, last4: null };
    const card =
        data.card ??
        data.charges?.data?.[0]?.payment_method_details?.card ??
        data.payment_method_details?.card ??
        null;
    if (card && typeof card === 'object') {
        return { brand: card.brand ?? card.network ?? null, last4: card.last4 ?? null };
    }
    return { brand: null, last4: null };
}

/**
 * Fetch ONE order for the signed-in member. Resolves to a discriminated result:
 * unauthenticated/exchange-failure, not-found (or not-yours), or the order.
 */
export async function loadMyOrder(orderId: string): Promise<OrderDetailResult> {
    const medusaToken = await exchangeForMedusaToken();
    if (!medusaToken) {
        return {
            exchanged: false,
            order: null,
            note: 'Could not connect your account to the store right now.',
        };
    }

    try {
        const url = new URL(`${MEDUSA_URL}/store/orders/${encodeURIComponent(orderId)}`);
        url.searchParams.set(
            'fields',
            [
                'id',
                'display_id',
                'status',
                'payment_status',
                'fulfillment_status',
                'email',
                'currency_code',
                'created_at',
                'metadata',
                'subtotal',
                'item_subtotal',
                'shipping_total',
                'tax_total',
                'discount_total',
                'total',
                '*items',
                '*shipping_address',
                '*shipping_methods',
                '*payment_collections',
                '*payment_collections.payments',
                '*fulfillments',
                'fulfillments.labels.tracking_number',
                'fulfillments.labels.tracking_url',
            ].join(','),
        );
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: pkHeaders({ Authorization: `Bearer ${medusaToken}` }),
            cache: 'no-store',
        });
        // 401/404 → not the caller's order (or no linked customer). Treat both as
        // "not found" so the page 404s rather than leaking existence.
        if (res.status === 401 || res.status === 404) {
            return { exchanged: true, order: null, notFound: true };
        }
        if (!res.ok) {
            return { exchanged: true, order: null, notFound: true };
        }
        const json = await res.json();
        const o = json?.order;
        if (!o?.id) return { exchanged: true, order: null, notFound: true };

        const payments: MedusaPayment[] = [];
        for (const pc of (o.payment_collections ?? []) as any[]) {
            for (const p of (pc?.payments ?? []) as any[]) {
                const { brand, last4 } = cardFromPaymentData(p?.data);
                payments.push({
                    id: p.id,
                    amount: p.amount ?? null,
                    currency_code: p.currency_code ?? o.currency_code ?? null,
                    provider_id: p.provider_id ?? null,
                    captured_at: p.captured_at ?? null,
                    canceled_at: p.canceled_at ?? null,
                    cardBrand: brand,
                    cardLast4: last4,
                });
            }
        }

        const order: MedusaOrderDetail = {
            id: o.id,
            display_id: o.display_id ?? null,
            status: o.status ?? null,
            payment_status: o.payment_status ?? null,
            fulfillment_status: o.fulfillment_status ?? null,
            total: o.total ?? null,
            currency_code: o.currency_code ?? null,
            created_at: o.created_at ?? null,
            vendor: vendorLabel(o?.metadata?.vendor),
            is_event: !!o?.metadata?.event_id,
            event_id: typeof o?.metadata?.event_id === 'string' ? o.metadata.event_id : null,
            email: o.email ?? null,
            subtotal: o.item_subtotal ?? o.subtotal ?? null,
            shipping_total: o.shipping_total ?? null,
            tax_total: o.tax_total ?? null,
            discount_total: o.discount_total ?? null,
            items: (o.items ?? []).map((it: any) => ({
                id: it.id,
                title: it.title ?? it.product_title ?? null,
                quantity: it.quantity ?? null,
                unit_price: it.unit_price ?? null,
                thumbnail: it.thumbnail ?? null,
            })),
            shipping_address: mapAddress(o.shipping_address),
            shipping_methods: ((o.shipping_methods ?? []) as any[]).map((m) => ({
                id: m.id,
                name: m.name ?? null,
                amount: m.amount ?? null,
            })),
            payments,
            fulfillments: ((o.fulfillments ?? []) as any[]).map((f) => ({
                id: f.id,
                shipped_at: f.shipped_at ?? null,
                delivered_at: f.delivered_at ?? null,
                packed_at: f.packed_at ?? null,
                tracking: ((f.labels ?? []) as any[])
                    .map((l) => ({
                        number: l?.tracking_number ?? null,
                        url: l?.tracking_url ?? null,
                    }))
                    .filter((t) => t.number || t.url),
            })),
        };
        return { exchanged: true, order };
    } catch {
        return { exchanged: true, order: null, notFound: true };
    }
}

/** Plain-language explanation of a Medusa payment_status. */
export function paymentStatusCopy(status: string | null): { label: string; detail: string } {
    switch ((status ?? '').toLowerCase()) {
        case 'captured':
            return { label: 'Paid', detail: 'Payment captured — your card has been charged.' };
        case 'authorized':
            return {
                label: 'Payment authorized',
                detail: 'Your card is authorized and will be charged when the order ships.',
            };
        case 'partially_captured':
            return { label: 'Partially paid', detail: 'Part of this order has been charged.' };
        case 'partially_refunded':
            return { label: 'Partially refunded', detail: 'A partial refund was issued to your card.' };
        case 'refunded':
            return { label: 'Refunded', detail: 'This order was refunded to your original payment method.' };
        case 'canceled':
        case 'cancelled':
            return { label: 'Canceled', detail: 'Payment was canceled — no charge was made.' };
        case 'not_paid':
        case 'awaiting':
            return { label: 'Awaiting payment', detail: 'We have not received payment for this order yet.' };
        case 'requires_action':
            return { label: 'Action required', detail: 'Your payment needs an additional confirmation step.' };
        default:
            return { label: status ? status.replace(/_/g, ' ') : 'Unknown', detail: '' };
    }
}

/** Plain-language explanation of a Medusa fulfillment_status. */
export function fulfillmentStatusCopy(status: string | null): { label: string; detail: string } {
    switch ((status ?? '').toLowerCase()) {
        case 'not_fulfilled':
            return { label: 'Preparing', detail: 'The shop is getting your order ready.' };
        case 'fulfilled':
            return { label: 'Fulfilled', detail: 'Your order has been packed.' };
        case 'partially_fulfilled':
            return { label: 'Partially fulfilled', detail: 'Some items have been packed.' };
        case 'shipped':
            return { label: 'Shipped', detail: 'Your order is on the way.' };
        case 'partially_shipped':
            return { label: 'Partially shipped', detail: 'Some items are on the way.' };
        case 'delivered':
            return { label: 'Delivered', detail: 'Your order was delivered.' };
        case 'canceled':
        case 'cancelled':
            return { label: 'Canceled', detail: 'Fulfillment was canceled.' };
        default:
            return { label: status ? status.replace(/_/g, ' ') : 'Unknown', detail: '' };
    }
}


/** UNITY's dealer customer groups — membership IS the dealer grant. */
const DEALER_GROUPS = ['unity-dealer', 'unity-dealer-exclusive'];

export type DealerStatus = { signedIn: boolean; isDealer: boolean; tier: string | null };

/**
 * Is the signed-in member a UNITY dealer?
 *
 * Read from their Medusa customer GROUPS, which is where the dealer grant
 * actually lives — approving a dealer application adds them to unity-dealer or
 * unity-dealer-exclusive, and the price lists carry a customer_group_id rule.
 * There is no separate flag to trust.
 *
 * This is a UI mirror only. The backend refuses a dealer-only line whatever
 * this returns, so a wrong answer here is a cosmetic problem, never a hole.
 * Never throws: logged out, an expired token or a backend hiccup all resolve to
 * "not a dealer", which shows the retail view rather than an error page.
 */
export async function getDealerStatus(): Promise<DealerStatus> {
    const none: DealerStatus = { signedIn: false, isDealer: false, tier: null };
    try {
        // SIGNED IN means "has a platform session", NOT "has a Medusa
        // customer". A brand-new Rollout member has no Medusa customer until
        // their first cart action, so deriving it from the token exchange told
        // a signed-in person they were anonymous — which is how the canary saw
        // a signed-in non-dealer get the logged-out wording (2026-09-09).
        const supabase = await getSupabaseServer();
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const signedIn = !!session?.user;

        const token = await ensureMedusaCustomerToken();
        if (!token) return { ...none, signedIn };
        const res = await fetch(`${MEDUSA_URL}/store/customers/me?fields=groups.name`, {
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            cache: 'no-store',
        });
        if (!res.ok) return { ...none, signedIn };
        const json = await res.json();
        const names: string[] = (json?.customer?.groups ?? [])
            .map((g: any) => String(g?.name ?? ''))
            .filter(Boolean);
        const mine = names.filter((n) => DEALER_GROUPS.includes(n));
        return {
            signedIn,
            isDealer: mine.length > 0,
            tier: mine.includes('unity-dealer-exclusive')
                ? 'exclusive'
                : mine.includes('unity-dealer')
                  ? 'dealer'
                  : null,
        };
    } catch {
        return none;
    }
}
