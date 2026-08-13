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
import { redirect, notFound } from 'next/navigation';
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin } from './supabase/admin';
import {
    assertModuleEnabled,
    isModuleEnabled,
    type ModuleKey,
    type ModuleOverrides,
    type ShopModuleConfig,
} from './shop-modules';

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
 * Non-redirecting platform-admin check for ROUTE HANDLERS (which must return a
 * JSON 401 rather than a 307 to an HTML login page). Returns the profile when
 * the caller is signed in AND on `platform_admins`, else null. Mirrors the gate
 * in `requirePlatformAdmin` without the `redirect()` calls.
 */
export async function getPlatformAdmin(): Promise<GuardedProfile | null> {
    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
        .from('profiles')
        .select('id, auth_user_id, handle, display_name')
        .eq('auth_user_id', user.id)
        .maybeSingle();
    if (!profile) return null;

    const { data: padmin } = await admin
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', (profile as any).id)
        .maybeSingle();
    if (!padmin) return null;

    return {
        profileId: (profile as any).id,
        authUserId: user.id,
        email: user.email ?? null,
        displayName: (profile as any).display_name,
        handle: (profile as any).handle,
    };
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
    const { data, error } = await admin
        .from('shop_memberships')
        .select('shop_id, role, shops!inner(id, slug, name)')
        .eq('profile_id', profileId);
    if (error) console.error('[lib/auth-guard] listMyShops failed:', error.message);
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
    const { data, error } = await admin
        .from('shops')
        .select('id, slug, name')
        .eq('slug', slug)
        .maybeSingle();
    if (error) console.error('[lib/auth-guard] resolveShopSlug failed:', error.message);
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

// ── Tier module gating resolvers ────────────────────────────────────────────
// Thin server-side fetchers that feed the pure resolver in `@/lib/shop-modules`
// (tier baseline ± per-shop overrides). Gating is nav + route-guard only and
// never touches shop data — see the reversibility note in shop-modules.ts.

/** Fetch a shop's tier + overrides by slug (admin client, bypasses RLS). */
export async function getShopModuleConfigBySlug(
    slug: string,
): Promise<ShopModuleConfig | null> {
    if (!slug) return null;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shops')
        .select('commerce_tier, module_overrides')
        .eq('slug', slug)
        .maybeSingle();
    if (error) console.error('[lib/auth-guard] getShopModuleConfigBySlug failed:', error.message);
    if (!data) return null;
    return {
        commerce_tier: (data as any).commerce_tier ?? null,
        module_overrides: ((data as any).module_overrides ?? {}) as ModuleOverrides,
    };
}

/**
 * Section route guard: `notFound()` unless `key` is enabled for the shop `slug`.
 * Drop this in a gated section's `layout.tsx` so every nested route inherits the
 * check — nav-hiding in the sidebar is not a security boundary; this is.
 */
export async function requireShopModule(slug: string, key: ModuleKey): Promise<void> {
    const cfg = await getShopModuleConfigBySlug(slug);
    if (!cfg) notFound();
    assertModuleEnabled(cfg, key);
}

/**
 * Boolean module check by shop id (for server actions that already hold a
 * shopId rather than a slug — e.g. the inbox → tickets SaaS bridge).
 */
export async function isShopModuleEnabledById(
    shopId: number,
    key: ModuleKey,
): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shops')
        .select('commerce_tier, module_overrides')
        .eq('id', shopId)
        .maybeSingle();
    if (error) console.error('[lib/auth-guard] isShopModuleEnabledById failed:', error.message);
    if (!data) return false;
    return isModuleEnabled(
        (data as any).commerce_tier,
        ((data as any).module_overrides ?? {}) as ModuleOverrides,
        key,
    );
}
