'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (role !== 'owner') {
        throw new Error('Only owners can edit the shop page.');
    }
    return { profile, role };
}

export async function updateShopPage(
    shopId: number,
    slug: string,
    formData: FormData,
) {
    await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    const handle = String(formData.get('handle') ?? '')
        .trim()
        .toLowerCase()
        .replace(/^@/, '');
    const display_name = String(formData.get('display_name') ?? '').trim();
    const bio = String(formData.get('bio') ?? '').trim().slice(0, 400);
    const location = String(formData.get('location') ?? '').trim();
    const sector_code = String(formData.get('sector_code') ?? '').trim();
    const avatar_url = String(formData.get('avatar_url') ?? '').trim();
    const banner_url = String(formData.get('banner_url') ?? '').trim();

    if (!handle) throw new Error('Handle is required.');
    if (!/^[a-z0-9_]+$/.test(handle)) {
        throw new Error(
            'Handle must be lowercase letters, numbers, or underscores only.',
        );
    }
    if (!display_name) throw new Error('Display name is required.');

    // Find the shop_page profile row.
    const { data: current } = await admin
        .from('profiles')
        .select('id, handle')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    if (!current) throw new Error('Shop page profile not found.');

    // Uniqueness check for handle (only if changing).
    if ((current as any).handle !== handle) {
        const { data: clash } = await admin
            .from('profiles')
            .select('id')
            .eq('handle', handle)
            .maybeSingle();
        if (clash) {
            throw new Error(`Handle @${handle} is already taken.`);
        }
    }

    const { error } = await admin
        .from('profiles')
        .update({
            handle,
            display_name,
            bio: bio || null,
            location: location || null,
            sector_code: sector_code || null,
            avatar_url: avatar_url || null,
            banner_url: banner_url || null,
        })
        .eq('id', (current as any).id);
    if (error) throw new Error(error.message);

    revalidatePath(`/shop/${slug}/page`, 'page');
}
