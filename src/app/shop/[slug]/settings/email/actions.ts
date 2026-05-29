'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (role !== 'owner') {
        throw new Error('Only owners can edit email settings.');
    }
    return { profile, role };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateShopEmail(
    shopId: number,
    slug: string,
    formData: FormData,
) {
    await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    const from_name = String(formData.get('from_name') ?? '').trim();
    const support_email = String(formData.get('support_email') ?? '').trim();
    const email_logo_url = String(
        formData.get('email_logo_url') ?? '',
    ).trim();
    const email_signature = String(
        formData.get('email_signature') ?? '',
    ).trim();

    if (support_email && !EMAIL_RE.test(support_email)) {
        throw new Error('Support email is not a valid email address.');
    }

    const { error } = await admin
        .from('shops')
        .update({
            from_name: from_name || null,
            support_email: support_email || null,
            email_logo_url: email_logo_url || null,
            email_signature: email_signature || null,
        })
        .eq('id', shopId);
    if (error) throw new Error(error.message);

    revalidatePath(`/shop/${slug}/settings/email`, 'page');
}
