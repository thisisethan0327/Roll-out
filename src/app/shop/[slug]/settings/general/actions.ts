'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (role !== 'owner') {
        throw new Error('Only owners can edit shop settings.');
    }
    return { profile, role };
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export async function updateShopGeneral(
    shopId: number,
    slug: string,
    formData: FormData,
) {
    await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    const name = String(formData.get('name') ?? '').trim();
    const region = String(formData.get('region') ?? '').trim();
    const primary_color = String(formData.get('primary_color') ?? '').trim();
    const secondary_color = String(
        formData.get('secondary_color') ?? '',
    ).trim();

    // Location
    const address_line = String(formData.get('address_line') ?? '').trim();
    const city = String(formData.get('city') ?? '').trim();
    const state_region = String(formData.get('state_region') ?? '').trim();
    const postal = String(formData.get('postal') ?? '').trim();
    const latRaw = String(formData.get('lat') ?? '').trim();
    const lngRaw = String(formData.get('lng') ?? '').trim();
    const show_on_map = formData.get('show_on_map') != null;

    if (!name) throw new Error('Shop name is required.');
    if (primary_color && !HEX_RE.test(primary_color)) {
        throw new Error('Primary color must be a hex code like #ffb733.');
    }
    if (secondary_color && !HEX_RE.test(secondary_color)) {
        throw new Error('Secondary color must be a hex code like #ffb733.');
    }

    // Lat/lng: both-or-neither, and within valid ranges.
    let lat: number | null = null;
    let lng: number | null = null;
    if (latRaw || lngRaw) {
        lat = Number(latRaw);
        lng = Number(lngRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new Error('Latitude and longitude must both be numbers.');
        }
        if (lat < -90 || lat > 90) throw new Error('Latitude must be between -90 and 90.');
        if (lng < -180 || lng > 180) throw new Error('Longitude must be between -180 and 180.');
    }

    const { error } = await admin
        .from('shops')
        .update({
            name,
            region: region || null,
            primary_color: primary_color || null,
            secondary_color: secondary_color || null,
            address_line: address_line || null,
            city: city || null,
            state_region: state_region || null,
            postal: postal || null,
            lat,
            lng,
            show_on_map,
        })
        .eq('id', shopId);
    if (error) throw new Error(error.message);

    revalidatePath(`/shop/${slug}/settings/general`, 'page');
    revalidatePath(`/u/${slug}`, 'page');
}
