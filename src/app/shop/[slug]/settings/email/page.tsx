import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EmailSettingsForm } from './EmailSettingsForm';

export const metadata = { title: 'Email Settings' };

async function loadShop(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shops')
        .select(
            'id, name, from_name, support_email, email_logo_url, email_signature',
        )
        .eq('id', shopId)
        .maybeSingle();
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
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">EMAIL</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · BRANDING &amp; REPLY-TO
                    </div>
                </div>
            </div>

            <EmailSettingsForm
                shopId={shop.shopId}
                slug={slug}
                row={row}
                shopName={shop.name}
            />
        </>
    );
}
