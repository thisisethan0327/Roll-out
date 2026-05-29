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

function bustPaths(slug: string) {
    revalidatePath(`/shop/${slug}/posts`, 'page');
    revalidatePath(`/shop/${slug}/overview`, 'page');
}

export async function softDeletePost(postId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}

export async function undeletePost(postId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('posts')
        .update({ deleted_at: null })
        .eq('id', postId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}
