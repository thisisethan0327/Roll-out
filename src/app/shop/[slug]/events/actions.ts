'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);

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

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    return (data as any)?.id ?? null;
}

function bustPaths(slug: string, eventId?: string) {
    revalidatePath(`/shop/${slug}/events`, 'page');
    revalidatePath(`/shop/${slug}/overview`, 'page');
    if (eventId) {
        revalidatePath(`/shop/${slug}/events/${eventId}`, 'page');
    }
}

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

function generateCode(type: string): string {
    const label = TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${label} / ${n.toString().padStart(4, '0')}`;
}

function parseTags(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

function parseNumber(raw: FormDataEntryValue | null): number | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (s.length === 0) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export async function createEvent(shopId: number, formData: FormData) {
    await requireManager(shopId);

    const type = String(formData.get('type') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const location_name = String(formData.get('location_name') ?? '').trim();
    const location_detail = String(formData.get('location_detail') ?? '').trim();
    const lat = parseNumber(formData.get('lat'));
    const lng = parseNumber(formData.get('lng'));
    const start_at_raw = String(formData.get('start_at') ?? '').trim();
    const capacity = parseNumber(formData.get('capacity'));
    const visibility = String(formData.get('visibility') ?? 'public').trim();
    const tags = parseTags(String(formData.get('tags') ?? ''));

    const allowedTypes = new Set(['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW']);
    const allowedVis = new Set(['public', 'followers', 'private']);

    if (!allowedTypes.has(type)) throw new Error('Invalid event type.');
    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!allowedVis.has(visibility)) throw new Error('Invalid visibility.');

    const start_at = new Date(start_at_raw);
    if (isNaN(start_at.getTime())) throw new Error('Invalid start time.');

    const hostId = await fetchShopPageProfileId(shopId);
    if (!hostId) throw new Error('Shop page profile not found. Contact support.');

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .insert({
            shop_id: shopId,
            host_id: hostId,
            code: generateCode(type),
            type,
            title,
            description: description || null,
            location_name: location_name || null,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            is_official: true,
            attending_count: 0,
        })
        .select('id')
        .single();
    if (error) throw new Error(error.message);

    const newId = (data as any).id as string;
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, newId);
    redirect(`/shop/${slug}/events/${newId}`);
}

export async function updateEvent(
    eventId: string,
    shopId: number,
    formData: FormData,
) {
    await requireManager(shopId);

    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const location_name = String(formData.get('location_name') ?? '').trim();
    const location_detail = String(formData.get('location_detail') ?? '').trim();
    const lat = parseNumber(formData.get('lat'));
    const lng = parseNumber(formData.get('lng'));
    const start_at_raw = String(formData.get('start_at') ?? '').trim();
    const capacity = parseNumber(formData.get('capacity'));
    const visibility = String(formData.get('visibility') ?? 'public').trim();
    const tags = parseTags(String(formData.get('tags') ?? ''));

    const allowedVis = new Set(['public', 'followers', 'private']);

    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!allowedVis.has(visibility)) throw new Error('Invalid visibility.');

    const start_at = new Date(start_at_raw);
    if (isNaN(start_at.getTime())) throw new Error('Invalid start time.');

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({
            title,
            description: description || null,
            location_name: location_name || null,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function cancelEvent(eventId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function uncancelEvent(eventId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: null })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, eventId);
}

export async function deleteEvent(eventId: string, shopId: number) {
    await requireOwner(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) {
        revalidatePath(`/shop/${slug}/events`, 'page');
        revalidatePath(`/shop/${slug}/overview`, 'page');
    }
    redirect(`/shop/${slug}/events`);
}
