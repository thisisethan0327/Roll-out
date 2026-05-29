/**
 * /shop — post-auth router.
 * Resolves where to land based on memberships + last-active cookie:
 *   - 0 shops    → dead-end ("not a shop member")
 *   - 1 shop     → /shop/<slug>/overview
 *   - 2+ shops   → /shop/picker  (or last-active if cookie matches)
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireSession, listMyShops } from '@/lib/auth-guard';

const ACTIVE_SHOP_COOKIE = 'rollout_active_shop';

export default async function ShopRootRouter() {
    const { profile } = await requireSession('/shop/login');
    const shops = await listMyShops(profile.profileId);

    if (shops.length === 0) {
        redirect('/shop/login?error=not_member');
    }

    if (shops.length === 1) {
        redirect(`/shop/${shops[0].slug}/overview`);
    }

    const cookieStore = await cookies();
    const active = cookieStore.get(ACTIVE_SHOP_COOKIE)?.value;
    if (active && shops.some((s) => s.slug === active)) {
        redirect(`/shop/${active}/overview`);
    }
    redirect('/shop/picker');
}
