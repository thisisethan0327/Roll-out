'use server';
/**
 * Event announcements — server actions for the shop event page.
 *
 * Permission model (checked here, server side; client-sent ids are only
 * LOOKUP KEYS, never trusted for authority):
 *   1. resolve the event (or the announcement's event) from the database;
 *   2. requireShopMember(event.shop_id): the caller must belong to the event's
 *      HOST shop (platform admins pass through as 'owner');
 *   3. allowed when the role is owner / admin / manager, OR the caller is the
 *      event's host profile (events.host_id).
 * Co-host shops and installers cannot post. shop_id is stamped from the event
 * and created_by from the session profile.
 */
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AnnouncementInput } from '@/lib/announcements-core';
import {
    deleteAnnouncement,
    insertAnnouncement,
    loadAnnouncementRow,
    patchAnnouncement,
    setPublished,
    type WriteResult,
} from '@/lib/announcements-write';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const NOT_ALLOWED: WriteResult = { ok: false, error: 'Only the host, or an owner / admin / manager of the hosting shop, can post announcements.' };

type Ctx = { eventId: string; shopId: number | null; profileId: string };

async function guardEvent(eventId: string): Promise<Ctx | WriteResult> {
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, error: 'Event not found.' };
    const { data: ev } = await getSupabaseAdmin()
        .from('events')
        .select('id, shop_id, host_id')
        .eq('id', eventId)
        .maybeSingle();
    if (!ev) return { ok: false, error: 'Event not found.' };
    const shopId = (ev as any).shop_id as number | null;
    if (shopId == null) return NOT_ALLOWED; // no hosting shop → console path doesn't apply
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role) && (ev as any).host_id !== profile.profileId) return NOT_ALLOWED;
    return { eventId, shopId, profileId: profile.profileId };
}

function isCtx(x: Ctx | WriteResult): x is Ctx {
    return (x as Ctx).profileId !== undefined;
}

export async function createEventAnnouncementAction(eventId: string, input: AnnouncementInput): Promise<WriteResult> {
    const g = await guardEvent(eventId);
    if (!isCtx(g)) return g;
    return insertAnnouncement({ scope: 'event', eventId, shopId: g.shopId, createdBy: g.profileId, input });
}

/** Loads the announcement, then authorises against ITS event (not a client id). */
async function guardAnnouncement(id: string) {
    const row = await loadAnnouncementRow(id);
    if (!row || row.scope !== 'event' || !row.eventId) return { error: { ok: false, error: 'Announcement not found.' } as WriteResult };
    const g = await guardEvent(row.eventId);
    if (!isCtx(g)) return { error: g };
    return { row };
}

export async function updateEventAnnouncementAction(id: string, input: AnnouncementInput): Promise<WriteResult> {
    const r = await guardAnnouncement(id);
    if (r.error) return r.error;
    return patchAnnouncement(r.row, input);
}

export async function setEventAnnouncementPublishedAction(id: string, published: boolean): Promise<WriteResult> {
    const r = await guardAnnouncement(id);
    if (r.error) return r.error;
    return setPublished(r.row, !!published);
}

export async function deleteEventAnnouncementAction(id: string): Promise<WriteResult> {
    const r = await guardAnnouncement(id);
    if (r.error) return r.error;
    return deleteAnnouncement(r.row);
}
