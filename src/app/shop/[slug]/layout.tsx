/**
 * Per-shop layout — enforces shop membership once per navigation and renders
 * the sidebar + content shell. Every child page inherits the gate.
 *
 * Also writes the active-shop cookie so subsequent /shop visits land here by
 * default (instead of bouncing through the picker every time).
 */
import { cookies } from 'next/headers';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { ShopSidebar } from './ShopSidebar';

const ACTIVE_SHOP_COOKIE = 'rollout_active_shop';

export default async function ShopLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { profile, role, shop } = await requireShopMemberBySlug(slug);

    // Persist "last active shop" so /shop root → this slug next time. 30-day
    // sliding window so it expires for long-inactive users.
    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_SHOP_COOKIE)?.value !== slug) {
        try {
            cookieStore.set(ACTIVE_SHOP_COOKIE, slug, {
                path: '/',
                httpOnly: false,           // readable by client for the sidebar's switcher
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30,
            });
        } catch {
            // Server Component context can't write cookies on every render;
            // middleware refresh handles persistence for follow-up navs.
        }
    }

    return (
        <div className="shop-layout">
            <ShopSidebar
                slug={shop.slug}
                shopName={shop.name}
                callerHandle={profile.handle}
                callerRole={role}
            />
            <div className="admin-main">{children}</div>
        </div>
    );
}
