/**
 * Server-side "may the current viewer see this non-public event?" check,
 * shared by the /event/[id] layout (which owns the 404 status, see its header)
 * and the page. The rule itself lives in lib/event-visibility.ts (pure).
 * Public events never reach this — callers short-circuit on visibility.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile } from '@/lib/consumer';
import { canViewEvent } from '@/lib/event-visibility';

export type EventVisibilityRow = {
    id: string;
    visibility: string | null;
    host_id: string | null;
    shop_id: number | null;
};

export async function viewerCanSeeNonPublicEvent(ev: EventVisibilityRow): Promise<boolean> {
    const me = await getConsumerProfile();
    if (!me) {
        return canViewEvent({
            visibility: ev.visibility,
            viewer: null,
            hostId: ev.host_id,
            shopRole: null,
            isAdmin: false,
            hasRsvp: false,
        });
    }

    const admin = getSupabaseAdmin();
    const [{ data: padmin }, { data: mem }, { data: rsvp }] = await Promise.all([
        admin.from('platform_admins').select('profile_id').eq('profile_id', me.profileId).maybeSingle(),
        ev.shop_id != null
            ? admin.from('shop_memberships').select('role').eq('profile_id', me.profileId).eq('shop_id', ev.shop_id).maybeSingle()
            : Promise.resolve({ data: null } as { data: null }),
        admin.from('event_rsvps').select('profile_id').eq('event_id', ev.id).eq('profile_id', me.profileId).maybeSingle(),
    ]);

    return canViewEvent({
        visibility: ev.visibility,
        viewer: { profileId: me.profileId },
        hostId: ev.host_id,
        shopRole: (mem as any)?.role ?? null,
        isAdmin: !!padmin,
        hasRsvp: !!rsvp,
    });
}
