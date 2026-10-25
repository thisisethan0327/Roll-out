import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EventActions } from './EventActions';
import { ChevronRight } from 'lucide-react';
import { AdminHead, adminStyles as a } from '@/components/glide-admin/parts';

export const metadata = { title: 'Events' };

async function loadEvents() {
    const admin = getSupabaseAdmin();
    // shops must be disambiguated: event_cohosts added a second events<->shops
    // relationship, which makes a bare `shops(...)` embed ambiguous (PGRST201).
    const { data, error } = await admin
        .from('events')
        .select(
            `id, code, type, title, location_name, start_at, attending_count, capacity,
             is_official, visibility, cancelled_at, rsvp_mode,
             host:profiles!events_host_id_fkey(id, handle, display_name, kind),
             shop:shops!events_shop_id_fkey(id, slug, name)`,
        )
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) console.error('[admin/events] load failed:', error.message);
    return data ?? [];
}

export default async function EventsPage() {
    const items = await loadEvents();
    return (
        <>
            <AdminHead title="Events" sub={`${items.length} shown · last 200`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Title</th>
                            <th>Host</th>
                            <th>Shop</th>
                            <th>When</th>
                            <th>RSVPs</th>
                            <th>Flags</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="admin-empty">No events yet.</div>
                                </td>
                            </tr>
                        ) : (
                            items.map((e: any) => (
                                <tr key={e.id}>
                                    <td>
                                        <Link href={`/admin/events/${e.id}`} className={`text-link ${a.num}`}>
                                            {e.code}
                                        </Link>
                                    </td>
                                    <td>
                                        <Link href={`/admin/events/${e.id}`} className="text-link">
                                            {e.title}
                                        </Link>
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
                                                        Shop
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
                                    <td className={a.time}>
                                        {new Date(e.start_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td className={a.num}>
                                        {e.attending_count}
                                        {e.capacity ? ` / ${e.capacity}` : ''}
                                    </td>
                                    <td>
                                        <div className={a.chipRow}>
                                            {e.visibility === 'private' && <span className="admin-pill warn">Private</span>}
                                            {e.visibility === 'followers' && <span className="admin-pill">Followers</span>}
                                            {e.is_official && <span className="admin-pill gold">Official</span>}
                                            {e.cancelled_at && <span className="admin-pill warn">Cancelled</span>}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <Link href={`/admin/events/${e.id}`} className="admin-action-btn">
                                                Open <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                                            </Link>
                                            {!e.cancelled_at && (
                                                <EventActions
                                                    eventId={e.id}
                                                    eventTitle={e.title ?? ''}
                                                    isPaid={e.rsvp_mode === 'tiered' || e.rsvp_mode === 'paid'}
                                                />
                                            )}
                                        </div>
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
