import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EmailSettingsForm } from './EmailSettingsForm';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { ConsoleHead } from '@/components/glide-console/parts';

export const metadata = { title: 'Email Settings' };

async function loadShop(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shops')
        .select(
            'id, name, from_name, support_email, email_logo_url, email_signature',
        )
        .eq('id', shopId)
        .maybeSingle();
    if (error) console.error('[shop/settings/email] loadShop failed:', error.message);
    return data as any;
}

export default async function EmailSettingsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { role, shop } = await requireShopMemberBySlug(slug);
    if (role !== 'owner') {
        redirect(`/shop/${slug}/overview?error=owner_only`);
    }

    const row = await loadShop(shop.shopId);

    return (
        <BizPage slug={slug}>
            <ConsoleHead title="Email" sub={`${shop.name} · Branding and reply-to`} />
            <EmailSettingsForm shopId={shop.shopId} slug={slug} row={row} shopName={shop.name} />
        </BizPage>
    );
}
