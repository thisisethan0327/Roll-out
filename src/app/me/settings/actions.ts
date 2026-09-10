'use server';
/**
 * /me/settings server actions. Everything runs after the platform session
 * check; profile writes go through lib/profile-handle (the same rules as
 * onboarding), images through sharp into rollout-media (service role — the
 * bucket's own policies only cover vehicles/), addresses through the Medusa
 * customer link, best-effort.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { getConsumerProfile } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { saveProfileFields } from '@/lib/profile-handle';
import { deleteShippingAddress, upsertShippingAddress } from '@/lib/medusa-address';
import type { AddressInput } from '@/lib/medusa-types';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function saveProfileSettingsAction(input: { displayName: string; handle: string; bio: string; location: string }): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    const res = await saveProfileFields({ profileId: me.profileId, handle: input.handle, displayName: input.displayName, bio: input.bio, location: input.location });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath('/me');
    revalidatePath('/u/[handle]', 'page');
    return { ok: true, message: 'Saved.' };
}

const MEDIA_BUCKET = 'rollout-media';
const MAX_BYTES = 5 * 1024 * 1024;
const KINDS = {
    avatar: { width: 512, height: 512, column: 'avatar_url' as const },
    banner: { width: 1600, height: 686, column: 'banner_url' as const },
};

/** Avatar / banner upload: 5 MB, jpg/png/webp in, webp out, resized to the slot. */
export async function uploadProfileImageAction(formData: FormData): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    const kind = String(formData.get('kind') ?? '') as keyof typeof KINDS;
    const spec = KINDS[kind];
    if (!spec) return { ok: false, error: 'Unknown image slot.' };
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an image.' };
    if (file.size > MAX_BYTES) return { ok: false, error: 'That image is over 5 MB.' };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { ok: false, error: 'Use a JPG, PNG or WebP.' };

    let out: Buffer;
    try {
        out = await sharp(Buffer.from(await file.arrayBuffer()))
            .rotate()
            .resize(spec.width, spec.height, { fit: 'cover', position: 'attention' })
            .webp({ quality: 84 })
            .toBuffer();
    } catch {
        return { ok: false, error: 'That file could not be read as an image.' };
    }

    const admin = getSupabaseAdmin();
    const path = `profiles/${me.profileId}/${kind}.webp`;
    const { error: upErr } = await admin.storage.from(MEDIA_BUCKET).upload(path, out, { contentType: 'image/webp', upsert: true });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
    const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust: same path, new bytes
    const { error } = await admin.from('profiles').update({ [spec.column]: url, updated_at: new Date().toISOString() }).eq('id', me.profileId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/me');
    revalidatePath('/u/[handle]', 'page');
    return { ok: true, message: kind === 'avatar' ? 'Avatar updated.' : 'Banner updated.' };
}

export async function removeProfileImageAction(kind: 'avatar' | 'banner'): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('profiles').update({ [KINDS[kind].column]: null, updated_at: new Date().toISOString() }).eq('id', me.profileId);
    if (error) return { ok: false, error: error.message };
    await admin.storage.from(MEDIA_BUCKET).remove([`profiles/${me.profileId}/${kind}.webp`]);
    revalidatePath('/me');
    revalidatePath('/u/[handle]', 'page');
    return { ok: true, message: 'Removed.' };
}

export async function saveAddressAction(input: AddressInput & { id?: string | null; isDefault: boolean }): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    const a: AddressInput = {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        address1: input.address1.trim(),
        address2: (input.address2 ?? '').trim(),
        city: input.city.trim(),
        province: input.province.trim(),
        postalCode: input.postalCode.trim(),
        countryCode: (input.countryCode || 'us').trim().toLowerCase(),
        phone: (input.phone ?? '').trim(),
    };
    if (!a.firstName || !a.lastName || !a.address1 || !a.city || !a.province || !a.postalCode) {
        return { ok: false, error: 'Name, street, city, state and ZIP are required.' };
    }
    const res = await upsertShippingAddress(a, { id: input.id ?? null, isDefault: input.isDefault });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath('/me/settings');
    return { ok: true, message: 'Address saved.' };
}

export async function deleteAddressAction(id: string): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    const res = await deleteShippingAddress(id);
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath('/me/settings');
    return { ok: true, message: 'Address removed.' };
}

/** Sign out of EVERY device and browser (the global sign-out ruling, 2026-09-08). */
export async function signOutEverywhereAction(): Promise<void> {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut({ scope: 'global' });
    redirect('/');
}
