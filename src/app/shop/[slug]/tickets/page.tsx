/**
 * /shop/[slug]/tickets — list of public.tickets scoped to this shop.
 *
 * Filters: `?status=<value>` and `?q=<search>` against ticket_id, customer
 * name, and car make/model. Top stat tiles aggregate counts across all-time
 * for the shop (independent of the visible filter).
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Tickets' };

type StatusKey = 'all' | 'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'new', label: 'NEW' },
    { key: 'scheduled', label: 'SCHEDULED' },
    { key: 'in_progress', label: 'IN PROGRESS' },
    { key: 'completed', label: 'COMPLETED' },
    { key: 'cancelled', label: 'CANCELLED' },
];

function statusPillVariant(status: string | null): '' | 'gold' | 'neon' | 'warn' {
    const s = (status ?? '').toLowerCase();
    if (s === 'new') return 'gold';
    if (s === 'in_progress' || s === 'scheduled') return 'neon';
    if (s === 'cancelled' || s === 'awaiting_parts' || s === 'awaiting_payment') return 'warn';
    return '';
}

async function loadStats(shopId: number) {
    const pub = getSupabasePublicAdmin();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const monthStart = new Date(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        1,
    ).toISOString();

    const [totalRes, activeRes, weekRes, monthDoneRes] = await Promise.all([
        pub.from('tickets').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
        pub
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .not('status', 'in', '("completed","cancelled")'),
        pub
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .gte('created_at', since7d),
        pub
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'completed')
            .gte('updated_at', monthStart),
    ]);

    return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        thisWeek: weekRes.count ?? 0,
        completedThisMonth: monthDoneRes.count ?? 0,
    };
}

async function loadTickets(shopId: number, status: StatusKey, q: string) {
    const pub = getSupabasePublicAdmin();
    let query = pub
        .from('tickets')
        .select(
            'id, ticket_id, customer_name, email, phone, car_year, car_make, car_model, status, total_price, service_day, created_at',
        )
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (status !== 'all') {
        query = query.eq('status', status);
    }
    if (q) {
        const safe = q.replace(/[%,]/g, ' ').trim();
        if (safe) {
            // ticket_id prefix + ilikes on name/make/model.
            query = query.or(
                `ticket_id.ilike.${safe}%,customer_name.ilike.%${safe}%,car_make.ilike.%${safe}%,car_model.ilike.%${safe}%`,
            );
        }
    }

    const { data } = await query;
    return (data as any[]) ?? [];
}

export default async function TicketsListPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ status?: string; q?: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    const sp = await searchParams;
    const rawStatus = (sp.status ?? 'all').toLowerCase();
    const status: StatusKey = (STATUS_FILTERS.find((s) => s.key === rawStatus)?.key ??
        'all') as StatusKey;
    const q = (sp.q ?? '').trim();

    const [stats, tickets] = await Promise.all([
        loadStats(shop.shopId),
        loadTickets(shop.shopId, status, q),
    ]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">TICKETS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {tickets.length} SHOWN
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/tickets/new`}
                    className="admin-action-btn"
                    style={{ textDecoration: 'none' }}
                >
                    + NEW TICKET
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="TOTAL TICKETS" value={stats.total} />
                <Stat label="ACTIVE" value={stats.active} accent={stats.active > 0 ? 'gold' : undefined} />
                <Stat label="NEW / 7D" value={stats.thisWeek} />
                <Stat label="COMPLETED THIS MONTH" value={stats.completedThisMonth} />
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    margin: '16px 0 12px',
                }}
            >
                {STATUS_FILTERS.map((f) => {
                    const params = new URLSearchParams();
                    if (f.key !== 'all') params.set('status', f.key);
                    if (q) params.set('q', q);
                    const href = `/shop/${slug}/tickets${params.toString() ? `?${params.toString()}` : ''}`;
                    const active = status === f.key;
                    return (
                        <Link
                            key={f.key}
                            href={href}
                            className={`admin-pill ${active ? 'gold' : ''}`}
                            style={{ textDecoration: 'none', cursor: 'pointer' }}
                        >
                            {f.label}
                        </Link>
                    );
                })}
            </div>

            <form className="admin-search" action={`/shop/${slug}/tickets`}>
                {status !== 'all' && <input type="hidden" name="status" value={status} />}
                <input
                    name="q"
                    defaultValue={q}
                    className="admin-search-input"
                    placeholder="SEARCH TICKET ID, CUSTOMER, OR VEHICLE"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
                {q && (
                    <Link
                        href={`/shop/${slug}/tickets${status !== 'all' ? `?status=${status}` : ''}`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        CLEAR
                    </Link>
                )}
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>TICKET ID</th>
                            <th>CUSTOMER</th>
                            <th>VEHICLE</th>
                            <th>STATUS</th>
                            <th style={{ textAlign: 'right' }}>TOTAL</th>
                            <th>SERVICE DAY</th>
                            <th>CREATED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NO TICKETS YET</div>
                                </td>
                            </tr>
                        ) : (
                            tickets.map((t: any) => {
                                const vehicle = [t.car_year, t.car_make, t.car_model]
                                    .filter(Boolean)
                                    .join(' ');
                                return (
                                    <tr key={t.id}>
                                        <td>
                                            <Link
                                                href={`/shop/${slug}/tickets/${t.id}`}
                                                className="text-link"
                                                style={{ fontFamily: 'var(--font-mono, monospace)' }}
                                            >
                                                {t.ticket_id ?? '—'}
                                            </Link>
                                        </td>
                                        <td>
                                            {t.customer_name ?? '—'}
                                            {t.email && (
                                                <div className="admin-handle">{t.email}</div>
                                            )}
                                        </td>
                                        <td>{vehicle || '—'}</td>
                                        <td>
                                            <span
                                                className={`admin-pill ${statusPillVariant(t.status)}`}
                                            >
                                                {(t.status ?? '—').toString().toUpperCase()}
                                            </span>
                                        </td>
                                        <td
                                            style={{
                                                textAlign: 'right',
                                                fontFamily: 'var(--font-mono, monospace)',
                                            }}
                                        >
                                            {t.total_price != null
                                                ? `$${Number(t.total_price).toFixed(2)}`
                                                : '—'}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                            {t.service_day ?? '—'}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                            {new Date(t.created_at)
                                                .toISOString()
                                                .slice(0, 10)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
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
