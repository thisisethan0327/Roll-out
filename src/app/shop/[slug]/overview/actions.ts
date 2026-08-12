'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Dismiss an open shop_owner action item from a shop's overview attention panel.
 *
 * Mirrors the platform-admin dismiss (admin/overview/actions.ts) but is SHOP
 * SCOPED: the caller must be a member of `slug`'s shop, and the update only ever
 * touches a row that (a) is still open, (b) belongs to THIS shop, and (c) is
 * addressed to shop owners. Those three predicates in the WHERE clause mean a
 * member of shop A can never dismiss shop B's item — or a platform_admin item —
 * even by forging an id, because the row simply won't match. Frees the dedupe
 * slot so the same condition can re-raise later.
 */
export async function dismissShopActionItem(slug: string, id: string): Promise<void> {
    const { profile, shop } = await requireShopMemberBySlug(slug);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('action_items')
        .update({
            status: 'dismissed',
            resolved_at: new Date().toISOString(),
            resolved_by: profile.profileId,
        })
        .eq('id', id)
        .eq('status', 'open')
        .eq('audience', 'shop_owner')
        .eq('shop_id', shop.shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/overview`);
}
