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
import { SUSPENDED_MESSAGE, isProfileBanned } from '@/lib/ban';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function saveProfileSettingsAction(input: { displayName: string; handle: string; bio: string; location: string }): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };
    if (isProfileBanned(me)) return { ok: false, error: SUSPENDED_MESSAGE };
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
    if (isProfileBanned(me)) return { ok: false, error: SUSPENDED_MESSAGE };
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
    if (isProfileBanned(me)) return { ok: false, error: SUSPENDED_MESSAGE };
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
    if (isProfileBanned(me)) return { ok: false, error: SUSPENDED_MESSAGE };
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
    if (isProfileBanned(me)) return { ok: false, error: SUSPENDED_MESSAGE };
    const res = await deleteShippingAddress(id);
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath('/me/settings');
    return { ok: true, message: 'Address removed.' };
}

const DELETE_FN_FALLBACK =
    'We could not delete your account just now. Email support@rollout.club and we will delete it within 24 hours.';

/**
 * Permanently delete the signed-in member's account via the same edge function
 * the mobile app uses (delete-rollout-account): POST with the member's OWN
 * access token as the bearer (the function resolves the caller from it and
 * deletes only that user; there is no body and no user id to forge). The typed
 * handle is re-checked here, server-side, against the session's profile -- the
 * client-side gate is only a convenience. On success the session is signed out
 * (global, per the 2026-09-08 ruling) and the member lands on the home page
 * with a confirmation. The function hard-deletes auth.users, so this is
 * irreversible and also removes the one shared sign-in for EMWRAPS/NeferStock/
 * UNITY.
 */
export async function deleteMyAccountAction(typedHandle: string): Promise<ActionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Sign in again and retry.' };
    const norm = (h: string) => h.trim().replace(/^@+/, '').toLowerCase();
    if (!norm(typedHandle) || norm(typedHandle) !== norm(me.handle)) {
        return { ok: false, error: 'The handle you typed does not match your account.' };
    }

    const supabase = await getSupabaseServer();
    const {
        data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!token || !url || !anon) return { ok: false, error: 'Your session expired. Sign in again and retry.' };

    let ok = false;
    try {
        const res = await fetch(`${url}/functions/v1/delete-rollout-account`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: anon,
                'Content-Type': 'application/json',
            },
            body: '{}',
            cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string } | null;
        ok = res.ok && body?.ok === true;
        if (!ok) {
            console.error('[me/settings] delete-rollout-account failed:', res.status, body?.error, body?.detail);
            if (res.status === 401) return { ok: false, error: 'Your session expired. Sign in again and retry.' };
            return { ok: false, error: DELETE_FN_FALLBACK };
        }
    } catch (e) {
        console.error('[me/settings] delete-rollout-account unreachable:', (e as any)?.message ?? e);
        return { ok: false, error: DELETE_FN_FALLBACK };
    }

    // The auth user is gone, so the server may refuse the global revoke; fall back
    // to clearing this browser's session cookies so nothing stale is left behind.
    try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) await supabase.auth.signOut({ scope: 'local' });
    } catch {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    redirect('/?account_deleted=1');
}

/** Sign out of EVERY device and browser (the global sign-out ruling, 2026-09-08). */
export async function signOutEverywhereAction(): Promise<void> {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut({ scope: 'global' });
    redirect('/');
}
