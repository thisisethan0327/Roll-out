/**
 * Auth guards used by /admin and /shop routes.
 *
 * Pattern:
 *   const { profile } = await requirePlatformAdmin();   // throws or redirects
 *   // … now safe to query as admin
 *
 * Returns the caller's rollout.profiles row so consumers don't have to
 * re-query. The session check uses the SSR cookie-backed client; the
 * `platform_admins` lookup uses the admin client to bypass RLS (we already
 * trust the session — we just need to know whether the user is on the list).
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin } from './supabase/admin';

export type GuardedProfile = {
    profileId: string;
    authUserId: string;
    email: string | null;
    displayName: string;
    handle: string;
};

/**
 * Ensures the caller is signed in. Redirects to the supplied login route
 * (default `/admin/login`) when not. Returns the profile row and Supabase
 * server client for chained queries.
 */
export async function requireSession(loginPath: string = '/admin/login'): Promise<{
    profile: GuardedProfile;
}> {
    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(loginPath);

    const admin = getSupabaseAdmin();
    const { data: profile, error } = await admin
        .from('profiles')
        .select('id, auth_user_id, handle, display_name')
        .eq('auth_user_id', user.id)
        .maybeSingle();
    if (error || !profile) {
        // Auth user exists but no rollout profile — sign them out + redirect.
        await supabase.auth.signOut();
        redirect(loginPath + '?error=no_profile');
    }

    return {
        profile: {
            profileId: (profile as any).id,
            authUserId: user.id,
            email: user.email ?? null,
            displayName: (profile as any).display_name,
            handle: (profile as any).handle,
        },
    };
}

/**
 * Ensures the caller is on rollout.platform_admins. Redirects to /admin/login
 * with a notice when not.
 */
export async function requirePlatformAdmin(): Promise<{ profile: GuardedProfile }> {
    const { profile } = await requireSession('/admin/login');
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', profile.profileId)
        .maybeSingle();
    if (error || !data) redirect('/admin/login?error=not_admin');
    return { profile };
}

/**
 * Ensures the caller is a member (>= installer) of the given shop_id, OR is
 * a platform admin. Used by /shop/* routes.
 */
export async function requireShopMember(
    shopId: number,
): Promise<{ profile: GuardedProfile; role: string }> {
    const { profile } = await requireSession('/shop/login');
    const admin = getSupabaseAdmin();

    // Platform admin bypass
    const { data: padmin } = await admin
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', profile.profileId)
        .maybeSingle();
    if (padmin) return { profile, role: 'owner' };

    const { data: m } = await admin
        .from('shop_memberships')
        .select('role')
        .eq('profile_id', profile.profileId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (!m) redirect('/shop/login?error=not_member');
    return { profile, role: (m as any).role };
}

/**
 * Returns all shops the caller can act in (installer+). For the shop sidebar
 * picker. Empty array → not a shop member.
 */
export async function listMyShops(profileId: string): Promise<
    { shopId: number; slug: string; name: string; role: string }[]
> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shop_memberships')
        .select('shop_id, role, shops!inner(id, slug, name)')
        .eq('profile_id', profileId);
    return (data ?? []).map((r: any) => ({
        shopId: r.shop_id,
        slug: r.shops?.slug ?? '',
        name: r.shops?.name ?? '',
        role: r.role,
    }));
}

/**
 * Resolve a shop slug → id (via the admin client, bypassing RLS) so the layout
 * can call `requireShopMember(id, …)`. Returns null when the slug doesn't
 * exist. Used by every `/shop/[slug]/*` route's layout.
 */
export async function resolveShopSlug(slug: string): Promise<
    { shopId: number; slug: string; name: string } | null
> {
    if (!slug) return null;
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shops')
        .select('id, slug, name')
        .eq('slug', slug)
        .maybeSingle();
    if (!data) return null;
    return {
        shopId: (data as any).id,
        slug: (data as any).slug,
        name: (data as any).name,
    };
}

/**
 * Per-slug shop member guard. Wraps `requireShopMember(id, …)` with the slug
 * lookup so route handlers don't have to fan out two queries themselves.
 */
export async function requireShopMemberBySlug(slug: string): Promise<{
    profile: GuardedProfile;
    role: string;
    shop: { shopId: number; slug: string; name: string };
}> {
    const shop = await resolveShopSlug(slug);
    if (!shop) redirect('/shop/picker?error=shop_not_found');
    const { profile, role } = await requireShopMember(shop.shopId);
    return { profile, role, shop };
}
