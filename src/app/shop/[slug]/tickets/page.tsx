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
import { Plus, Wrench } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { GlideButton } from '@/components/glide/primitives';
import { Counts, EmptyRow, FilterTabs, SearchBar, StatusChip, cx, fmtDay, fmtWhen, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Tickets' };

// Keys match the public.tickets `tickets_status_check` DB constraint.
type StatusKey =
    | 'all'
    | 'quote'
    | 'estimate'
    | 'pending'
    | 'in-progress'
    | 'completed'
    | 'cancelled';

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'quote', label: 'Quote' },
    { key: 'estimate', label: 'Estimate' },
    { key: 'pending', label: 'Pending' },
    { key: 'in-progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
];

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

    const { data, error } = await query;
    if (error) console.error('[shop/tickets] loadTickets failed:', error.message);
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

    const filterHref = (key: StatusKey) => {
        const params = new URLSearchParams();
        if (key !== 'all') params.set('status', key);
        if (q) params.set('q', q);
        return `/shop/${slug}/tickets${params.toString() ? `?${params.toString()}` : ''}`;
    };

    return (
        <div className={sh.stack}>
            <ConsoleHead
                title="Tickets"
                sub={`${shop.name} · ${tickets.length} shown`}
                actions={
                    <GlideButton href={`/shop/${slug}/tickets/new`} size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                        New ticket
                    </GlideButton>
                }
            />

            <Counts
                label="Ticket counts"
                items={[
                    { label: 'Total tickets', value: stats.total },
                    { label: 'Active', value: stats.active, dot: stats.active > 0 },
                    { label: 'New, last 7 days', value: stats.thisWeek },
                    { label: 'Completed this month', value: stats.completedThisMonth },
                ]}
            />

            <div className={sh.toolbar}>
                <FilterTabs
                    label="Ticket status"
                    items={STATUS_FILTERS.map((f) => ({ href: filterHref(f.key), label: f.label, active: status === f.key }))}
                />
                <SearchBar
                    action={`/shop/${slug}/tickets`}
                    defaultValue={q}
                    label="Search tickets"
                    placeholder="Search ticket ID, customer or vehicle"
                    hidden={{ status: status !== 'all' ? status : undefined }}
                    clearHref={q ? `/shop/${slug}/tickets${status !== 'all' ? `?status=${status}` : ''}` : null}
                />
            </div>

            <section className="g-card" aria-label="Tickets">
                <div className={sh.tblWrap}>
                    <table className={cx(sh.tbl, sh.rowLink)}>
                        <thead>
                            <tr>
                                <th>Ticket</th>
                                <th>Customer</th>
                                <th>Vehicle</th>
                                <th>Status</th>
                                <th className={sh.r}>Total</th>
                                <th>Service day</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.length === 0 ? (
                                <EmptyRow
                                    colSpan={7}
                                    icon={<Wrench size={18} strokeWidth={2} />}
                                    title={q || status !== 'all' ? 'No tickets match' : 'No tickets yet'}
                                    search={q || undefined}
                                />
                            ) : (
                                tickets.map((t: any) => {
                                    const vehicle = [t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ');
                                    return (
                                        <tr key={t.id}>
                                            <td>
                                                <Link href={`/shop/${slug}/tickets/${t.id}`} className={cx(sh.stretch, sh.code)}>
                                                    {t.ticket_id ?? '—'}
                                                </Link>
                                            </td>
                                            <td>
                                                {t.customer_name ?? '—'}
                                                {t.email && <small>{t.email}</small>}
                                            </td>
                                            <td data-label="Vehicle">{vehicle || '—'}</td>
                                            <td>
                                                <StatusChip status={t.status} />
                                            </td>
                                            <td className={cx(sh.r, sh.num)} data-label="Total">
                                                {t.total_price != null ? `$${Number(t.total_price).toFixed(2)}` : '—'}
                                            </td>
                                            <td className={sh.when} data-label="Service day">
                                                {t.service_day ? fmtDay(t.service_day) : '—'}
                                            </td>
                                            <td className={cx(sh.when, sh.mHide)}>{fmtWhen(t.created_at, false)}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
