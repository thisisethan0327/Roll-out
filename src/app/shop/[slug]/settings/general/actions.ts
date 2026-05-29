'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (role !== 'owner') {
        throw new Error('Only owners can edit shop settings.');
    }
    return { profile, role };
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export async function updateShopGeneral(
    shopId: number,
    slug: string,
    formData: FormData,
) {
    await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    const name = String(formData.get('name') ?? '').trim();
    const region = String(formData.get('region') ?? '').trim();
    const primary_color = String(formData.get('primary_color') ?? '').trim();
    const secondary_color = String(
        formData.get('secondary_color') ?? '',
    ).trim();

    if (!name) throw new Error('Shop name is required.');
    if (primary_color && !HEX_RE.test(primary_color)) {
        throw new Error('Primary color must be a hex code like #ffb733.');
    }
    if (secondary_color && !HEX_RE.test(secondary_color)) {
        throw new Error('Secondary color must be a hex code like #ffb733.');
    }

    const { error } = await admin
        .from('shops')
        .update({
            name,
            region: region || null,
            primary_color: primary_color || null,
            secondary_color: secondary_color || null,
        })
        .eq('id', shopId);
    if (error) throw new Error(error.message);

    revalidatePath(`/shop/${slug}/settings/general`, 'page');
}
