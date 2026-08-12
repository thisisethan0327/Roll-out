'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { raiseShopUnmapped, resolveShopUnmapped } from '@/lib/action-items';
import {
    buildGeocodeQuery,
    geocode,
    isLocationPrecision,
    type LocationPrecision,
} from '@/lib/geocode';

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

    if (!name) throw new Error('Shop name is required.');
    if (primary_color && !HEX_RE.test(primary_color)) {
        throw new Error('Primary color must be a hex code like #ffb733.');
    }
    if (secondary_color && !HEX_RE.test(secondary_color)) {
        throw new Error('Secondary color must be a hex code like #ffb733.');
    }

    // Map presence: the precision selector is the primary control. 'off' hides
    // the shop (show_on_map=false, the master switch); 'exact'/'area' put it on
    // the map and geocode via the shared helper — full street address for
    // 'exact', city centroid for 'area'.
    const precisionRaw = String(formData.get('location_precision') ?? '').trim() || 'exact';
    if (!isLocationPrecision(precisionRaw)) {
        throw new Error('Invalid location precision.');
    }
    const precision: LocationPrecision = precisionRaw;
    const show_on_map = precision !== 'off';

    // Area mode pins the city centroid, falling back to the region when no city
    // is set. If neither is present there's nothing to geocode, so reject the
    // save rather than silently storing an unpinnable "on map" state.
    if (precision === 'area' && !city && !region) {
        throw new Error('Area mode needs at least a city or region.');
    }

    // Preserve existing coordinates by default; only overwrite on a geocode hit,
    // so a transient Nominatim failure never wipes a good pin.
    const { data: existing } = await admin
        .from('shops')
        .select('lat, lng')
        .eq('id', shopId)
        .maybeSingle();
    let lat: number | null = (existing as any)?.lat ?? null;
    let lng: number | null = (existing as any)?.lng ?? null;

    if (show_on_map) {
        const query = buildGeocodeQuery(
            { address_line, city, state_region, postal, region },
            precision,
        );
        if (query) {
            const hit = await geocode(query);
            if (hit) {
                lat = hit.lat;
                lng = hit.lng;
            }
        }
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
            location_precision: precision,
            lat,
            lng,
            show_on_map,
        })
        .eq('id', shopId);
    if (error) throw new Error(error.message);

    // Reconcile the "not on map" alert. Best-effort — never blocks the save.
    if (show_on_map && lat == null) {
        const addressText =
            buildGeocodeQuery(
                { address_line, city, state_region, postal, region },
                precision,
            ) ?? null;
        await raiseShopUnmapped(admin, shopId, name, addressText);
    } else {
        await resolveShopUnmapped(admin, shopId);
    }
    revalidatePath('/admin/overview');
    revalidatePath('/admin/shops');

    revalidatePath(`/shop/${slug}/settings/general`, 'page');
    revalidatePath(`/u/${slug}`, 'page');
}
