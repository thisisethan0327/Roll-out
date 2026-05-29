import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Customers' };

type Source = 'all' | 'rollout' | 'legacy';

const PAGE_LIMIT = 50;

/**
 * Load both customer surfaces in parallel.
 *
 * Rollout members are anyone with at least one appointment_request at this
 * shop. We resolve the distinct requester profile_ids first, then fetch their
 * profile rows (with an optional name/handle ilike) and finally re-count their
 * appointment_requests at this shop for the badge column.
 *
 * Legacy customers come from public.customers but are scoped to this shop by
 * way of public.tickets.shop_id — there's no shop_id column on the legacy
 * customers table itself.
 */
async function loadCustomers(shopId: number, q: string | undefined, source: Source) {
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const needle = (q ?? '').trim();

    const doRollout = source === 'all' || source === 'rollout';
    const doLegacy = source === 'all' || source === 'legacy';

    // -- Rollout side ------------------------------------------------
    // First: distinct requester_profile_ids for this shop.
    const rolloutPromise = (async () => {
        if (!doRollout) {
            return {
                rows: [] as any[],
                totalDistinct: 0,
                newThisWeek: 0,
            };
        }
        const { data: apptRows } = await admin
            .from('appointment_requests')
            .select('requester_profile_id, created_at')
            .eq('shop_id', shopId)
            .limit(5000);
        const allIds = Array.from(
            new Set((apptRows ?? []).map((r: any) => r.requester_profile_id).filter(Boolean)),
        ) as string[];

        if (allIds.length === 0) {
            return { rows: [], totalDistinct: 0, newThisWeek: 0 };
        }

        // Pull the profiles, optionally filtered by name/handle.
        let profQ = admin
            .from('profiles')
            .select('id, handle, display_name, location, created_at, kind, avatar_url')
            .in('id', allIds)
            .eq('kind', 'user')
            .order('created_at', { ascending: false });
        if (needle) {
            // No phone/email on rollout.profiles — match on handle+display_name.
            profQ = profQ.or(
                `handle.ilike.%${needle}%,display_name.ilike.%${needle}%`,
            );
        }
        const { data: profiles } = await profQ.limit(PAGE_LIMIT + 1);
        const profRows = (profiles ?? []) as any[];

        // Per-profile appointment count at this shop.
        const counts = new Map<string, number>();
        for (const r of apptRows ?? []) {
            const id = (r as any).requester_profile_id;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }

        const newThisWeek = profRows.filter(
            (p) => p.created_at && p.created_at >= since7d,
        ).length;

        return {
            rows: profRows.map((p) => ({
                ...p,
                appt_count: counts.get(p.id) ?? 0,
            })),
            totalDistinct: allIds.length,
            newThisWeek,
        };
    })();

    // -- Legacy side -------------------------------------------------
    const legacyPromise = (async () => {
        if (!doLegacy) {
            return {
                rows: [] as any[],
                totalDistinct: 0,
                newThisWeek: 0,
            };
        }
        // Distinct customer_ids who have tickets at this shop.
        const { data: ticketRows } = await pub
            .from('tickets')
            .select('customer_id, created_at')
            .eq('shop_id', shopId)
            .not('customer_id', 'is', null)
            .limit(10_000);
        const allIds = Array.from(
            new Set((ticketRows ?? []).map((r: any) => r.customer_id).filter(Boolean)),
        ) as string[];

        if (allIds.length === 0) {
            return { rows: [], totalDistinct: 0, newThisWeek: 0 };
        }

        let custQ = pub
            .from('customers')
            .select(
                'id, first_name, last_name, name, email, phone, company, created_at',
            )
            .in('id', allIds)
            .order('created_at', { ascending: false });
        if (needle) {
            custQ = custQ.or(
                `name.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%`,
            );
        }
        const { data: customers } = await custQ.limit(PAGE_LIMIT + 1);
        const custRows = (customers ?? []) as any[];

        // Tickets per customer at this shop.
        const counts = new Map<string, number>();
        for (const r of ticketRows ?? []) {
            const id = (r as any).customer_id;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }

        const newThisWeek = custRows.filter(
            (c) => c.created_at && c.created_at >= since7d,
        ).length;

        return {
            rows: custRows.map((c) => ({
                ...c,
                ticket_count: counts.get(c.id) ?? 0,
            })),
            totalDistinct: allIds.length,
            newThisWeek,
        };
    })();

    const [rollout, legacy] = await Promise.all([rolloutPromise, legacyPromise]);
    return { rollout, legacy };
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toISOString().slice(0, 10);
}

function fmtName(c: any) {
    if (c.name && String(c.name).trim()) return c.name;
    const fn = c.first_name ?? '';
    const ln = c.last_name ?? '';
    const joined = `${fn} ${ln}`.trim();
    return joined || c.email || c.phone || '—';
}

export default async function ShopCustomersPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ q?: string; source?: string }>;
}) {
    const { slug } = await params;
    const { q, source } = await searchParams;
    const { shop } = await requireShopMemberBySlug(slug);

    const src: Source =
        source === 'rollout' || source === 'legacy' ? source : 'all';
    const { rollout, legacy } = await loadCustomers(shop.shopId, q, src);

    const total = rollout.totalDistinct + legacy.totalDistinct;
    const newThisWeek = rollout.newThisWeek + legacy.newThisWeek;

    const rolloutHasMore = rollout.rows.length > PAGE_LIMIT;
    const legacyHasMore = legacy.rows.length > PAGE_LIMIT;
    const rolloutVisible = rollout.rows.slice(0, PAGE_LIMIT);
    const legacyVisible = legacy.rows.slice(0, PAGE_LIMIT);

    const showRollout = src === 'all' || src === 'rollout';
    const showLegacy = src === 'all' || src === 'legacy';

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">CUSTOMERS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · UNIFIED CONTACT BOOK
                    </div>
                </div>
            </div>

            <div className="admin-stat-grid">
                <Stat label="TOTAL" value={total} />
                <Stat label="ROLLOUT" value={rollout.totalDistinct} />
                <Stat label="LEGACY" value={legacy.totalDistinct} />
                <Stat
                    label="NEW · 7D"
                    value={newThisWeek}
                    accent={newThisWeek > 0 ? 'gold' : undefined}
                />
            </div>

            <form
                className="admin-search"
                action={`/shop/${slug}/customers`}
                style={{ marginTop: 16 }}
            >
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH NAME · EMAIL · PHONE · HANDLE"
                />
                {/* preserve the active source pill on submit */}
                <input type="hidden" name="source" value={src} />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <SourcePill slug={slug} q={q} value="all" active={src} label="ALL" />
                <SourcePill
                    slug={slug}
                    q={q}
                    value="rollout"
                    active={src}
                    label="ROLLOUT"
                />
                <SourcePill
                    slug={slug}
                    q={q}
                    value="legacy"
                    active={src}
                    label="LEGACY"
                />
            </div>

            {showRollout && (
                <>
                    <div
                        className="admin-page-head"
                        style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0 }}
                    >
                        <div>
                            <div className="admin-page-title" style={{ fontSize: 14 }}>
                                ROLLOUT MEMBERS
                            </div>
                            <div className="admin-page-sub">
                                {rolloutVisible.length} SHOWN · {rollout.totalDistinct} TOTAL
                            </div>
                        </div>
                    </div>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>HANDLE</th>
                                    <th>NAME</th>
                                    <th>LOCATION</th>
                                    <th>JOINED</th>
                                    <th style={{ textAlign: 'right' }}>APPTS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rolloutVisible.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="admin-empty">
                                                NO ROLLOUT MEMBERS MATCH
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    rolloutVisible.map((p: any) => (
                                        <tr key={p.id}>
                                            <td>
                                                <Link
                                                    href={`/shop/${slug}/customers/r-${p.id}`}
                                                    style={{
                                                        color: 'var(--gold)',
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    @{p.handle ?? '—'}
                                                </Link>
                                            </td>
                                            <td>
                                                {p.display_name ?? '—'}
                                            </td>
                                            <td>
                                                <span className="admin-handle">
                                                    {p.location ?? '—'}
                                                </span>
                                            </td>
                                            <td>{fmtDate(p.created_at)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className="admin-pill">
                                                    {p.appt_count}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {rolloutHasMore && (
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                            <Link
                                href={`/shop/${slug}/customers?source=rollout${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                                className="admin-action-btn muted"
                                style={{ textDecoration: 'none' }}
                            >
                                VIEW MORE ›
                            </Link>
                        </div>
                    )}
                </>
            )}

            {showLegacy && (
                <>
                    <div
                        className="admin-page-head"
                        style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0 }}
                    >
                        <div>
                            <div className="admin-page-title" style={{ fontSize: 14 }}>
                                LEGACY CUSTOMERS · EMWRAPS
                            </div>
                            <div className="admin-page-sub">
                                {legacyVisible.length} SHOWN · {legacy.totalDistinct} TOTAL
                            </div>
                        </div>
                    </div>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>NAME</th>
                                    <th>EMAIL</th>
                                    <th>PHONE</th>
                                    <th>JOINED</th>
                                    <th style={{ textAlign: 'right' }}>TICKETS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {legacyVisible.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="admin-empty">
                                                NO LEGACY CUSTOMERS MATCH
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    legacyVisible.map((c: any) => (
                                        <tr key={c.id}>
                                            <td>
                                                <Link
                                                    href={`/shop/${slug}/customers/l-${c.id}`}
                                                    style={{
                                                        color: 'var(--gold)',
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    {fmtName(c)}
                                                </Link>
                                                {c.company ? (
                                                    <div className="admin-handle">
                                                        {c.company}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td>
                                                <span className="admin-handle">
                                                    {c.email ?? '—'}
                                                </span>
                                            </td>
                                            <td>{c.phone ?? '—'}</td>
                                            <td>{fmtDate(c.created_at)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className="admin-pill">
                                                    {c.ticket_count}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {legacyHasMore && (
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                            <Link
                                href={`/shop/${slug}/customers?source=legacy${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                                className="admin-action-btn muted"
                                style={{ textDecoration: 'none' }}
                            >
                                VIEW MORE ›
                            </Link>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className={`admin-stat-num ${accent ?? ''}`}>{value}</div>
        </div>
    );
}

function SourcePill({
    slug,
    q,
    value,
    active,
    label,
}: {
    slug: string;
    q: string | undefined;
    value: Source;
    active: Source;
    label: string;
}) {
    const isActive = value === active;
    const params = new URLSearchParams();
    if (value !== 'all') params.set('source', value);
    if (q) params.set('q', q);
    const qs = params.toString();
    const href = `/shop/${slug}/customers${qs ? `?${qs}` : ''}`;
    return (
        <Link
            href={href}
            className={`admin-pill ${isActive ? 'gold' : ''}`}
            style={{
                textDecoration: 'none',
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.6,
            }}
        >
            {label}
        </Link>
    );
}
