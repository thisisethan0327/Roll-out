import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { GeneralSettingsForm } from './GeneralSettingsForm';
import { AtSign, Hash } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { CardHead, ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const metadata = { title: 'General Settings' };

async function loadShop(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shops')
        .select('id, slug, name, region, primary_color, secondary_color, address_line, city, state_region, postal, lat, lng, show_on_map, location_precision')
        .eq('id', shopId)
        .maybeSingle();
    if (error) console.error('[shop/settings/general] loadShop failed:', error.message);
    return data as any;
}

export default async function GeneralSettingsPage({
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
            <ConsoleHead title="General" sub={`${shop.name} · Core info`} />

            <div className={bz.split}>
                <GeneralSettingsForm shopId={shop.shopId} slug={slug} row={row} />

                <aside className={cx('g-card', cs.sticky)} aria-labelledby="gen-rec-h">
                    <CardHead id="gen-rec-h" title="Shop record" sub="Read-only." />
                    <ul className={cx('g-rows', cs.cardRows)}>
                        <li className="g-row">
                            <AtSign size={20} strokeWidth={2} aria-hidden="true" />
                            <span className="g-row-t">
                                <b>Slug</b>
                                <small>Your console and page address</small>
                            </span>
                            <span className={cs.rowValue}>@{shop.slug}</span>
                        </li>
                        <li className="g-row">
                            <Hash size={20} strokeWidth={2} aria-hidden="true" />
                            <span className="g-row-t">
                                <b>Shop ID</b>
                                <small>Quote it to support</small>
                            </span>
                            <span className={cs.rowValue}>#{shop.shopId}</span>
                        </li>
                    </ul>
                </aside>
            </div>
        </BizPage>
    );
}
