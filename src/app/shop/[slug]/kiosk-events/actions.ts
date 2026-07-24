'use server';
/**
 * Kiosk events — write layer for public.events (the table the EMWRAPS kiosk
 * renders live via realtime; see the kiosk-events spec in emwraps-tickets).
 * Distinct from ../events (rollout.events, the social/RSVP events).
 *
 * All DB access uses the service-role client pinned to the `public` schema.
 * Tenancy: shopId always arrives from the route's slug resolution — inserts
 * stamp shop_id explicitly, updates/deletes carry .eq('shop_id', shopId).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import {
    KIOSK_BUCKET,
    HERO_FOLDER,
    GALLERY_FOLDER,
    nextVersionedPath,
    publicUrlFor,
    slugifyTitle,
} from '@/lib/kiosk-storage';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);
const STATUSES = new Set(['draft', 'published', 'archived']);

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) {
        throw new Error('Manager role required.');
    }
    return { profile, role };
}

async function requireOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!OWNER_ROLES.has(role)) {
        throw new Error('Owner role required.');
    }
    return { profile, role };
}

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

function bustPaths(slug: string, eventId?: string) {
    revalidatePath(`/shop/${slug}/kiosk-events`, 'page');
    if (eventId) {
        revalidatePath(`/shop/${slug}/kiosk-events/${eventId}`, 'page');
    }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts entries as plain strings or {label} objects; returns clean labels. */
function parseStringArray(raw: FormDataEntryValue | null): string[] {
    try {
        const arr = JSON.parse(String(raw ?? '[]'));
        if (!Array.isArray(arr)) return [];
        return arr
            .map((v) =>
                typeof v === 'string'
                    ? v
                    : v && typeof v.label === 'string'
                      ? v.label
                      : '',
            )
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    } catch {
        return [];
    }
}

/**
 * Validate + normalize the shared form fields. The kiosk contract requires
 * zero-padded YYYY-MM-DD dates (it does string comparisons) and highlights as
 * [{label}] objects.
 */
function parseEventFields(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim();
    const tagline = String(formData.get('tagline') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const starts_at = String(formData.get('starts_at') ?? '').trim();
    const ends_at = String(formData.get('ends_at') ?? '').trim();
    const venue_name = String(formData.get('venue_name') ?? '').trim();
    const venue_address = String(formData.get('venue_address') ?? '').trim();
    const link_url = String(formData.get('link_url') ?? '').trim();
    const partners = parseStringArray(formData.get('partners_json'));
    const highlights = parseStringArray(formData.get('highlights_json'));

    if (title.length < 3) throw new Error('Title must be at least 3 characters.');
    if (!DATE_RE.test(starts_at)) throw new Error('Start date is required (YYYY-MM-DD).');
    if (!DATE_RE.test(ends_at)) throw new Error('End date is required (YYYY-MM-DD).');
    if (ends_at < starts_at) throw new Error('End date must be on or after the start date.');
    if (link_url && !/^https?:\/\//i.test(link_url)) {
        throw new Error('Link URL must be a full http(s):// URL.');
    }

    return {
        title,
        tagline: tagline || null,
        description: description || null,
        starts_at,
        ends_at,
        venue_name: venue_name || null,
        venue_address: venue_address || null,
        partners,
        highlights: highlights.map((label) => ({ label })),
        link_url: link_url || null,
    };
}

export async function createKioskEvent(shopId: number, formData: FormData) {
    await requireManager(shopId);
    const fields = parseEventFields(formData);

    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin
        .from('events')
        .insert({
            shop_id: shopId,
            ...fields,
            status: 'draft',
        })
        .select('id')
        .single();
    if (error) throw new Error(error.message);

    const newId = (data as any).id as string;
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, newId);
    redirect(`/shop/${slug}/kiosk-events/${newId}?just_created=1`);
}

export async function updateKioskEvent(eventId: string, shopId: number, formData: FormData) {
    await requireManager(shopId);
    const fields = parseEventFields(formData);

    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function setKioskEventStatus(eventId: string, shopId: number, status: string) {
    await requireManager(shopId);
    if (!STATUSES.has(status)) throw new Error('Invalid status.');

    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function deleteKioskEvent(eventId: string, shopId: number) {
    await requireOwner(shopId);
    // Storage objects referenced by the row are intentionally left in place —
    // never-overwrite cache rule means orphans are the accepted trade-off.
    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
    redirect(`/shop/${slug}/kiosk-events`);
}

// ── Image uploads ────────────────────────────────────────────────────────────
// Bytes never transit the Next server: these actions mint a service-role
// signed upload URL for a fresh versioned path; the browser compresses and
// uploads straight to Storage, then calls the attach action with the path.

async function loadOwnedEvent(eventId: string, shopId: number) {
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin
        .from('events')
        .select('id, title, gallery')
        .eq('id', eventId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Event not found for this shop.');
    return data as any;
}

async function mintSignedUpload(path: string): Promise<{ path: string; token: string }> {
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin.storage
        .from(KIOSK_BUCKET)
        .createSignedUploadUrl(path);
    if (error || !data) {
        throw new Error(`Could not create upload URL: ${error?.message ?? 'unknown'}`);
    }
    return { path: data.path, token: data.token };
}

export async function mintHeroUploadTarget(eventId: string, shopId: number) {
    await requireManager(shopId);
    const event = await loadOwnedEvent(eventId, shopId);
    const base = `${slugifyTitle(event.title) || eventId.slice(0, 8)}-hero`;
    const path = await nextVersionedPath(HERO_FOLDER, base, 'jpg');
    return mintSignedUpload(path);
}

export async function mintGalleryUploadTarget(eventId: string, shopId: number) {
    await requireManager(shopId);
    const event = await loadOwnedEvent(eventId, shopId);
    const token = Math.random().toString(36).slice(2, 6);
    const base = `${slugifyTitle(event.title) || eventId.slice(0, 8)}-${token}`;
    const path = await nextVersionedPath(GALLERY_FOLDER, base, 'jpg');
    return mintSignedUpload(path);
}

function assertKioskPath(path: string, folder: string) {
    if (path.includes('..') || !path.startsWith(`${folder}/`)) {
        throw new Error('Invalid storage path.');
    }
}

export async function attachHeroImage(eventId: string, shopId: number, path: string) {
    await requireManager(shopId);
    assertKioskPath(path, HERO_FOLDER);
    await loadOwnedEvent(eventId, shopId);

    const url = publicUrlFor(path);
    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ hero_image_url: url, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
    return { url };
}

export async function appendGalleryImage(eventId: string, shopId: number, path: string) {
    await requireManager(shopId);
    assertKioskPath(path, GALLERY_FOLDER);
    const event = await loadOwnedEvent(eventId, shopId);

    const url = publicUrlFor(path);
    const current: string[] = Array.isArray(event.gallery)
        ? event.gallery.filter((u: any) => typeof u === 'string')
        : [];

    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ gallery: [...current, url], updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
    return { url };
}

export async function removeGalleryImage(eventId: string, shopId: number, url: string) {
    await requireManager(shopId);
    const event = await loadOwnedEvent(eventId, shopId);

    const current: string[] = Array.isArray(event.gallery)
        ? event.gallery.filter((u: any) => typeof u === 'string')
        : [];
    const next = current.filter((u) => u !== url);
    if (next.length === current.length) throw new Error('Image not found in gallery.');

    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ gallery: next, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function reorderGalleryImages(eventId: string, shopId: number, urls: string[]) {
    await requireManager(shopId);
    const event = await loadOwnedEvent(eventId, shopId);

    const current: string[] = Array.isArray(event.gallery)
        ? event.gallery.filter((u: any) => typeof u === 'string')
        : [];
    // The new order must be a permutation of the stored gallery.
    const sortedA = [...current].sort();
    const sortedB = [...urls.map((u) => String(u))].sort();
    if (
        sortedA.length !== sortedB.length ||
        sortedA.some((u, i) => u !== sortedB[i])
    ) {
        throw new Error('Gallery is out of date — reload and try again.');
    }

    const admin = getSupabasePublicAdmin();
    const { error } = await admin
        .from('events')
        .update({ gallery: urls, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}
