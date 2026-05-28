import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EventActions } from './EventActions';

export const metadata = { title: 'Events' };

async function loadEvents() {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select(
            `id, code, type, title, location_name, start_at, attending_count, capacity,
             is_official, visibility, cancelled_at,
             host:profiles!events_host_id_fkey(id, handle, display_name, kind),
             shop:shops(id, slug, name)`,
        )
        .order('created_at', { ascending: false })
        .limit(200);
    return data ?? [];
}

export default async function EventsPage() {
    const items = await loadEvents();
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">EVENTS</div>
                    <div className="admin-page-sub">
                        ALL EVENTS · {items.length} SHOWN (LAST 200)
                    </div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>CODE</th>
                            <th>TITLE</th>
                            <th>HOST</th>
                            <th>SHOP</th>
                            <th>WHEN</th>
                            <th>RSVPS</th>
                            <th>FLAGS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="admin-empty">NO EVENTS</div>
                                </td>
                            </tr>
                        ) : (
                            items.map((e: any) => (
                                <tr key={e.id}>
                                    <td>{e.code}</td>
                                    <td>
                                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                                            {e.title}
                                        </div>
                                        <div className="admin-handle">{e.location_name}</div>
                                    </td>
                                    <td>
                                        {e.host && (
                                            <>
                                                <a href={`/admin/users?q=${e.host.handle}`} className="text-link">
                                                    @{e.host.handle}
                                                </a>
                                                {e.host.kind === 'shop_page' && (
                                                    <span className="admin-pill gold" style={{ marginLeft: 6 }}>
                                                        SHOP
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </td>
                                    <td>
                                        {e.shop && (
                                            <a href={`/admin/shops/${e.shop.id}`} className="text-link">
                                                @{e.shop.slug}
                                            </a>
                                        )}
                                    </td>
                                    <td>
                                        {new Date(e.start_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        {e.attending_count}
                                        {e.capacity ? ` / ${e.capacity}` : ''}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {e.is_official && <span className="admin-pill gold">OFFICIAL</span>}
                                            {e.cancelled_at && <span className="admin-pill warn">CANCELLED</span>}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {!e.cancelled_at && <EventActions eventId={e.id} />}
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
