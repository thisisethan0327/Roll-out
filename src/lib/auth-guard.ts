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
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';
import { selectWithBan } from './ban-server';
import { isBannedUntil } from './ban';
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
 *
 * A Rollout-banned profile (banned_until in the future, migration 091) is sent
 * back to the login route with ?error=suspended: the admin and shop consoles
 * are closed to them, which also closes every shop-console server action behind
 * requireShopMember. The session is NOT ended here (sign-out is global, see
 * AdminSidebar); the login page just explains. Before 091 the column is absent
 * and nobody is banned.
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
    const { data: profile, error } = await selectWithBan('id, auth_user_id, handle, display_name', (cols) =>
        admin.from('profiles').select(cols).eq('auth_user_id', user.id).maybeSingle(),
    );
    if (error || !profile) {
        // Auth user exists but no rollout profile — sign them out + redirect.
        await supabase.auth.signOut({ scope: 'local' });
        redirect(loginPath + '?error=no_profile');
    }
    if (isBannedUntil((profile as any).banned_until)) redirect(loginPath + '?error=suspended');

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
    const { data: profile } = await selectWithBan('id, auth_user_id, handle, display_name', (cols) =>
        admin.from('profiles').select(cols).eq('auth_user_id', user.id).maybeSingle(),
    );
    if (!profile) return null;
    if (isBannedUntil((profile as any).banned_until)) return null;

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
): Promise<{ profile: GuardedProfile; role: string; viaPlatformAdmin: boolean }> {
    const { profile } = await requireSession('/shop/login');
    const admin = getSupabaseAdmin();

    const [{ data: padmin }, { data: m }] = await Promise.all([
        admin.from('platform_admins').select('profile_id').eq('profile_id', profile.profileId).maybeSingle(),
        admin
            .from('shop_memberships')
            .select('role')
            .eq('profile_id', profile.profileId)
            .eq('shop_id', shopId)
            .maybeSingle(),
    ]);

    // Platform admins act as owner everywhere (unchanged). They are flagged as
    // "acting as the shop" only where they are NOT on the shop's staff, so an
    // admin working their own shop keeps the normal console (cookie, SWITCH SHOP).
    if (padmin) {
        if (m) return { profile, role: 'owner', viaPlatformAdmin: false };
        // Audit trail: every admin pass into a shop they don't belong to is logged.
        console.info(
            '[auth-guard] platform admin @%s acting as owner of shop %d',
            profile.handle,
            shopId,
        );
        return { profile, role: 'owner', viaPlatformAdmin: true };
    }

    if (!m) redirect('/shop/login?error=not_member');
    return { profile, role: (m as any).role, viaPlatformAdmin: false };
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
 * Is this profile on staff at more than one shop?
 *
 * A head-only count: the one caller — the tenant-host sidebar gate — needs the
 * boolean, not the list, and runs on every console navigation. On a query
 * error it answers true, because a multi-shop user with no way to switch is a
 * worse outcome than one extra link.
 */
export async function hasMultipleShops(profileId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
        .from('shop_memberships')
        .select('shop_id', { count: 'exact', head: true })
        .eq('profile_id', profileId);
    if (error) {
        console.error('[lib/auth-guard] hasMultipleShops failed:', error.message);
        return true;
    }
    return (count ?? 0) > 1;
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
    /** True when access came from rollout.platform_admins, not a membership. */
    viaPlatformAdmin: boolean;
    shop: { shopId: number; slug: string; name: string };
}> {
    const shop = await resolveShopSlug(slug);
    if (!shop) redirect('/shop/picker?error=shop_not_found');
    const { profile, role, viaPlatformAdmin } = await requireShopMember(shop.shopId);
    return { profile, role, viaPlatformAdmin, shop };
}

/**
 * Load the pieces that drive sidebar module visibility in one shop-row read:
 *   • tier + overrides → the tier module gate (shop-modules.ts)
 *   • showProducts     → the PRODUCTS data-precondition (kept, layered on top)
 * Orders' precondition (a resolved Medusa vendor key) is fetched separately by
 * the caller via getShopVendorBySlug. Shared by the shop layout and the admin
 * event page's "shop console" panel so both resolve modules identically.
 */
export async function loadModuleContext(shopId: number): Promise<{
    tier: number | null;
    overrides: ModuleOverrides;
    showProducts: boolean;
    status: string;
    reviewNote: string | null;
}> {
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin
        .from('shops')
        .select('sells_products, medusa_category_handles, commerce_tier, module_overrides, status, review_note')
        .eq('id', shopId)
        .maybeSingle();
    const row = shopRow as any;
    const handles = row?.medusa_category_handles;
    let showProducts =
        !!row?.sells_products || (Array.isArray(handles) && handles.length > 0);
    if (!showProducts) {
        const pub = getSupabasePublicAdmin();
        const { count } = await pub
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId);
        showProducts = (count ?? 0) > 0;
    }
    return {
        tier: row?.commerce_tier ?? null,
        overrides: (row?.module_overrides ?? {}) as ModuleOverrides,
        showProducts,
        status: (row?.status ?? 'pending') as string,
        reviewNote: (row?.review_note ?? null) as string | null,
    };
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
