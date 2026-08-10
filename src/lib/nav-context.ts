/**
 * Header navigation context for the public marketing/store chrome.
 *
 * The marketing site is deliberately cookie-free at the middleware layer (see
 * middleware.ts — the token refresh only runs on /admin, /shop, /me). So the
 * public <SiteHeader> can't cheaply read a *refreshed* session during a Server
 * Component render. Instead the header is a client component that fetches
 * `/api/nav-context` once on mount; that route handler CAN read + refresh the
 * SSR cookie session, and derives the privileged flags with the service-role
 * admin client (the anon client is RLS-blocked from reading platform_admins /
 * shop_memberships — mirrors auth-guard.ts).
 *
 * Keep this fast: at most three tiny indexed lookups + one cart-cookie read,
 * all behind a single signed-in short-circuit.
 */
import 'server-only';
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin } from './supabase/admin';
import { getCartCount } from './medusa-cart';

export type NavContext = {
    signedIn: boolean;
    displayName: string | null;
    isAdmin: boolean;
    hasShops: boolean;
    cartCount: number;
};

const SIGNED_OUT: NavContext = {
    signedIn: false,
    displayName: null,
    isAdmin: false,
    hasShops: false,
    cartCount: 0,
};

export async function getNavContext(): Promise<NavContext> {
    // Cart is session-independent (cookie-scoped), so read it regardless.
    let cartCount = 0;
    try {
        cartCount = await getCartCount();
    } catch {
        cartCount = 0;
    }

    let user = null;
    try {
        const supabase = await getSupabaseServer();
        const res = await supabase.auth.getUser();
        user = res.data.user;
    } catch {
        user = null;
    }
    if (!user) return { ...SIGNED_OUT, cartCount };

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
        .from('profiles')
        .select('id, display_name, handle')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (!profile) {
        // Authenticated but no rollout profile yet — treat as a plain member.
        return {
            signedIn: true,
            displayName: null,
            isAdmin: false,
            hasShops: false,
            cartCount,
        };
    }

    const profileId = (profile as any).id as string;
    const [adminRes, shopRes] = await Promise.all([
        admin.from('platform_admins').select('profile_id').eq('profile_id', profileId).maybeSingle(),
        admin.from('shop_memberships').select('shop_id').eq('profile_id', profileId).limit(1),
    ]);

    return {
        signedIn: true,
        displayName:
            (profile as any).display_name || (profile as any).handle || null,
        isAdmin: Boolean(adminRes.data),
        hasShops: Array.isArray(shopRes.data) && shopRes.data.length > 0,
        cartCount,
    };
}
