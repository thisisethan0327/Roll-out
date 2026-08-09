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
 *   4. Re-exchange to obtain the now actor-scoped token and return it.
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
    try {
        const meRes = await fetch(`${MEDUSA_URL}/store/customers/me`, {
            method: 'GET',
            headers: pkHeaders({ Authorization: `Bearer ${token}` }),
            cache: 'no-store',
        });
        if (meRes.ok) return token;
        // 401/404 = authenticated identity with no linked customer yet → create.
    } catch {
        return token; // transient — use what we have rather than block the caller
    }

    // 3. Create + link the Medusa customer with the registration-scoped token.
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
            // A concurrent request may have created it first — re-exchange to
            // pick up the now-linked (actor-scoped) token either way.
            const retry = await authExchange(accessToken);
            return retry ?? token;
        }
    } catch {
        return token;
    }

    // 4. Re-exchange → actor-scoped customer token now that the link exists.
    const actorToken = await authExchange(accessToken);
    return actorToken ?? token;
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
            vendor: o?.metadata?.vendor ?? null,
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
