'use server';
/**
 * Platform-admin announcement actions (site-wide or any event). Every action
 * re-checks requirePlatformAdmin(); ids from the client are lookup keys only.
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
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

export async function createAnnouncementAdminAction(payload: {
    scope: 'site' | 'event';
    eventId: string | null;
    input: AnnouncementInput;
}): Promise<WriteResult> {
    const { profile } = await requirePlatformAdmin();
    let shopId: number | null = null;
    if (payload.scope === 'event') {
        if (!payload.eventId || !/^[0-9a-f-]{36}$/i.test(payload.eventId)) return { ok: false, error: 'Pick an event.' };
        const { data: ev } = await getSupabaseAdmin().from('events').select('id, shop_id').eq('id', payload.eventId).maybeSingle();
        if (!ev) return { ok: false, error: 'Event not found.' };
        shopId = (ev as any).shop_id ?? null;
    } else if (payload.scope !== 'site') {
        return { ok: false, error: 'Unknown scope.' };
    }
    return insertAnnouncement({
        scope: payload.scope,
        eventId: payload.scope === 'event' ? payload.eventId : null,
        shopId,
        createdBy: profile.profileId,
        input: payload.input,
    });
}

async function loadOr404(id: string) {
    await requirePlatformAdmin();
    const row = await loadAnnouncementRow(id);
    return row;
}

export async function updateAnnouncementAdminAction(id: string, input: AnnouncementInput): Promise<WriteResult> {
    const row = await loadOr404(id);
    if (!row) return { ok: false, error: 'Announcement not found.' };
    return patchAnnouncement(row, input);
}

export async function setAnnouncementPublishedAdminAction(id: string, published: boolean): Promise<WriteResult> {
    const row = await loadOr404(id);
    if (!row) return { ok: false, error: 'Announcement not found.' };
    return setPublished(row, !!published);
}

export async function deleteAnnouncementAdminAction(id: string): Promise<WriteResult> {
    const row = await loadOr404(id);
    if (!row) return { ok: false, error: 'Announcement not found.' };
    return deleteAnnouncement(row);
}
