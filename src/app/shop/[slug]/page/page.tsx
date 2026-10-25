import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ShopPageForm } from './ShopPageForm';
import { ShieldAlert, Store } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, Notice } from '@/components/glide-shopbiz/parts';
import { ConsoleHead } from '@/components/glide-console/parts';

export const metadata = { title: 'Shop Page' };

async function loadShopPage(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select(
            'id, handle, display_name, bio, location, sector_code, avatar_url, banner_url, is_verified',
        )
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    if (error) console.error('[shop/page] loadShopPage failed:', error.message);
    return data as any;
}

export default async function ShopPageEditorPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { role, shop } = await requireShopMemberBySlug(slug);
    if (role !== 'owner') {
        redirect(`/shop/${slug}/overview?error=owner_only`);
    }

    const profile = await loadShopPage(shop.shopId);

    return (
        <BizPage slug={slug}>
            <ConsoleHead title="Shop page" sub={`${shop.name} · Public identity`} />

            {!profile ? (
                <section className="g-card">
                    <CardEmpty
                        icon={<Store size={22} strokeWidth={1.75} />}
                        title="This shop has no page profile yet"
                        blocker={
                            <>
                                Contact <a href="mailto:team@rollout.club">team@rollout.club</a> and we’ll set it up.
                            </>
                        }
                    />
                </section>
            ) : (
                <>
                    {!profile.is_verified && (
                        <Notice icon={<ShieldAlert size={20} strokeWidth={2} aria-hidden="true" />}>
                            <b>Not verified.</b> Verification is platform-admin-controlled. Email{' '}
                            <a href="mailto:team@rollout.club" style={{ color: 'var(--link)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                                team@rollout.club
                            </a>{' '}
                            when you&apos;re ready to be reviewed.
                        </Notice>
                    )}
                    <ShopPageForm shopId={shop.shopId} slug={slug} profile={profile} />
                </>
            )}
        </BizPage>
    );
}
