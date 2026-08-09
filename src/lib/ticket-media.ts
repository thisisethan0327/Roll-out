/**
 * Storage helpers for the shared `ticket-media` bucket (public read; all writes
 * via service-role signed upload URLs minted server-side, same trust model as
 * kiosk-storage.ts).
 *
 * TENANCY: every ticket-media object for a Rollout shop lives under a
 * shop-scoped prefix `${shopId}/…` so a shop's inspection photos never collide
 * with another tenant's. The path shape is:
 *
 *     ${shopId}/${ticketId}/${checkinId}/${timestamp}_${rand}.jpg   (check-ins)
 *     ${shopId}/${ticketId}/messages/${timestamp}_${rand}.jpg       (chat)
 *
 * NOTE: the legacy emwraps-tickets app writes check-in media to
 * `${ticketId}/${checkinId}/…` (no shop prefix). We do NOT touch those objects;
 * new Rollout uploads simply carry the shop prefix. Reads use the stored public
 * URL either way, so mixed layouts coexist.
 */
import 'server-only';
import { getSupabasePublicAdmin } from './supabase/admin';
import { TICKET_BUCKET } from './ticket-media-constants';

export { TICKET_BUCKET } from './ticket-media-constants';

function randName(ext: string): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/** Validate a caller-supplied storage path is inside this shop's prefix. */
export function assertTicketMediaPath(path: string, shopId: number): void {
    if (path.includes('..') || !path.startsWith(`${shopId}/`)) {
        throw new Error('Invalid storage path.');
    }
}

export function ticketMediaPublicUrl(path: string): string {
    const admin = getSupabasePublicAdmin();
    return admin.storage.from(TICKET_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function mintSignedUpload(
    path: string,
): Promise<{ path: string; token: string }> {
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin.storage
        .from(TICKET_BUCKET)
        .createSignedUploadUrl(path);
    if (error || !data) {
        throw new Error(`Could not create upload URL: ${error?.message ?? 'unknown'}`);
    }
    return { path: data.path, token: data.token };
}

/** Mint a signed upload target for a check-in photo. */
export function mintCheckinUploadPath(
    shopId: number,
    ticketId: string,
    checkinId: string,
): Promise<{ path: string; token: string }> {
    const path = `${shopId}/${ticketId}/${checkinId}/${randName('jpg')}`;
    return mintSignedUpload(path);
}

/** Mint a signed upload target for a chat attachment. */
export function mintMessageUploadPath(
    shopId: number,
    ticketId: string,
): Promise<{ path: string; token: string }> {
    const path = `${shopId}/${ticketId}/messages/${randName('jpg')}`;
    return mintSignedUpload(path);
}

/** Best-effort delete of storage objects (ignores missing). */
export async function removeTicketMedia(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const admin = getSupabasePublicAdmin();
    await admin.storage.from(TICKET_BUCKET).remove(paths);
}
