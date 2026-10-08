/**
 * Announcements — read side (server only).
 *
 * Site-scope and the "which events have an update" lookup use a COOKIE-LESS
 * anon client, so the announcements_public_read RLS policy does the time
 * filtering (and hides announcements of events the public cannot see) and the
 * caller pages keep their ISR cache (getSupabaseServer would call cookies()
 * and force the home page dynamic). The per-event read uses the service role
 * because the event page has ALREADY authorised the viewer (private events,
 * invite tokens) and RLS would hide an invitee's announcements from anon.
 *
 * Every read also re-filters in code (isLive) so a stale cache or clock skew
 * cannot show an expired notice, and EVERY read swallows errors and returns
 * empty: migration 090 may lag the deploy ("relation does not exist"), and an
 * announcement problem must never break a page.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase/admin';
import {
    ANNOUNCEMENT_COLUMNS,
    isLive,
    rowToAnnouncement,
    sortAnnouncements,
    type Announcement,
} from './announcements-core';

let anon: SupabaseClient<any, any, any> | null = null;
function getAnon(): SupabaseClient<any, any, any> | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    if (!anon) {
        anon = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: 'rollout' as any },
        }) as SupabaseClient<any, any, any>;
    }
    return anon;
}

/** Test seam: a stub client can be passed to every helper. */
type Reader = Pick<SupabaseClient<any, any, any>, 'from'>;

const MISSING_TABLE = /does not exist|schema cache|42P01|PGRST205/i;

function logUnlessMissing(where: string, error: { code?: string; message: string }) {
    if (!MISSING_TABLE.test(`${error.code ?? ''} ${error.message}`)) {
        console.error(`[announcements] ${where} read failed:`, error.message);
    }
}

export async function getSiteAnnouncements(client?: Reader | null): Promise<Announcement[]> {
    try {
        const c = client ?? getAnon();
        if (!c) return [];
        const { data, error } = await c
            .from('announcements')
            .select(ANNOUNCEMENT_COLUMNS)
            .eq('scope', 'site')
            .eq('published', true)
            .order('starts_at', { ascending: false })
            .limit(10);
        if (error) {
            logUnlessMissing('site', error);
            return [];
        }
        return sortAnnouncements(((data as any[]) ?? []).map(rowToAnnouncement).filter((a) => isLive(a)));
    } catch (e: any) {
        console.error('[announcements] site read threw:', e?.message ?? e);
        return [];
    }
}

/** Caller must have authorised the viewer for this event already. */
export async function getEventAnnouncements(eventId: string, client?: Reader | null): Promise<Announcement[]> {
    try {
        const c = client ?? getSupabaseAdmin();
        const { data, error } = await c
            .from('announcements')
            .select(ANNOUNCEMENT_COLUMNS)
            .eq('scope', 'event')
            .eq('event_id', eventId)
            .eq('published', true)
            .order('starts_at', { ascending: false })
            .limit(10);
        if (error) {
            logUnlessMissing('event', error);
            return [];
        }
        return sortAnnouncements(((data as any[]) ?? []).map(rowToAnnouncement).filter((a) => isLive(a)));
    } catch (e: any) {
        console.error('[announcements] event read threw:', e?.message ?? e);
        return [];
    }
}

/**
 * Ids (of the given events) that have at least one live event-scope
 * announcement: ONE query for the whole list, used for the UPDATE pill.
 * Anon client: RLS already restricts to events the public can see.
 */
export async function getEventIdsWithAnnouncements(eventIds: string[], client?: Reader | null): Promise<Set<string>> {
    const out = new Set<string>();
    if (eventIds.length === 0) return out;
    try {
        const c = client ?? getAnon();
        if (!c) return out;
        const { data, error } = await c
            .from('announcements')
            .select('event_id, published, starts_at, ends_at')
            .eq('scope', 'event')
            .eq('published', true)
            .in('event_id', eventIds);
        if (error) {
            logUnlessMissing('badge', error);
            return out;
        }
        for (const r of (data as any[]) ?? []) {
            if (r.event_id && isLive({ published: !!r.published, startsAt: r.starts_at, endsAt: r.ends_at ?? null })) {
                out.add(r.event_id);
            }
        }
    } catch {
        /* never break the page */
    }
    return out;
}
