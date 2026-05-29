'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const OWNER_ROLES = new Set(['owner']);

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!OWNER_ROLES.has(role)) {
        throw new Error('Only owners can manage staff.');
    }
    return { profile, role };
}

export async function setStaffRole(
    profileId: string,
    shopId: number,
    slug: string,
    role: 'owner' | 'admin' | 'manager' | 'installer' | 'staff',
) {
    const { profile: caller } = await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    // If demoting the only remaining owner away from 'owner', block it.
    if (role !== 'owner') {
        const { data: existing } = await admin
            .from('shop_memberships')
            .select('profile_id, role')
            .eq('shop_id', shopId)
            .eq('profile_id', profileId)
            .maybeSingle();
        if (existing && (existing as any).role === 'owner') {
            const { data: owners } = await admin
                .from('shop_memberships')
                .select('profile_id')
                .eq('shop_id', shopId)
                .eq('role', 'owner');
            const ownerCount = owners?.length ?? 0;
            if (ownerCount <= 1) {
                throw new Error(
                    'Cannot demote the only owner — promote someone else to owner first.',
                );
            }
        }
    }

    const { error } = await admin
        .from('shop_memberships')
        .upsert({ profile_id: profileId, shop_id: shopId, role });
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/staff`, 'page');
}

export async function removeStaff(
    profileId: string,
    shopId: number,
    slug: string,
) {
    const { profile: caller } = await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    // Self-protection: prevent removing self if you're the only owner.
    if (profileId === caller.profileId) {
        const { data: owners } = await admin
            .from('shop_memberships')
            .select('profile_id')
            .eq('shop_id', shopId)
            .eq('role', 'owner');
        const ownerCount = owners?.length ?? 0;
        if (ownerCount <= 1) {
            throw new Error(
                'Cannot remove yourself — you are the only owner. Promote someone else first.',
            );
        }
    }

    const { error } = await admin
        .from('shop_memberships')
        .delete()
        .eq('profile_id', profileId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/staff`, 'page');
}
