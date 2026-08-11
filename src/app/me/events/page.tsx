/**
 * /me/events — a verified host's own events (no-shop community events).
 * Gated by requireVerifiedHost (non-hosts bounce to /me host onboarding).
 */
import Link from 'next/link';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCover } from '@/lib/event-covers';

export const metadata = { title: 'My Events' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'Night Run',
    CAR_MEET: 'Car Meet',
    TRACK_DAY: 'Track Day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

function fmt(iso: string | null): string {
    if (!iso) return 'TBA';
    try {
        return new Date(iso).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Los_Angeles',
        }) + ' PT';
    } catch {
        return 'TBA';
    }
}

export default async function MyEventsPage() {
    const profile = await requireVerifiedHost('/me/events');
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select('id, type, title, start_at, location_name, hero_image_url, visibility, cancelled_at, attending_count')
        .eq('host_id', profile.profileId)
        .is('shop_id', null)
        .order('start_at', { ascending: false });
    const events = (data as any[]) ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1, color: 'var(--text)' }}>
                        MY EVENTS
                    </div>
                    <div className="text-dim" style={{ fontSize: 12 }}>
                        Events you host on Rollout (no shop attached)
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href="/me" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>‹ MY ROLLOUT</Link>
                    <Link href="/me/events/new" className="admin-action-btn" style={{ textDecoration: 'none' }}>+ HOST EVENT</Link>
                </div>
            </div>

            {events.length === 0 ? (
                <div className="admin-empty">You haven’t hosted any events yet. Create your first one.</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {events.map((e) => (
                        <Link
                            key={e.id}
                            href={`/me/events/${e.id}`}
                            className="feature-card"
                            style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    aspectRatio: '16 / 9',
                                    background: `url(${resolveCover(e.hero_image_url, e.type, e.id)}) center/cover no-repeat`,
                                    borderBottom: '1px solid var(--line)',
                                    filter: e.cancelled_at ? 'grayscale(0.6)' : undefined,
                                    opacity: e.cancelled_at ? 0.6 : 1,
                                }}
                            />
                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div className="mono-row" style={{ fontSize: 10 }}>
                                    <span className="accent">{TYPE_LABEL[e.type] ?? e.type}</span>
                                    <span className="sep" />
                                    <span>{(e.visibility ?? 'public').toUpperCase()}</span>
                                    {e.cancelled_at ? (<><span className="sep" /><span style={{ color: 'var(--danger,#d33)' }}>CANCELLED</span></>) : null}
                                </div>
                                <div style={{ fontSize: 16, letterSpacing: 0.4, color: 'var(--text)' }}>{e.title}</div>
                                <div className="text-dim" style={{ fontSize: 12 }}>{fmt(e.start_at)} · {e.location_name ?? 'TBA'}</div>
                                <div className="mono-row" style={{ fontSize: 10, marginTop: 4 }}>
                                    <span><span className="accent">●</span> {e.attending_count ?? 0} GOING</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
