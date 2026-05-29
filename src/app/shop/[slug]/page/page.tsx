import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ShopPageForm } from './ShopPageForm';

export const metadata = { title: 'Shop Page' };

async function loadShopPage(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('profiles')
        .select(
            'id, handle, display_name, bio, location, sector_code, avatar_url, banner_url, is_verified',
        )
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
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
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SHOP PAGE</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · PUBLIC IDENTITY
                    </div>
                </div>
            </div>

            {!profile ? (
                <div className="admin-empty">
                    NO SHOP_PAGE PROFILE EXISTS FOR THIS SHOP — CONTACT TEAM@ROLLOUT.CLUB.
                </div>
            ) : (
                <>
                    {!profile.is_verified && (
                        <div
                            style={{
                                marginBottom: 20,
                                padding: 14,
                                border: '1px solid var(--gold)',
                                background: 'var(--gold-glow)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wide)',
                                color: 'var(--text-2)',
                            }}
                        >
                            <strong style={{ color: 'var(--gold)' }}>
                                NOT VERIFIED
                            </strong>{' '}
                            — verification is platform-admin-controlled. Email{' '}
                            <a
                                href="mailto:team@rollout.club"
                                style={{ color: 'var(--gold)' }}
                            >
                                team@rollout.club
                            </a>{' '}
                            when you&apos;re ready to be reviewed.
                        </div>
                    )}
                    <ShopPageForm
                        shopId={shop.shopId}
                        slug={slug}
                        profile={profile}
                    />
                </>
            )}
        </>
    );
}
