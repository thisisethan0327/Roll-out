/**
 * Shared profile-handle logic — the single source of truth for handle
 * validation, availability checks, and profile-field writes.
 *
 * Reused by:
 *   - /signup/onboarding/actions.ts  (first-run consumer onboarding; redirects)
 *   - /shop/[slug]/account/actions.ts (shop member editing their OWN profile)
 *
 * Keeping this here (rather than duplicating the regex / reserved list / write)
 * guarantees onboarding and the account editor enforce identical rules. Callers
 * supply the acting profileId — this module never resolves *who* the caller is,
 * so each surface keeps its own auth guard (consumer session vs shop member).
 *
 * Server-only: uses the service-role admin client (rollout schema).
 */
import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 3–20 chars, must start with a letter, then lowercase letters / digits /
// underscores. Keeps handles URL-safe (/u/<handle>) and human-readable.
const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/;

// Route segments and system names that must not become a public /u/<handle>.
const RESERVED = new Set([
    'admin', 'api', 'app', 'auth', 'me', 'shop', 'shops', 'store', 'login',
    'signup', 'signout', 'logout', 'settings', 'setting', 'support', 'help',
    'rollout', 'event', 'events', 'meet', 'meets', 'u', 'user', 'users',
    'about', 'terms', 'privacy', 'legal', 'contact', 'null', 'undefined',
    'neferstock', 'emwraps', 'divine', 'team', 'root', 'system',
]);

export type HandleCheck = { ok: boolean; reason?: string };

/** Normalize raw input to the canonical handle form (lowercase, strip @). */
export function normalizeHandle(raw: string): string {
    return raw.trim().toLowerCase().replace(/^@+/, '');
}

/** Pure validation (no DB) — shared by check + claim. */
export function validateHandle(handle: string): HandleCheck {
    if (!handle) return { ok: false, reason: 'Enter a handle.' };
    if (handle.length < 3) return { ok: false, reason: 'At least 3 characters.' };
    if (handle.length > 20) return { ok: false, reason: 'At most 20 characters.' };
    if (!HANDLE_RE.test(handle)) {
        return {
            ok: false,
            reason: 'Letters, numbers, underscores. Must start with a letter.',
        };
    }
    if (RESERVED.has(handle)) return { ok: false, reason: 'That handle is reserved.' };
    return { ok: true };
}

/**
 * Live availability check for a handle. Returns { ok:true } only when the
 * handle is valid AND not already taken by another profile. `meProfileId` is
 * the acting profile — its own current handle never counts as "taken".
 */
export async function checkHandleAvailability(
    raw: string,
    meProfileId: string,
): Promise<HandleCheck> {
    const handle = normalizeHandle(raw);
    const v = validateHandle(handle);
    if (!v.ok) return v;

    const admin = getSupabaseAdmin();
    // citext column → equality is case-insensitive, matching the UNIQUE index.
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .maybeSingle();
    if (error) return { ok: false, reason: 'Check failed — try again.' };
    if (data && (data as any).id !== meProfileId) {
        return { ok: false, reason: 'That handle is taken.' };
    }
    return { ok: true };
}

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Validate + persist a profile's handle / display name / bio. Race-safe: the
 * citext UNIQUE index is the real gate, so a 23505 on write is surfaced as a
 * friendly "just taken" message. Never touches shop_memberships — this only
 * writes rollout.profiles for the supplied profileId.
 */
export async function saveProfileFields(input: {
    profileId: string;
    handle: string;
    displayName: string;
    bio?: string;
}): Promise<SaveProfileResult> {
    const handle = normalizeHandle(input.handle);
    const v = validateHandle(handle);
    if (!v.ok) return { ok: false, error: v.reason ?? 'Invalid handle.' };

    const displayName = input.displayName.trim().slice(0, 60);
    if (!displayName) return { ok: false, error: 'Enter a display name.' };
    const bio = (input.bio ?? '').trim().slice(0, 280) || null;

    const admin = getSupabaseAdmin();

    // Pre-check availability (nice error); the UNIQUE index is the real gate.
    const { data: clash, error: clashError } = await admin
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .maybeSingle();
    if (clashError) console.error('[lib/profile-handle] saveProfileFields clash check failed:', clashError.message);
    if (clash && (clash as any).id !== input.profileId) {
        return { ok: false, error: 'That handle is taken. Pick another.' };
    }

    const { error } = await admin
        .from('profiles')
        .update({
            handle,
            display_name: displayName,
            bio,
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.profileId);

    if (error) {
        // 23505 = unique_violation → someone claimed it in the race window.
        if ((error as any).code === '23505') {
            return { ok: false, error: 'That handle was just taken. Pick another.' };
        }
        return { ok: false, error: error.message };
    }

    return { ok: true };
}
