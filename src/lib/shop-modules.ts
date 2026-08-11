/**
 * TIER MODULE GATING — single source of truth for which shop-console modules
 * each commerce tier unlocks, plus per-shop overrides.
 *
 * A shop's `commerce_tier` (rollout.shops.commerce_tier: 1/2/3) selects a base
 * module set; `rollout.shops.module_overrides` (jsonb, migration 038) then
 * force-enables or force-disables individual modules on top of that baseline.
 *
 *   T1 (e.g. NeferStock) — storefront-only console.
 *   T2 (e.g. divine)      — T1 + customers (+ order-stages, reserved).
 *   T3 (e.g. EMWRAPS)     — everything (adds the job-domain SaaS modules).
 *
 * REVERSIBILITY / SAFETY: this module governs NAV VISIBILITY and ROUTE GUARDS
 * only. Disabling a module hides its sidebar link and 404s its section routes —
 * it never touches, hides, or deletes any shop DATA. Widening a shop's access
 * is a pure config change (raise commerce_tier, or set a `module_overrides`
 * entry to true) and takes effect on next render with no migration. Because
 * nav-hiding alone is not security, every gated section also enforces the same
 * resolver server-side via `assertModuleEnabled` (see route guards).
 *
 * Pure + isomorphic: no DB, no `server-only`, safe to import from the client
 * sidebar as well as server layouts/guards. The DB resolvers that feed it live
 * in `@/lib/auth-guard` (server-only).
 */
import { notFound } from 'next/navigation';

/** Every gateable shop-console module. Values are stable identifiers that
 *  double as the section route segment where one exists (e.g. `kiosk-events`,
 *  `settings` covers `settings/*`). `order-stages` is reserved: T2+ grants it
 *  but no route ships yet. */
export enum ModuleKey {
    Overview = 'overview',
    Inbox = 'inbox',
    Messages = 'messages',
    Calendar = 'calendar',
    Tickets = 'tickets',
    Customers = 'customers',
    Products = 'products',
    Orders = 'orders',
    OrderStages = 'order-stages', // reserved — no route yet (T2+ once built)
    Posts = 'posts',
    Events = 'events',
    KioskEvents = 'kiosk-events',
    Reviews = 'reviews',
    Page = 'page',
    Account = 'account',
    Staff = 'staff',
    Services = 'services',
    Settings = 'settings',
}

/** Per-shop overrides: module key → force-on (true) / force-off (false). */
export type ModuleOverrides = Partial<Record<ModuleKey, boolean>>;

/** Minimal shop shape the resolver needs — mirrors the two rollout.shops cols. */
export type ShopModuleConfig = {
    commerce_tier: number | null;
    module_overrides: ModuleOverrides | null;
};

// Tier 1 — storefront-only console.
const TIER1: ModuleKey[] = [
    ModuleKey.Overview,
    ModuleKey.Products,
    ModuleKey.Orders,
    ModuleKey.Messages,
    ModuleKey.Posts,
    ModuleKey.Events,
    ModuleKey.Reviews,
    ModuleKey.Page,
    ModuleKey.Staff,
    ModuleKey.Settings,
    ModuleKey.Account,
];

// Tier 2 — adds customer records (+ reserved order-stages).
const TIER2: ModuleKey[] = [...TIER1, ModuleKey.Customers, ModuleKey.OrderStages];

// Tier 3 — everything (the job-domain SaaS surface).
const TIER3: ModuleKey[] = [
    ...TIER2,
    ModuleKey.Inbox,
    ModuleKey.Calendar,
    ModuleKey.Tickets,
    ModuleKey.KioskEvents,
    ModuleKey.Services,
];

/** Base module set per commerce tier. Unknown tiers fall back to T1. */
export const TIER_MODULES: Record<number, ModuleKey[]> = {
    1: TIER1,
    2: TIER2,
    3: TIER3,
};

const KNOWN_KEYS: ReadonlySet<string> = new Set(Object.values(ModuleKey));

/**
 * Resolve the effective enabled-module set: tier baseline ± overrides.
 * Unknown override keys are ignored defensively so a stray jsonb entry can
 * never widen access to a module that doesn't exist.
 */
export function enabledModules(
    tier: number | null | undefined,
    overrides: ModuleOverrides | null | undefined = {},
): Set<ModuleKey> {
    const base = new Set(TIER_MODULES[tier ?? 1] ?? TIER_MODULES[1]);
    for (const [key, on] of Object.entries(overrides ?? {})) {
        if (!KNOWN_KEYS.has(key)) continue;
        if (on) base.add(key as ModuleKey);
        else base.delete(key as ModuleKey);
    }
    return base;
}

/** Convenience predicate over `enabledModules`. */
export function isModuleEnabled(
    tier: number | null | undefined,
    overrides: ModuleOverrides | null | undefined,
    key: ModuleKey,
): boolean {
    return enabledModules(tier, overrides).has(key);
}

/**
 * Shared route guard: 404 (via Next `notFound()`) when `key` is not enabled for
 * the given shop. Callers resolve the shop's tier + overrides first (see the
 * server resolvers in `@/lib/auth-guard`). Nav-hiding is cosmetic; THIS is the
 * enforcement boundary that keeps a lower-tier member out of a gated section
 * even by direct URL.
 */
export function assertModuleEnabled(shop: ShopModuleConfig, key: ModuleKey): void {
    if (!isModuleEnabled(shop.commerce_tier, shop.module_overrides, key)) {
        notFound();
    }
}
