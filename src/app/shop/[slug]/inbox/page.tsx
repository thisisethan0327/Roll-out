import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AppointmentActions } from './AppointmentActions';
import { RealtimeRefresh } from './RealtimeRefresh';
import { CalendarDays, Inbox } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { Counts, EmptyRow, FilterTabs, SearchBar, StatusChip, cx, fmtWhen, initials, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Inbox' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'Vinyl Wrap',
    PPF: 'PPF',
    TINT: 'Window Tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts/Install',
    OTHER: 'Other',
};

const STATUS_TABS = [
    'ALL',
    'PENDING',
    'ACCEPTED',
    'RESCHEDULE_REQUESTED',
    'DECLINED',
    'CANCELLED',
    'CONVERTED',
] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const TAB_LABEL: Record<StatusTab, string> = {
    ALL: 'All',
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    RESCHEDULE_REQUESTED: 'Reschedule',
    DECLINED: 'Declined',
    CANCELLED: 'Cancelled',
    CONVERTED: 'Converted',
};

const STATUS_LABEL: Record<string, string> = {
    reschedule_requested: 'New time asked',
};

async function loadInbox(shopId: number, status: StatusTab, query?: string) {
    const admin = getSupabaseAdmin();

    // Counts for the stat row + filter pills
    const sinceWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);

    const [pendingC, acceptedWeekC, monthC] = await Promise.all([
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'pending'),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'accepted')
            .gte('accepted_at', sinceWeek),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .gte('created_at', startMonth.toISOString()),
    ]);

    let q = admin
        .from('appointment_requests')
        .select(
            `id, shop_id, service_type, preferred_at, previous_preferred_at, notes, status, created_at, accepted_at, declined_at, cancelled_at, requester_profile_id,
              requester:profiles!appointment_requests_requester_profile_id_fkey(handle, display_name),
              vehicle:vehicles(year, make, model)`,
        )
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(200);

    if (status !== 'ALL') {
        q = q.eq('status', status.toLowerCase());
    }

    if (query) {
        // Search by service_type, notes — handle search needs separate handling
        // because requester is a join. We OR on locally-available columns.
        const safe = query.replace(/[%_]/g, ' ');
        q = q.or(`service_type.ilike.%${safe}%,notes.ilike.%${safe}%`);
    }

    const { data, error } = await q;
    if (error) console.error('[shop/inbox] loadInbox failed:', error.message);
    let rows = (data as any[]) ?? [];

    // Post-filter by requester handle if the OR didn't catch it. Keeps the
    // search bar useful for "@somehandle" without complicating the SQL.
    if (query) {
        const needle = query.toLowerCase();
        rows = rows.filter(
            (r) =>
                (r.service_type ?? '').toLowerCase().includes(needle) ||
                (r.notes ?? '').toLowerCase().includes(needle) ||
                (r.requester?.handle ?? '').toLowerCase().includes(needle) ||
                (r.requester?.display_name ?? '').toLowerCase().includes(needle),
        );
    }

    return {
        pending: pendingC.count ?? 0,
        acceptedThisWeek: acceptedWeekC.count ?? 0,
        thisMonth: monthC.count ?? 0,
        rows,
    };
}

export default async function ShopInboxPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ status?: string; q?: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    const { status: rawStatus, q } = await searchParams;

    const statusUpper = (rawStatus ?? 'PENDING').toUpperCase();
    const status: StatusTab = (STATUS_TABS as readonly string[]).includes(statusUpper)
        ? (statusUpper as StatusTab)
        : 'PENDING';

    const data = await loadInbox(shop.shopId, status, q);

    const tabHref = (t: StatusTab) => {
        const params = new URLSearchParams();
        params.set('status', t);
        if (q) params.set('q', q);
        return `/shop/${slug}/inbox?${params.toString()}`;
    };
    const vehicleOf = (a: any) =>
        a.vehicle ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim() || '—' : '—';

    return (
        <div className={sh.stack}>
            <RealtimeRefresh shopId={shop.shopId} />
            <ConsoleHead
                title="Inbox"
                sub={`${shop.name} · appointment requests`}
                actions={
                    <Link href={`/shop/${slug}/calendar`} className={cx('g-sec', sh.sec)}>
                        <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                        Calendar
                    </Link>
                }
            />

            <Counts
                label="Request counts"
                items={[
                    { label: 'Pending', value: data.pending, dot: data.pending > 0 },
                    { label: 'Accepted, last 7 days', value: data.acceptedThisWeek },
                    { label: 'This month', value: data.thisMonth },
                ]}
            />

            <div className={sh.toolbar}>
                <FilterTabs
                    label="Request status"
                    items={STATUS_TABS.map((t) => ({ href: tabHref(t), label: TAB_LABEL[t], active: t === status }))}
                />
                <SearchBar
                    action={`/shop/${slug}/inbox`}
                    defaultValue={q ?? ''}
                    label="Search requests"
                    placeholder="Search handle, service or notes"
                    hidden={{ status }}
                    clearHref={q ? `/shop/${slug}/inbox?status=${status}` : null}
                />
            </div>

            <section className="g-card" aria-label="Appointment requests">
                <div className={sh.tblWrap}>
                    <table className={sh.tbl}>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Service</th>
                                <th>Vehicle</th>
                                <th>Preferred</th>
                                <th>Status</th>
                                <th>Received</th>
                                <th className={sh.r}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.length === 0 ? (
                                <EmptyRow
                                    colSpan={7}
                                    icon={<Inbox size={18} strokeWidth={2} />}
                                    title={status === 'ALL' ? 'No requests yet' : `No ${TAB_LABEL[status].toLowerCase()} requests`}
                                    body="Booking requests from your shop page land here. New ones appear without a reload."
                                />
                            ) : (
                                data.rows.map((a: any) => (
                                    <tr key={a.id}>
                                        <td>
                                            <span className={sh.cell}>
                                                <span className={sh.av} aria-hidden="true">
                                                    {initials(a.requester?.display_name ?? a.requester?.handle)}
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <Link
                                                        href={`/shop/${slug}/customers/${a.requester_profile_id}`}
                                                        className="text-link"
                                                    >
                                                        @{a.requester?.handle ?? '?'}
                                                    </Link>
                                                    <small>{a.requester?.display_name}</small>
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            <span className="g-chip">{SERVICE_LABEL[a.service_type] ?? a.service_type}</span>
                                        </td>
                                        <td data-label="Vehicle">{vehicleOf(a)}</td>
                                        <td data-label="Preferred" className={sh.when}>
                                            {fmtWhen(a.preferred_at)}
                                            {a.status === 'reschedule_requested' ? (
                                                <small>
                                                    Moved from {fmtWhen(a.previous_preferred_at)}
                                                </small>
                                            ) : null}
                                        </td>
                                        <td>
                                            <StatusChip status={a.status} label={STATUS_LABEL[a.status]} />
                                        </td>
                                        <td data-label="Received" className={cx(sh.when, sh.mHide)}>
                                            {fmtWhen(a.created_at)}
                                        </td>
                                        <td className={cx(sh.r, sh.mEnd)}>
                                            <AppointmentActions
                                                appointmentId={a.id}
                                                shopId={shop.shopId}
                                                status={a.status}
                                                handle={a.requester?.handle ?? null}
                                            />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
