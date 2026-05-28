'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
