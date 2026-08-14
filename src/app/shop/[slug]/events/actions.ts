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

/**
 * Cover URL from the picker. Empty → null (event falls back to the type
 * default at render time). Otherwise must be an http(s) URL.
 */
function parseHeroUrl(raw: FormDataEntryValue | null): string | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (s.length === 0) return null;
    if (!/^https?:\/\//i.test(s)) throw new Error('Cover URL must be an http(s) link.');
    if (s.length > 1000) throw new Error('Cover URL is too long.');
    return s;
}

// ── E2: rsvp mode + tier rows (from TierRowsEditor's structured inputs) ─────
type TierInput = {
    id?: string;
    name: string;
    price_cents: number;
    capacity: number | null;
    reserved_spot: boolean;
    includes: string[];
    package_mode: 'none' | 'included' | 'addon';
    package_price_cents: number | null;
    medusa_product_id: string | null;
    sort: number;
};

const PACKAGE_MODES = new Set(['none', 'included', 'addon']);
const TIER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'free' | 'tiered' — the composer only offers these two ('paid' is a data
 *  state reachable via API/mobile; the web composer models it as one paid tier). */
function parseRsvpMode(raw: FormDataEntryValue | null): 'free' | 'tiered' {
    const s = String(raw ?? 'free').trim();
    if (s === 'free' || s === 'tiered') return s;
    throw new Error('Invalid RSVP mode.');
}

/**
 * Validate the tiers_json payload server-side — the client editor is
 * convenience, THIS is the gate. Throws on anything malformed rather than
 * persisting a half-valid tier a member could then try to buy.
 */
function parseTiers(raw: FormDataEntryValue | null): TierInput[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(raw ?? '[]'));
    } catch {
        throw new Error('Invalid tier payload.');
    }
    if (!Array.isArray(parsed)) throw new Error('Invalid tier payload.');
    if (parsed.length > 12) throw new Error('Too many tiers (max 12).');

    return parsed.map((t: any, i: number): TierInput => {
        const name = String(t?.name ?? '').trim();
        if (name.length < 2) throw new Error(`Tier ${i + 1}: name must be at least 2 characters.`);
        if (name.length > 60) throw new Error(`Tier ${i + 1}: name must be 60 chars or fewer.`);

        const price = Number(t?.price_cents);
        if (!Number.isInteger(price) || price < 0) {
            throw new Error(`Tier ${i + 1}: invalid ticket price.`);
        }

        let capacity: number | null = null;
        if (t?.capacity != null && t.capacity !== '') {
            capacity = Number(t.capacity);
            if (!Number.isInteger(capacity) || capacity < 1) {
                throw new Error(`Tier ${i + 1}: sub-capacity must be a positive whole number.`);
            }
        }

        const packageMode = String(t?.package_mode ?? 'none');
        if (!PACKAGE_MODES.has(packageMode)) throw new Error(`Tier ${i + 1}: invalid package mode.`);

        let packagePrice: number | null = null;
        if (packageMode === 'addon') {
            packagePrice = Number(t?.package_price_cents ?? 0);
            if (!Number.isInteger(packagePrice) || packagePrice < 0) {
                throw new Error(`Tier ${i + 1}: invalid package price.`);
            }
        }

        const includes = Array.isArray(t?.includes)
            ? t.includes.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0).slice(0, 12)
            : [];

        const productId = t?.medusa_product_id != null ? String(t.medusa_product_id).trim() : '';
        if (productId.length > 120) throw new Error(`Tier ${i + 1}: product id is too long.`);

        const id = t?.id != null ? String(t.id) : undefined;
        if (id && !TIER_UUID_RE.test(id)) throw new Error(`Tier ${i + 1}: invalid tier id.`);

        return {
            ...(id ? { id } : {}),
            name,
            price_cents: price,
            capacity,
            reserved_spot: Boolean(t?.reserved_spot),
            includes,
            package_mode: packageMode as TierInput['package_mode'],
            package_price_cents: packagePrice,
            medusa_product_id: productId || null,
            sort: i,
        };
    });
}

/**
 * Persist tier rows for an event. Existing tiers (matched by id) are UPDATED
 * in place — RSVPs may already reference them, so deletion is never an option;
 * tiers dropped from the payload are soft-retired (active=false) instead. New
 * rows insert with active=true. Runs behind the shop guard on the service-role
 * client, mirroring how the event row itself is saved.
 */
async function syncTiers(eventId: string, tiers: TierInput[]): Promise<void> {
    const admin = getSupabaseAdmin();
    const { data: existingRaw, error: loadError } = await admin
        .from('event_tiers')
        .select('id')
        .eq('event_id', eventId);
    if (loadError) throw new Error(loadError.message);
    const existingIds = new Set(((existingRaw as any[]) ?? []).map((r) => r.id as string));

    const keptIds = new Set<string>();
    for (const t of tiers) {
        const row = {
            name: t.name,
            price_cents: t.price_cents,
            capacity: t.capacity,
            reserved_spot: t.reserved_spot,
            includes: t.includes,
            package_mode: t.package_mode,
            package_price_cents: t.package_price_cents,
            medusa_product_id: t.medusa_product_id,
            sort: t.sort,
            active: true,
        };
        if (t.id && existingIds.has(t.id)) {
            keptIds.add(t.id);
            const { error } = await admin
                .from('event_tiers')
                .update(row)
                .eq('id', t.id)
                .eq('event_id', eventId);
            if (error) throw new Error(error.message);
        } else {
            const { error } = await admin
                .from('event_tiers')
                .insert({ ...row, event_id: eventId, currency: 'usd' });
            if (error) throw new Error(error.message);
        }
    }

    const retired = [...existingIds].filter((id) => !keptIds.has(id));
    if (retired.length > 0) {
        const { error } = await admin
            .from('event_tiers')
            .update({ active: false })
            .in('id', retired)
            .eq('event_id', eventId);
        if (error) throw new Error(error.message);
    }
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
    const hero_image_url = parseHeroUrl(formData.get('hero_image_url'));
    const rsvp_mode = parseRsvpMode(formData.get('rsvp_mode'));
    const tiers = rsvp_mode === 'tiered' ? parseTiers(formData.get('tiers_json')) : [];

    const allowedTypes = new Set(['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW']);
    const allowedVis = new Set(['public', 'followers', 'private']);

    if (!allowedTypes.has(type)) throw new Error('Invalid event type.');
    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (location_name.length < 2) throw new Error('Location name is required.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!allowedVis.has(visibility)) throw new Error('Invalid visibility.');
    if (rsvp_mode === 'tiered' && tiers.length === 0) {
        throw new Error('A tiered event needs at least one tier.');
    }

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
            location_name,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            hero_image_url,
            rsvp_mode,
            is_official: true,
            attending_count: 0,
        })
        .select('id')
        .single();
    if (error) throw new Error(error.message);

    const newId = (data as any).id as string;
    if (rsvp_mode === 'tiered') await syncTiers(newId, tiers);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug, newId);
    redirect(`/shop/${slug}/events/${newId}?just_created=1`);
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
    const hero_image_url = parseHeroUrl(formData.get('hero_image_url'));
    const rsvp_mode = parseRsvpMode(formData.get('rsvp_mode'));
    const tiers = rsvp_mode === 'tiered' ? parseTiers(formData.get('tiers_json')) : [];

    const allowedVis = new Set(['public', 'followers', 'private']);

    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (location_name.length < 2) throw new Error('Location name is required.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!allowedVis.has(visibility)) throw new Error('Invalid visibility.');
    if (rsvp_mode === 'tiered' && tiers.length === 0) {
        throw new Error('A tiered event needs at least one tier.');
    }

    const start_at = new Date(start_at_raw);
    if (isNaN(start_at.getTime())) throw new Error('Invalid start time.');

    // Ownership gate for the tier writes below: the events UPDATE is scoped by
    // shop_id (a mismatch silently no-ops), but syncTiers keys on event id
    // alone — so verify this event actually belongs to the caller's shop.
    const admin = getSupabaseAdmin();
    const { data: owned } = await admin
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (!owned) throw new Error('Event not found for this shop.');

    const { error } = await admin
        .from('events')
        .update({
            title,
            description: description || null,
            location_name,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            hero_image_url,
            rsvp_mode,
            updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    // Tier sync runs even when flipping BACK to free: the payload is [] then,
    // which soft-retires every tier (active=false) instead of deleting rows
    // that RSVPs may reference.
    await syncTiers(eventId, tiers);

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
