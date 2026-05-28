import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Appointments' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'VINYL WRAP',
    PPF: 'PPF',
    TINT: 'WINDOW TINT',
    CERAMIC: 'CERAMIC',
    PARTS: 'PARTS / INSTALL',
    OTHER: 'OTHER',
};

const STATUS_CLASS: Record<string, string> = {
    pending: 'gold',
    accepted: 'neon',
    converted: 'neon',
    declined: 'warn',
    cancelled: '',
};

async function loadAppointments(status?: string) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('appointment_requests')
        .select(
            `id, shop_id, service_type, preferred_at, notes, status, created_at,
             shop:shops(id, slug, name),
             requester:profiles!appointment_requests_requester_profile_id_fkey(id, handle, display_name),
             vehicle:vehicles(year, make, model)`,
        )
        .order('created_at', { ascending: false })
        .limit(200);
    if (status && status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    return data ?? [];
}

export default async function AppointmentsPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const { status } = await searchParams;
    const current = status ?? 'all';
    const items = await loadAppointments(current);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">APPOINTMENTS</div>
                    <div className="admin-page-sub">
                        ALL SHOPS · {items.length} SHOWN · {current.toUpperCase()}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {(['all', 'pending', 'accepted', 'declined', 'cancelled'] as const).map(
                    (s) => (
                        <a
                            key={s}
                            href={`/admin/appointments?status=${s}`}
                            className={`admin-action-btn ${current === s ? '' : 'muted'}`}
                            style={{ textDecoration: 'none' }}
                        >
                            {s.toUpperCase()}
                        </a>
                    ),
                )}
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>SHOP</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>VEHICLE</th>
                            <th>PREFERRED</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NONE</div>
                                </td>
                            </tr>
                        ) : (
                            items.map((a: any) => (
                                <tr key={a.id}>
                                    <td>
                                        {new Date(a.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        {a.shop && (
                                            <a href={`/admin/shops/${a.shop.id}`} className="text-link">
                                                @{a.shop.slug}
                                            </a>
                                        )}
                                    </td>
                                    <td>
                                        {a.requester && (
                                            <a href={`/admin/users?q=${a.requester.handle}`} className="text-link">
                                                @{a.requester.handle}
                                            </a>
                                        )}
                                        <div className="admin-handle">{a.requester?.display_name}</div>
                                    </td>
                                    <td>
                                        <span className="admin-pill">
                                            {SERVICE_LABEL[a.service_type] ?? a.service_type}
                                        </span>
                                    </td>
                                    <td>
                                        {a.vehicle
                                            ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim()
                                            : '—'}
                                    </td>
                                    <td>{a.preferred_at ?? '—'}</td>
                                    <td>
                                        <span className={`admin-pill ${STATUS_CLASS[a.status] ?? ''}`}>
                                            {a.status.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
