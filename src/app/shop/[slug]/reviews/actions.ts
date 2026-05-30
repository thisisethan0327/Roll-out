'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) {
        throw new Error('Manager role required.');
    }
    return { profile, role };
}

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

/**
 * Post (or clear, with empty text) the shop's public reply to a review.
 * We gate with requireManager and write via the admin client rather than the
 * reply_to_review RPC, because the service-role client has no auth.uid() for
 * the RPC's own role check.
 */
export async function replyToReview(reviewId: string, shopId: number, formData: FormData) {
    const { profile } = await requireManager(shopId);
    const reply = (formData.get('reply') ?? '').toString().trim();

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_reviews')
        .update(
            reply
                ? { owner_reply: reply, owner_reply_at: new Date().toISOString(), owner_reply_by: profile.profileId }
                : { owner_reply: null, owner_reply_at: null, owner_reply_by: null },
        )
        .eq('id', reviewId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(shopId);
    if (slug) {
        revalidatePath(`/shop/${slug}/reviews`, 'page');
        revalidatePath(`/u/${slug}`, 'page');
    }
}
