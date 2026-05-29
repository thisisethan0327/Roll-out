import React from 'react';
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AppointmentActions } from './AppointmentActions';
import { RealtimeRefresh } from './RealtimeRefresh';

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

function pillClass(status: string): string {
    switch (status) {
        case 'pending':
            return 'admin-pill gold';
        case 'reschedule_requested':
            return 'admin-pill gold';
        case 'accepted':
            return 'admin-pill neon';
        case 'converted':
            return 'admin-pill neon';
        case 'declined':
        case 'cancelled':
            return 'admin-pill warn';
        default:
            return 'admin-pill';
    }
}

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

    const { data } = await q;
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

    return (
        <>
            <RealtimeRefresh shopId={shop.shopId} />
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">INBOX</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · APPOINTMENT REQUESTS
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/calendar`}
                    className="admin-action-btn"
                    style={{ textDecoration: 'none' }}
                >
                    CALENDAR ›
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="PENDING" value={data.pending} accent={data.pending > 0 ? 'gold' : undefined} />
                <Stat label="ACCEPTED / 7D" value={data.acceptedThisWeek} />
                <Stat label="THIS MONTH" value={data.thisMonth} />
            </div>

            {/* Status filter pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
                {STATUS_TABS.map((s) => {
                    const isActive = s === status;
                    const params = new URLSearchParams();
                    params.set('status', s);
                    if (q) params.set('q', q);
                    return (
                        <Link
                            key={s}
                            href={`/shop/${slug}/inbox?${params.toString()}`}
                            className={`admin-action-btn ${isActive ? '' : 'muted'}`}
                            style={{ textDecoration: 'none' }}
                        >
                            {s}
                        </Link>
                    );
                })}
            </div>

            <form className="admin-search" action={`/shop/${slug}/inbox`}>
                <input type="hidden" name="status" value={status} />
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH HANDLE, SERVICE OR NOTES"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>VEHICLE</th>
                            <th>PREFERRED</th>
                            <th>STATUS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">
                                        NO {status} REQUESTS.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.rows.map((a: any) => {
                                const fmt = (iso: string | null) =>
                                    iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
                                return (
                                    <React.Fragment key={a.id}>
                                        <tr>
                                            <td>{fmt(a.created_at)}</td>
                                            <td>
                                                <Link
                                                    href={`/shop/${slug}/customers/${a.requester_profile_id}`}
                                                    className="text-link"
                                                >
                                                    @{a.requester?.handle ?? '?'}
                                                </Link>
                                                <div className="admin-handle">
                                                    {a.requester?.display_name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="admin-pill">
                                                    {SERVICE_LABEL[a.service_type] ?? a.service_type}
                                                </span>
                                            </td>
                                            <td>
                                                {a.vehicle
                                                    ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim() || '—'
                                                    : '—'}
                                            </td>
                                            <td>{fmt(a.preferred_at)}</td>
                                            <td>
                                                <span className={pillClass(a.status)}>
                                                    {a.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <AppointmentActions
                                                    appointmentId={a.id}
                                                    shopId={shop.shopId}
                                                    status={a.status}
                                                />
                                            </td>
                                        </tr>
                                        {a.status === 'reschedule_requested' && (
                                            <tr className="admin-subrow">
                                                <td colSpan={7}>
                                                    <div className="admin-handle" style={{ paddingLeft: 8 }}>
                                                        RESCHEDULE: {fmt(a.previous_preferred_at)} → {fmt(a.preferred_at)}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
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
