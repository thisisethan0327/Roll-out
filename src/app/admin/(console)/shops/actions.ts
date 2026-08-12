'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { raiseShopUnmapped, resolveShopUnmapped } from '@/lib/action-items';
import {
    buildGeocodeQuery,
    geocode,
    isLocationPrecision,
    type LocationPrecision,
} from '@/lib/geocode';
import { isShopCategory } from '@/lib/shop-categories';

export async function setShopVerified(shopPageProfileId: string, verified: boolean) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', shopPageProfileId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/shops');
}

export async function setMembershipRole(
    profileId: string,
    shopId: number,
    role: 'owner' | 'admin' | 'manager' | 'installer' | 'staff',
) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_memberships')
        .upsert({ profile_id: profileId, shop_id: shopId, role });
    if (error) throw new Error(error.message);
    revalidatePath('/admin/shops');
}

export async function removeMembership(profileId: string, shopId: number) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_memberships')
        .delete()
        .eq('profile_id', profileId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/shops');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Platform-admin full shop-profile editor. Lets a Rollout admin fix any shop's
 * public profile + location when the owner needs support. Deliberately does NOT
 * touch identity/URL fields (slug), the commerce registry (tier/handles/fees —
 * those live in the verifications decision flow), or stripe_account_id.
 *
 * Location model (mirrors the shop-side settings): the precision selector is the
 * primary control. 'off' sets show_on_map=false (the master switch); 'exact' and
 * 'area' set show_on_map=true and geocode via the shared Nominatim helper — the
 * full street address for 'exact', the city centroid for 'area'. Geocode is
 * best-effort: on success we store the new coords; on failure we PRESERVE the
 * existing coords (never wipe a good pin because Nominatim timed out). Finally we
 * reconcile the shop_unmapped alert: raise if it should be on the map but has no
 * coords, resolve otherwise.
 */
export async function updateShopProfile(shopId: number, formData: FormData) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();

    const str = (k: string) => String(formData.get(k) ?? '').trim();

    const name = str('name');
    const category = str('category');
    const region = str('region');
    const bio = str('bio');
    const address_line = str('address_line');
    const city = str('city');
    const state_region = str('state_region');
    const postal = str('postal');
    const support_email = str('support_email');
    const contact_phone = str('contact_phone');
    const website_url = str('website_url');

    if (!name) throw new Error('Shop name is required.');
    // Category is the platform-defined taxonomy: allow empty (clears it) or a
    // value from the controlled vocabulary; reject anything else.
    if (category && !isShopCategory(category)) {
        throw new Error('Category must be one of the platform shop categories.');
    }
    if (support_email && !EMAIL_RE.test(support_email)) {
        throw new Error('Support email is not a valid email address.');
    }

    const precisionRaw = str('location_precision') || 'exact';
    if (!isLocationPrecision(precisionRaw)) {
        throw new Error('Invalid location precision.');
    }
    const precision: LocationPrecision = precisionRaw;
    const show_on_map = precision !== 'off';

    // Preserve existing coordinates by default; only overwrite on a geocode hit.
    const { data: existing } = await admin
        .from('shops')
        .select('lat, lng')
        .eq('id', shopId)
        .maybeSingle();
    let lat: number | null = (existing as any)?.lat ?? null;
    let lng: number | null = (existing as any)?.lng ?? null;

    if (show_on_map) {
        const query = buildGeocodeQuery(
            { address_line, city, state_region, postal },
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
            category: category || null,
            region: region || null,
            address_line: address_line || null,
            city: city || null,
            state_region: state_region || null,
            postal: postal || null,
            support_email: support_email || null,
            contact_phone: contact_phone || null,
            website_url: website_url || null,
            location_precision: precision,
            show_on_map,
            lat,
            lng,
        })
        .eq('id', shopId);
    if (error) throw new Error(error.message);

    // Bio lives on the shop_page profile, not the shops row — update it there.
    await admin
        .from('profiles')
        .update({ bio: bio || null })
        .eq('kind', 'shop_page')
        .eq('shop_id', shopId);

    // Reconcile the "not on map" alert. Best-effort — never blocks the save.
    if (show_on_map && lat == null) {
        const addressText =
            buildGeocodeQuery(
                { address_line, city, state_region, postal },
                precision,
            ) ?? null;
        await raiseShopUnmapped(admin, shopId, name, addressText);
    } else {
        await resolveShopUnmapped(admin, shopId);
    }

    revalidatePath('/admin/shops');
    revalidatePath(`/admin/shops/${shopId}`);
    revalidatePath('/admin/overview');
}
