import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AdminHead, Tabs, adminStyles as st, sentence } from '@/components/glide-admin/parts';

export const metadata = { title: 'Appointments' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'Vinyl wrap',
    PPF: 'PPF',
    TINT: 'Window tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts / install',
    OTHER: 'Other',
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
    const { data, error } = await q;
    if (error) console.error('[admin/appointments] load failed:', error.message);
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
            <AdminHead
                title="Appointments"
                sub={`${items.length} shown${current === 'all' ? '' : ` · ${current}`}`}
            />

            <Tabs
                label="Filter by status"
                items={(['all', 'pending', 'accepted', 'declined', 'cancelled'] as const).map((s) => ({
                    href: `/admin/appointments?status=${s}`,
                    label: sentence(s),
                    current: current === s,
                }))}
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Requested</th>
                            <th>Shop</th>
                            <th>Customer</th>
                            <th>Service</th>
                            <th>Vehicle</th>
                            <th>Preferred</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">No appointment requests here.</div>
                                </td>
                            </tr>
                        ) : (
                            items.map((a: any) => (
                                <tr key={a.id}>
                                    <td className={st.time}>
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
                                            {sentence(a.status)}
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
