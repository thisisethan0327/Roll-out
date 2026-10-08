/**
 * Announcements — write side shared by the shop-console and platform-admin
 * server actions (server only).
 *
 * This module does NOT authorise: callers must have passed their guard
 * (requireShopMember + role / host check, or requirePlatformAdmin) and pass the
 * event/shop ids they derived SERVER-SIDE. It only validates input and writes
 * with the service role.
 */
import 'server-only';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from './supabase/admin';
import {
    ANNOUNCEMENT_COLUMNS,
    rowToAnnouncement,
    validateAnnouncementInput,
    type Announcement,
    type AnnouncementInput,
} from './announcements-core';

export type WriteResult = { ok: true; announcement?: Announcement } | { ok: false; error: string };

const TABLE_MISSING = /does not exist|schema cache|42P01|PGRST205/i;

function dbError(error: { code?: string; message: string }): WriteResult {
    if (TABLE_MISSING.test(`${error.code ?? ''} ${error.message}`)) {
        return { ok: false, error: 'Announcements are not enabled yet (database migration pending).' };
    }
    console.error('[announcements] write failed:', error.message);
    return { ok: false, error: 'Could not save the announcement. Try again.' };
}

/** Pages that render announcements; revalidated after every write. */
export function revalidateAnnouncementSurfaces(opts: { eventId?: string | null; scope: 'site' | 'event' }) {
    revalidatePath('/');
    revalidatePath('/meets');
    if (opts.scope === 'event' && opts.eventId) revalidatePath(`/event/${opts.eventId}`);
}

export async function insertAnnouncement(args: {
    scope: 'site' | 'event';
    eventId: string | null;
    shopId: number | null;
    createdBy: string;
    input: AnnouncementInput;
}): Promise<WriteResult> {
    if (args.scope === 'event' && !args.eventId) return { ok: false, error: 'Missing event.' };
    const v = validateAnnouncementInput(args.input);
    if (!v.ok) return v;
    const { data, error } = await getSupabaseAdmin()
        .from('announcements')
        .insert({
            scope: args.scope,
            event_id: args.scope === 'event' ? args.eventId : null,
            shop_id: args.shopId,
            created_by: args.createdBy,
            published: true,
            ...v.value,
        })
        .select(ANNOUNCEMENT_COLUMNS)
        .single();
    if (error) return dbError(error);
    revalidateAnnouncementSurfaces({ scope: args.scope, eventId: args.eventId });
    return { ok: true, announcement: rowToAnnouncement(data) };
}

export async function loadAnnouncementRow(id: string): Promise<Announcement | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await getSupabaseAdmin()
        .from('announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
    if (error || !data) return null;
    return rowToAnnouncement(data);
}

export async function patchAnnouncement(existing: Announcement, input: AnnouncementInput): Promise<WriteResult> {
    const v = validateAnnouncementInput(input);
    if (!v.ok) return v;
    const { data, error } = await getSupabaseAdmin()
        .from('announcements')
        .update(v.value)
        .eq('id', existing.id)
        .select(ANNOUNCEMENT_COLUMNS)
        .single();
    if (error) return dbError(error);
    revalidateAnnouncementSurfaces({ scope: existing.scope, eventId: existing.eventId });
    return { ok: true, announcement: rowToAnnouncement(data) };
}

export async function setPublished(existing: Announcement, published: boolean): Promise<WriteResult> {
    const { error } = await getSupabaseAdmin().from('announcements').update({ published }).eq('id', existing.id);
    if (error) return dbError(error);
    revalidateAnnouncementSurfaces({ scope: existing.scope, eventId: existing.eventId });
    return { ok: true };
}

export async function deleteAnnouncement(existing: Announcement): Promise<WriteResult> {
    const { error } = await getSupabaseAdmin().from('announcements').delete().eq('id', existing.id);
    if (error) return dbError(error);
    revalidateAnnouncementSurfaces({ scope: existing.scope, eventId: existing.eventId });
    return { ok: true };
}

/** All announcements (any state) for one event, newest first. Console use. */
export async function listEventAnnouncementsForConsole(eventId: string): Promise<Announcement[]> {
    const { data, error } = await getSupabaseAdmin()
        .from('announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .eq('scope', 'event')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) {
        if (!TABLE_MISSING.test(`${error.code ?? ''} ${error.message}`)) {
            console.error('[announcements] console list failed:', error.message);
        }
        return [];
    }
    return ((data as any[]) ?? []).map(rowToAnnouncement);
}
