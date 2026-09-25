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
 * The Medusa customer id (`cus_…`) behind an already-resolved store token —
 * used by /api/app/event-checkout/resume to look up the caller's own carts
 * via the ADMIN api (the store API has no "list my carts" endpoint). Returns
 * null on 401/404/network error, exactly like verifyMedusaToken below; never
 * throws.
 */
export async function getMedusaCustomerId(token: string): Promise<string | null> {
    try {
        const res = await fetch(`${MEDUSA_URL}/store/customers/me`, {
            method: 'GET',
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const json = await res.json().catch(() => null as any);
        const id = json?.customer?.id;
        return typeof id === 'string' && id ? id : null;
    } catch {
        return null;
    }
}

/**
 * True when a Medusa token resolves to a live, readable actor (GET
 * /store/customers/me succeeds). False on 401/404 AND on a network error —
 * callers that need to tell "not linked" apart from "network hiccup" use the
 * raw fetch instead; this is only for the bounded verify-before-trusting
 * passes in ensureMedusaCustomerToken.
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

type RelinkOutcome =
    /** {relinked:true, identity_deleted:true, cleared_customer_id} — the
     *  dangling auth identity itself was deleted server-side. */
    | { kind: 'deleted'; clearedCustomerId: string | null }
    /** {relinked:false, identity_missing:true} — the token's identity is
     *  already gone; nothing left to relink. */
    | { kind: 'identity-missing' }
    /** {relinked:false, customer_id:"cus_…"} — the linked customer is live.
     *  A no-op; the earlier 401/404 was transient. */
    | { kind: 'live'; customerId: string }
    /** {relinked:false, customer_id:null} — clean unregistered identity,
     *  never linked. */
    | { kind: 'clean' }
    /** HTTP 404 on the route itself — not deployed on this backend yet. */
    | { kind: 'not-deployed' }
    | { kind: 'failed' };

/**
 * POST /store/customers/relink with the CALLER's own current token
 * (unregistered or actor-scoped — whichever we have). The backend reads only
 * the caller's own auth context. See RelinkOutcome above for the response
 * shapes. Idempotent — safe to call again, but ensureMedusaCustomerToken
 * below bounds this to exactly one attempt per call.
 *
 * The route may not be deployed yet on every environment. A 404 STATUS here
 * means "cannot ask", NOT "no dangling link" — callers fall back to the
 * pre-relink create+re-exchange behaviour instead of treating it as a clean
 * bill of health.
 */
async function relinkCustomer(token: string): Promise<RelinkOutcome> {
    try {
        const res = await fetch(`${MEDUSA_URL}/store/customers/relink`, {
            method: 'POST',
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            cache: 'no-store',
        });
        if (res.status === 404) return { kind: 'not-deployed' };
        if (!res.ok) return { kind: 'failed' };
        const json = await res.json().catch(() => ({}) as any);
        if (json?.relinked === true) {
            return { kind: 'deleted', clearedCustomerId: json?.cleared_customer_id ?? null };
        }
        if (json?.identity_missing === true) return { kind: 'identity-missing' };
        if (typeof json?.customer_id === 'string' && json.customer_id) {
            return { kind: 'live', customerId: json.customer_id };
        }
        return { kind: 'clean' };
    } catch {
        return { kind: 'failed' };
    }
}

/**
 * True for the specific 500 the store owner traced: an admin customer
 * delete can leave the auth identity's app_metadata.customer_id DEFINED but
 * EMPTY, so the next exchange mints an unregistered token, GET
 * /store/customers/me 401s (no readable actor), and POST /store/customers
 * then 500s because Postgres sees the (empty but present) key as already
 * set. Treated as a second, reactive signal that a relink is needed — for
 * whichever call path did not already go through relinkCustomer this call.
 */
function isAlreadyExistsInAppMetadata(status: number, bodyText: string): boolean {
    return status === 500 && /already exists in app metadata/i.test(bodyText);
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
 * The pre-relink create+re-exchange behaviour, unchanged. Used only when the
 * relink route itself is not deployed (404) — so this app keeps working
 * against an older backend exactly as it did before the relink route existed.
 * A concurrent request may have created the customer first, and a dangling
 * identity (see ensureMedusaCustomerToken) 401s here too; either way we
 * re-exchange once and hand back whatever that resolves to.
 */
async function createAndLink(
    accessToken: string,
    token: string,
    user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
): Promise<string | null> {
    const { firstName, lastName } = nameParts(user);
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
            const retry = await authExchange(accessToken);
            return retry ?? token;
        }
    } catch {
        return token;
    }
    const actorToken = await authExchange(accessToken);
    return actorToken ?? token;
}

export type StoreUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };

/**
 * POST /store/customers with `tokenForCreate`, then re-exchange and verify
 * before handing a token back — never return one that will 401 downstream.
 *
 * `relinkUsedAlready` bounds the reactive relink below to firing AT MOST
 * ONCE more per top-level call: if create fails with the "already exists in
 * app metadata" 500 (the customer_id-defined-but-empty case) and it hasn't
 * fired yet, it fires now, then resolves through the same
 * handleRelinkOutcome switch as the proactive path — but that recursive call
 * is itself marked `isReactiveRetry`, so ITS 'clean' branch treats the
 * budget as spent too. Net effect: at most 2 relink HTTP calls total for
 * this scenario (the proactive diagnostic read + one reactive fix attempt),
 * never a 3rd, never a loop.
 */
async function createCustomerAndFinish(
    tokenForCreate: string,
    accessToken: string,
    user: StoreUser,
    uid: string | null,
    relinkUsedAlready: boolean,
): Promise<string | null> {
    const { firstName, lastName } = nameParts(user);
    let createOk = false;
    let alreadyExists = false;
    let createStatus = 0;
    try {
        const createRes = await fetch(`${MEDUSA_URL}/store/customers`, {
            method: 'POST',
            headers: pkHeaders({ Authorization: `Bearer ${tokenForCreate}` }),
            body: JSON.stringify({
                email: user.email ?? undefined,
                first_name: firstName,
                last_name: lastName,
                metadata: { supabase_user_id: user.id },
            }),
            cache: 'no-store',
        });
        createOk = createRes.ok;
        createStatus = createRes.status;
        if (!createOk) {
            const text = await createRes.text().catch(() => '');
            alreadyExists = isAlreadyExistsInAppMetadata(createRes.status, text);
        }
    } catch {
        return null;
    }

    if (!createOk) {
        if (alreadyExists && !relinkUsedAlready) {
            console.warn(
                `[medusa-customer] create 500 'already exists in app metadata' for member ${uid ?? 'unknown'} — treating as a dangling link the earlier relink read missed; relinking once more.`,
            );
            const outcome = await relinkCustomer(tokenForCreate);
            return handleRelinkOutcome(outcome, accessToken, tokenForCreate, user, uid, /* isReactiveRetry */ true);
        }
        console.error(
            `[medusa-customer] customer create failed (${createStatus}) for member ${uid ?? 'unknown'}${
                relinkUsedAlready ? ' (relink already attempted this call)' : ''
            } — refusing to proceed.`,
        );
        return null;
    }

    const actorToken = await authExchange(accessToken);
    if (!actorToken) return null;
    const ok = await verifyMedusaToken(actorToken);
    if (!ok) {
        console.error(
            `[medusa-customer] post-create token still does not resolve to a live actor for member ${uid ?? 'unknown'} — refusing to proceed.`,
        );
        return null;
    }
    console.log(`[medusa-customer] link established for member ${uid ?? 'unknown'}.`);
    return actorToken;
}

/**
 * Resolve a relinkCustomer() outcome per the required flow. `token` is the
 * pre-relink token (needed for the 'clean' branch, which creates with it
 * directly rather than re-exchanging first — there is no stale link to shed).
 *
 * `isReactiveRetry` is true only when THIS relink call was itself the one
 * reactive retry fired from createCustomerAndFinish's create-500 handling
 * (see there). It exists to keep 'clean' from re-opening the reactive budget
 * a second time — everything else already terminates the call outright
 * ('deleted'/'identity-missing' represent a real, backend-confirmed fix, so
 * they always spend the budget; 'not-deployed'/'failed'/'live' never reach
 * create at all).
 */
async function handleRelinkOutcome(
    outcome: RelinkOutcome,
    accessToken: string,
    token: string,
    user: StoreUser,
    uid: string | null,
    isReactiveRetry: boolean = false,
): Promise<string | null> {
    switch (outcome.kind) {
        case 'not-deployed':
            console.warn(
                `[medusa-customer] relink route not deployed yet for member ${uid ?? 'unknown'} — falling back to create+re-exchange.`,
            );
            return createAndLink(accessToken, token, user);

        case 'failed':
            console.error(`[medusa-customer] relink attempt failed for member ${uid ?? 'unknown'} — refusing to proceed.`);
            return null;

        case 'deleted':
        case 'identity-missing': {
            console.log(`[medusa-customer] relink outcome for member ${uid ?? 'unknown'}: ${outcome.kind}.`);
            // The provider mints a fresh (actor-less) identity on the next
            // exchange now that the dangling one is gone. This IS a
            // backend-confirmed fix, so it always spends the relink budget.
            const freshToken = await authExchange(accessToken);
            if (!freshToken) return null;
            return createCustomerAndFinish(freshToken, accessToken, user, uid, true);
        }

        case 'clean':
            console.log(`[medusa-customer] relink outcome for member ${uid ?? 'unknown'}: clean (never linked).`);
            // A 'clean' read is a diagnosis, not a corrective action — it did
            // not spend the budget UNLESS this was already the one reactive
            // retry, in which case it must (never a 3rd relink call).
            return createCustomerAndFinish(token, accessToken, user, uid, isReactiveRetry);

        case 'live': {
            console.log(
                `[medusa-customer] relink outcome for member ${uid ?? 'unknown'}: live customer ${outcome.customerId} — the earlier 401/404 was transient.`,
            );
            const reToken = await authExchange(accessToken);
            if (!reToken) return null;
            const ok = await verifyMedusaToken(reToken);
            if (ok) return reToken;
            console.error(
                `[medusa-customer] re-exchange for already-linked member ${uid ?? 'unknown'} still failed verify — refusing to proceed.`,
            );
            return null;
        }
    }
}

/**
 * Resolve the signed-in platform user to a linked Medusa customer, creating one
 * on first sight, and return an actor-scoped Medusa customer JWT. Mirrors the
 * NeferStock storefront's `loginWithSupabase` sequence (find-or-create), but is
 * fully best-effort: returns null when there is no session or any step fails, so
 * a caller can safely fall back to anonymous behaviour.
 *
 *   1. Exchange the platform JWT for a Medusa token (POST /auth/customer/supabase).
 *   2. GET /store/customers/me. Success → already linked, actor-scoped; return it.
 *   3. On 401 or 404, POST /store/customers/relink with that SAME (current)
 *      token, then branch on its outcome (handleRelinkOutcome, above):
 *        - deleted / identity-missing → re-exchange (fresh, actor-less) →
 *          create → re-exchange → verify. A backend-confirmed fix — the
 *          relink budget is spent, no further relink this call.
 *        - clean (customer_id null) → create directly with the current
 *          token → re-exchange → verify. A diagnostic read, not a fix — see
 *          step 4.
 *        - live (customer_id set) → the 401/404 was transient; re-exchange
 *          once and verify — no create.
 *        - relink route not deployed (404 status) → fall back to the
 *          pre-relink create+re-exchange behaviour (createAndLink) unchanged.
 *        - relink call itself fails → fail closed (null).
 *   4. A "already exists in app metadata" 500 from a create that followed a
 *      'clean' read is a second, reactive signal that the read missed a
 *      dangling link (customer_id defined-but-empty) — relinks ONE more
 *      time, then create → re-exchange → verify. Capped at 2 relink calls
 *      total for this call (1 diagnostic + 1 reactive fix); the reactive
 *      call's own outcome always spends the budget, so this can never loop.
 *
 * Any step failing → fail closed (null). Logs the member id + outcome only,
 * never a token.
 *
 * COOKIE-FREE CORE: ensureMedusaCustomerTokenForUser below takes the platform
 * access token + user explicitly (no SSR cookie read) so it can run from a
 * mobile bearer-token API route (resolveAppCaller in lib/app-auth.ts) as well
 * as from ensureMedusaCustomerToken()'s cookie session — both call this same
 * function, so the app and the web get identical link/relink behaviour.
 */
export async function ensureMedusaCustomerTokenForUser(
    accessToken: string,
    user: StoreUser,
): Promise<string | null> {
    if (!accessToken || !user) return null;

    // 1. Platform JWT → Medusa token (unregistered or actor — whichever the
    //    identity currently resolves to).
    const token = await authExchange(accessToken);
    if (!token) return null;

    // 2. Already linked? Then this token is actor-scoped and we're done.
    let linked: boolean;
    try {
        linked = await verifyMedusaToken(token);
    } catch {
        return token; // transient — use what we have rather than block the caller
    }
    if (linked) return token;

    // 3. 401/404 → ask the backend to relink (bounded to one call) and
    //    branch on what it reports. `user.id` IS the session's uid here (the
    //    caller resolved `user` from the same session/token), so this needs
    //    no extra cookie read for the log line.
    const outcome = await relinkCustomer(token);
    return handleRelinkOutcome(outcome, accessToken, token, user, user.id);
}

/**
 * Cookie-session wrapper around ensureMedusaCustomerTokenForUser — reads the
 * SSR cookie session and delegates. See that function's doc comment for the
 * full find-or-create/relink sequence; this is unchanged in behaviour from
 * before the core was extracted.
 */
export async function ensureMedusaCustomerToken(): Promise<string | null> {
    const supabase = await getSupabaseServer();
    const {
        data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const user = session?.user;
    if (!accessToken || !user) return null;
    return ensureMedusaCustomerTokenForUser(accessToken, user);
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
