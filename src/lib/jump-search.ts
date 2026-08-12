/**
 * JUMP — universal search for the god console (Console Phase C3 · §3.4 layer ③).
 *
 * One query, fanned out across every operational store the console reaches, then
 * grouped into deep-linked hits. Server-only; runs behind requirePlatformAdmin
 * (the route handler + the /admin/search page both gate before calling here).
 *
 * Design rules, matched to the review:
 *   • PER-SOURCE FAILURE TOLERANCE — every source is its own try/catch and
 *     carries its own `error`; one dead source (Medusa down, stale RPC) renders
 *     an empty group with a note, never a broken search.
 *   • ≤5 hits per group; sources run in parallel.
 *   • SEED EXCLUSION — seed-% shop slugs, KYC shop 15, [SEED] events, and
 *     Medusa seed/KYC orders are filtered out so only real signal surfaces.
 *   • Cross-app hits (EMWRAPS app.emwraps.net, Medusa api.neferstock.com) are
 *     flagged `external` so the UI opens them in a new tab; rollout-native hits
 *     (/u, /post, /event, /admin/shops) navigate in place.
 *
 * Deep-link shapes (verified against each app's routes):
 *   customers → https://app.emwraps.net/customers/<id>   (tickets app /customers/:id)
 *   tickets   → https://app.emwraps.net/tickets/<id>      (tickets app /tickets/:id)
 *   users     → /u/<handle>                               (+ alt /admin/users?q=)
 *   shops     → /admin/shops/<id>
 *   posts     → /post/<id>
 *   events    → /event/<id>
 *   orders    → <MEDUSA_URL>/app/orders/<id>              (Medusa admin)
 *   products  → /store/p/<handle>                         (+ alt Medusa admin)
 */
import 'server-only';
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';
import { MEDUSA_URL } from './medusa';
import { searchAdminOrders, searchAdminProducts } from './medusa-admin';

const TICKETS_APP = 'https://app.emwraps.net';
const KYC_TEST_SHOP_ID = 15;
const MIN_QUERY = 2;
const PER_GROUP = 5;

export type JumpHit = {
    id: string;
    title: string;
    subtitle?: string | null;
    badge?: string | null;
    href: string;
    external?: boolean;
    /** Secondary link (e.g. Medusa admin for a storefront product). */
    altHref?: string | null;
    altLabel?: string | null;
};

export type JumpGroup = {
    key: string;
    label: string;
    hits: JumpHit[];
    error: string | null;
};

export type JumpResults = {
    query: string;
    groups: JumpGroup[];
    total: number;
    tookMs: number;
};

/**
 * Sanitise a term for a PostgREST `.or()` filter: commas separate OR clauses,
 * parens group them, and `%`/`*`/`\` are wildcards — a raw one breaks the
 * filter, so strip them to a plain substring. (Single-column `.ilike()` calls
 * tolerate commas, but we normalise everywhere for one code path.)
 */
function likeTerm(q: string): string {
    return q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function money(total: number | null, currency: string | null): string {
    if (total == null) return '';
    // Medusa totals are already in major units for these stores.
    const n = Number(total);
    const cur = (currency ?? 'usd').toUpperCase();
    return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── sources ──────────────────────────────────────────────────────────────────

async function searchCustomers(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'customers', label: 'CUSTOMERS', hits: [], error: null };
    try {
        const { data, error } = await getSupabasePublicAdmin()
            .from('customers')
            .select('id, name, email, phone, company')
            .or(`name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%,company.ilike.%${t}%`)
            .order('created_at', { ascending: false })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((c: any) => ({
            id: c.id,
            title: c.name || c.company || c.email || 'Customer',
            subtitle: [c.email, c.phone].filter(Boolean).join(' · ') || null,
            href: `${TICKETS_APP}/customers/${c.id}`,
            external: true,
        }));
    } catch (e: any) {
        base.error = e?.message ?? 'Customer search unavailable.';
    }
    return base;
}

async function searchTickets(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'tickets', label: 'TICKETS', hits: [], error: null };
    try {
        const { data, error } = await getSupabasePublicAdmin()
            .from('tickets')
            .select('id, ticket_id, customer_name, car_make, car_model, status')
            .or(
                `ticket_id.ilike.%${t}%,customer_name.ilike.%${t}%,car_make.ilike.%${t}%,car_model.ilike.%${t}%`,
            )
            .order('created_at', { ascending: false })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((tk: any) => ({
            id: tk.id,
            title: tk.ticket_id || tk.customer_name || 'Ticket',
            subtitle:
                [tk.customer_name, [tk.car_make, tk.car_model].filter(Boolean).join(' ').trim()]
                    .filter(Boolean)
                    .join(' · ') || null,
            badge: tk.status ? String(tk.status).toUpperCase() : null,
            href: `${TICKETS_APP}/tickets/${tk.id}`,
            external: true,
        }));
    } catch (e: any) {
        base.error = e?.message ?? 'Ticket search unavailable.';
    }
    return base;
}

async function searchUsers(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'users', label: 'ROLLOUT USERS', hits: [], error: null };
    try {
        const { data, error } = await getSupabaseAdmin()
            .from('profiles')
            .select('id, handle, display_name, kind, is_verified')
            .neq('kind', 'shop_page')
            .or(`handle.ilike.%${t}%,display_name.ilike.%${t}%`)
            .order('created_at', { ascending: false })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((p: any) => ({
            id: p.id,
            title: p.display_name || p.handle,
            subtitle: `@${p.handle}`,
            badge: p.is_verified ? 'VERIFIED' : null,
            href: `/u/${p.handle}`,
            altHref: `/admin/users?q=${encodeURIComponent(p.handle)}`,
            altLabel: 'ADMIN',
        }));
    } catch (e: any) {
        base.error = e?.message ?? 'User search unavailable.';
    }
    return base;
}

async function searchShops(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'shops', label: 'SHOPS', hits: [], error: null };
    try {
        const { data, error } = await getSupabaseAdmin()
            .from('shops')
            .select('id, slug, name, region')
            .not('slug', 'ilike', 'seed-%')
            .neq('id', KYC_TEST_SHOP_ID)
            .or(`name.ilike.%${t}%,slug.ilike.%${t}%`)
            .order('id', { ascending: true })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((s: any) => ({
            id: String(s.id),
            title: s.name || s.slug,
            subtitle: [s.slug, s.region].filter(Boolean).join(' · ') || null,
            href: `/admin/shops/${s.id}`,
        }));
    } catch (e: any) {
        base.error = e?.message ?? 'Shop search unavailable.';
    }
    return base;
}

async function searchPosts(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'posts', label: 'POSTS', hits: [], error: null };
    try {
        const { data, error } = await getSupabaseAdmin()
            .from('posts')
            .select('id, body, type, created_at')
            .is('deleted_at', null)
            .ilike('body', `%${t}%`)
            .order('created_at', { ascending: false })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((p: any) => {
            const body = String(p.body ?? '').replace(/\s+/g, ' ').trim();
            return {
                id: p.id,
                title: body.slice(0, 70) || '(no text)',
                subtitle: p.type ? String(p.type).toUpperCase() : null,
                href: `/post/${p.id}`,
            };
        });
    } catch (e: any) {
        base.error = e?.message ?? 'Post search unavailable.';
    }
    return base;
}

async function searchEvents(t: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'events', label: 'EVENTS', hits: [], error: null };
    try {
        const { data, error } = await getSupabaseAdmin()
            .from('events')
            .select('id, code, title, location_name, start_at')
            .not('title', 'ilike', '[SEED]%')
            .ilike('title', `%${t}%`)
            .order('start_at', { ascending: false })
            .limit(PER_GROUP);
        if (error) throw error;
        base.hits = (data ?? []).map((e: any) => ({
            id: e.id,
            title: e.title,
            subtitle: [e.code, e.location_name].filter(Boolean).join(' · ') || null,
            href: `/event/${e.id}`,
        }));
    } catch (e: any) {
        base.error = e?.message ?? 'Event search unavailable.';
    }
    return base;
}

async function searchOrders(raw: string): Promise<JumpGroup | null> {
    // Only worth a Medusa round-trip when the query is a display_id (numeric) or
    // an email — Medusa `q` matches exactly those. Anything else skips the group.
    const isNumeric = /^\s*#?\d+\s*$/.test(raw);
    const isEmail = raw.includes('@');
    if (!isNumeric && !isEmail) return null;
    const base: JumpGroup = { key: 'orders', label: 'ORDERS', hits: [], error: null };
    const { orders, error } = await searchAdminOrders(raw.replace('#', ''));
    base.error = error;
    base.hits = orders.map((o) => ({
        id: o.id,
        title: `#${o.display_id ?? '—'}`,
        subtitle:
            [o.email, money(o.total, o.currency_code)].filter(Boolean).join(' · ') || null,
        badge: o.fulfillment_status
            ? String(o.fulfillment_status).replace(/_/g, ' ').toUpperCase()
            : o.status
              ? String(o.status).toUpperCase()
              : null,
        href: `${MEDUSA_URL}/app/orders/${o.id}`,
        external: true,
    }));
    return base;
}

async function searchProducts(raw: string): Promise<JumpGroup> {
    const base: JumpGroup = { key: 'products', label: 'PRODUCTS', hits: [], error: null };
    const { products, error } = await searchAdminProducts(raw);
    base.error = error;
    base.hits = products.map((p) => ({
        id: p.id,
        title: p.title || p.handle || 'Product',
        subtitle: p.handle ? `/${p.handle}` : null,
        badge: p.status ? String(p.status).toUpperCase() : null,
        // Primary: storefront product page (in-app). Alt: Medusa admin.
        href: p.handle ? `/store/p/${p.handle}` : `${MEDUSA_URL}/app/products/${p.id}`,
        external: !p.handle,
        altHref: `${MEDUSA_URL}/app/products/${p.id}`,
        altLabel: 'ADMIN',
    }));
    return base;
}

// ── entrypoint ───────────────────────────────────────────────────────────────

export async function jumpSearch(query: string): Promise<JumpResults> {
    const started = Date.now();
    const raw = (query ?? '').trim();
    if (raw.length < MIN_QUERY) {
        return { query: raw, groups: [], total: 0, tookMs: 0 };
    }
    const t = likeTerm(raw);
    if (!t) return { query: raw, groups: [], total: 0, tookMs: Date.now() - started };

    // Fan out; each source already swallows its own failure.
    const settled = await Promise.all([
        searchCustomers(t),
        searchTickets(t),
        searchOrders(raw), // uses raw (numeric/email detection)
        searchProducts(raw),
        searchUsers(t),
        searchShops(t),
        searchPosts(t),
        searchEvents(t),
    ]);

    const groups = settled.filter((g): g is JumpGroup => g != null);
    const total = groups.reduce((n, g) => n + g.hits.length, 0);
    return { query: raw, groups, total, tookMs: Date.now() - started };
}
