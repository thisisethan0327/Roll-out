'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function setVerified(profileId: string, verified: boolean) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', profileId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/users');
    revalidatePath('/admin/shops');
}

export async function grantPlatformAdmin(profileId: string, grantedBy: string) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('platform_admins')
        .insert({ profile_id: profileId, granted_by: grantedBy, notes: 'granted via admin console' });
    if (error && error.code !== '23505') throw new Error(error.message);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function revokePlatformAdmin(profileId: string) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('platform_admins')
        .delete()
        .eq('profile_id', profileId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function grantMeetCoordinator(profileId: string, grantedBy: string) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('meet_coordinators')
        .insert({ profile_id: profileId, granted_by: grantedBy, notes: 'granted via admin console' });
    if (error && error.code !== '23505') throw new Error(error.message);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function revokeMeetCoordinator(profileId: string) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('meet_coordinators')
        .delete()
        .eq('profile_id', profileId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
}
