/**
 * Server-side reads of rollout.event_teasers (migrations 088/089) — the
 * "visible but locked" face of private and followers-only events: title, date,
 * host, a general area and a fuzzed pin, and nothing else.
 *
 * Every read here FAILS SOFT. Until the migrations land the view does not
 * exist; any error is treated as "no teasers", which is exactly today's
 * behaviour (non-public events simply are not listed, and 404 on their page).
 *
 * Pure formatting lives in lib/event-teaser-format.ts.
 */
import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getRolloutMemberClient } from '@/lib/consumer';
import { parseTeaserRow, type EventTeaser } from '@/lib/event-teaser-format';

/** The view's columns minus viewer_can_view (meaningless under service role). */
const TEASER_COLS =
    'id, code, type, title, start_at, time_zone, visibility, host_handle, host_name, host_kind, host_is_verified, shop_name, shop_slug, general_area, approx_lat, approx_lng';

let warned = false;
function warnOnce(where: string, message: string) {
    // One line per process: before 088 lands this fires on every request.
    if (warned) return;
    warned = true;
    console.warn(`[event-teasers] ${where} unavailable (fail-soft, showing no teasers): ${message}`);
}

/**
 * The teaser row for ONE event, or null when there is none (public, unknown,
 * cancelled, past) or the view is not deployed yet. Read with the service-role
 * client so it works for signed-out viewers; only teaser columns are selected.
 */
export const fetchEventTeaser = cache(async (eventId: string): Promise<EventTeaser | null> => {
    try {
        const { data, error } = await getSupabaseAdmin()
            .from('event_teasers')
            .select(TEASER_COLS)
            .eq('id', eventId)
            .maybeSingle();
        if (error) {
            warnOnce('fetchEventTeaser', error.message);
            return null;
        }
        return parseTeaserRow(data);
    } catch (err) {
        warnOnce('fetchEventTeaser', String((err as any)?.message ?? err));
        return null;
    }
});

/**
 * Upcoming teasers for /meets and the meets map, read with the VIEWER's
 * session client so viewer_can_view reflects who is looking (anon → false).
 * Cached per request so the list and the map loader share one round-trip.
 */
export const loadUpcomingTeasers = cache(async (type: string | null): Promise<EventTeaser[]> => {
    try {
        const member = await getRolloutMemberClient();
        let q = member
            .from('event_teasers')
            .select(`${TEASER_COLS}, viewer_can_view`)
            .gte('start_at', new Date().toISOString())
            .order('start_at', { ascending: true })
            .limit(60);
        if (type) q = q.eq('type', type);
        const { data, error } = await q;
        if (error) {
            warnOnce('loadUpcomingTeasers', error.message);
            return [];
        }
        return ((data as any[]) ?? []).map(parseTeaserRow).filter((t): t is EventTeaser => !!t);
    } catch (err) {
        warnOnce('loadUpcomingTeasers', String((err as any)?.message ?? err));
        return [];
    }
});
