/**
 * /me/events — a verified host's own events (no-shop community events).
 * Gated by requireVerifiedHost (non-hosts bounce to /me host onboarding).
 *
 * Glide (board: G3 web host console, "Your events"): the events table with the
 * All · Upcoming · Past filter. Same query.
 */
import { Plus } from 'lucide-react';
import { formatEventTime } from '@/lib/event-time';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCover, coverFocus } from '@/lib/event-covers';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';
import { Card, GlideButton } from '@/components/glide/primitives';
import { ConsoleHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import { EventsTable, type HostEventRow } from './EventsTable';

export const metadata = { title: 'My Events' };
export const dynamic = 'force-dynamic';

function fmt(iso: string | null, tz?: string | null): string {
    if (!iso) return 'TBA';
    try {
        return formatEventTime(iso, tz);
    } catch {
        return 'TBA';
    }
}

const VIS_LABEL: Record<string, string> = { public: 'Public', followers: 'Followers', private: 'Private' };

export default async function MyEventsPage() {
    const profile = await requireVerifiedHost('/me/events');
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .select('id, type, title, start_at, time_zone, location_name, hero_image_url, visibility, cancelled_at, attending_count')
        .eq('host_id', profile.profileId)
        .is('shop_id', null)
        .order('start_at', { ascending: false });
    if (error) console.error('[me/events] load failed:', error.message);
    const events = (data as any[]) ?? [];

    const now = Date.now();
    const rows: HostEventRow[] = events.map((e) => {
        const d = eventDateParts(e.start_at, e.time_zone);
        const past = e.start_at ? new Date(e.start_at).getTime() < now : false;
        const status: HostEventRow['status'] = e.cancelled_at ? 'cancelled' : past ? 'past' : 'live';
        return {
            id: e.id,
            title: e.title ?? 'Event',
            sub: [placeName(e.location_name) ?? 'TBA', eventTypeLabel(e.type)].join(' · '),
            cover: resolveCover(e.hero_image_url, e.type, e.id),
            coverPos: coverFocus(e.hero_image_url),
            date: d ? d.dayLabel : 'TBA',
            dateTitle: fmt(e.start_at, e.time_zone),
            status,
            statusLabel: status === 'cancelled' ? 'Cancelled' : status === 'past' ? 'Ended' : VIS_LABEL[e.visibility ?? 'public'] ?? 'Public',
            going: e.attending_count ?? 0,
            upcoming: !past && !e.cancelled_at,
        };
    });

    return (
        <div className={s.scope}>
            <ConsoleHead
                title="My events"
                actions={
                    <GlideButton href="/me/events/new" size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                        Host an event
                    </GlideButton>
                }
            />
            <Card as="section" aria-labelledby="ev-h" style={{ paddingBottom: rows.length ? 6 : 0 }}>
                <EventsTable rows={rows} />
            </Card>
        </div>
    );
}
