'use server';
/**
 * Server actions for first-run consumer onboarding (/signup/onboarding).
 *
 * Two actions:
 *   - checkHandleAction(handle): live availability + validity check for the
 *     handle field (called debounced from the client).
 *   - claimProfileAction(...): validates + writes the chosen handle / display
 *     name / bio onto the member's rollout.profiles row, then redirects to
 *     ?next or /me.
 *
 * Both are gated on a signed-in member via getConsumerProfile() — a caller
 * without a session gets bounced (claim) or a benign "unavailable" (check).
 * Handle uniqueness is ultimately enforced by the citext UNIQUE column; we
 * pre-check for UX and treat a 23505 on write as "taken" (race-safe).
 *
 * NOTE: this action NEVER touches shop_memberships. Consumer onboarding grants
 * a profile, never shop access — that only comes from an admin staff invite.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
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
function normalizeHandle(raw: string): string {
    return raw.trim().toLowerCase().replace(/^@+/, '');
}

/** Pure validation (no DB) — shared by check + claim. */
function validateHandle(handle: string): HandleCheck {
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
 * Live availability check for the handle field. Returns { ok:true } only when
 * the handle is valid AND not already taken by another profile.
 */
export async function checkHandleAction(raw: string): Promise<HandleCheck> {
    const handle = normalizeHandle(raw);
    const v = validateHandle(handle);
    if (!v.ok) return v;

    const me = await getConsumerProfile();
    if (!me) return { ok: false, reason: 'Session expired — refresh.' };

    const admin = getSupabaseAdmin();
    // citext column → equality is case-insensitive, matching the UNIQUE index.
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .maybeSingle();
    if (error) return { ok: false, reason: 'Check failed — try again.' };
    if (data && (data as any).id !== me.profileId) {
        return { ok: false, reason: 'That handle is taken.' };
    }
    return { ok: true };
}

/** Same-origin next guard (mirrors the signup/login pages). */
function safeNext(raw: string | undefined | null): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}

export type ClaimResult = { ok: false; error: string };

/**
 * Commit the member's onboarding choices. On success this REDIRECTS (throws the
 * Next redirect) and never returns; on validation failure it returns an error
 * for the form to render.
 */
export async function claimProfileAction(input: {
    handle: string;
    displayName: string;
    bio?: string;
    next?: string;
}): Promise<ClaimResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };

    const handle = normalizeHandle(input.handle);
    const v = validateHandle(handle);
    if (!v.ok) return { ok: false, error: v.reason ?? 'Invalid handle.' };

    const displayName = input.displayName.trim().slice(0, 60);
    if (!displayName) return { ok: false, error: 'Enter a display name.' };
    const bio = (input.bio ?? '').trim().slice(0, 280) || null;

    const admin = getSupabaseAdmin();

    // Pre-check availability (nice error); the UNIQUE index is the real gate.
    const { data: clash } = await admin
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .maybeSingle();
    if (clash && (clash as any).id !== me.profileId) {
        return { ok: false, error: 'That handle is taken. Pick another.' };
    }

    const { error } = await admin
        .from('profiles')
        .update({ handle, display_name: displayName, bio, updated_at: new Date().toISOString() })
        .eq('id', me.profileId);

    if (error) {
        // 23505 = unique_violation → someone claimed it in the race window.
        if ((error as any).code === '23505') {
            return { ok: false, error: 'That handle was just taken. Pick another.' };
        }
        return { ok: false, error: error.message };
    }

    redirect(safeNext(input.next) ?? '/me');
}
