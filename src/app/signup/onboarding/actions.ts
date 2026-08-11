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
 *
 * The handle rules, availability lookup, and profile write live in the shared
 * @/lib/profile-handle module so this flow and the shop account editor
 * (/shop/[slug]/account) enforce identical validation without duplication.
 *
 * NOTE: this action NEVER touches shop_memberships. Consumer onboarding grants
 * a profile, never shop access — that only comes from an admin staff invite.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import {
    checkHandleAvailability,
    saveProfileFields,
    type HandleCheck,
} from '@/lib/profile-handle';

export type { HandleCheck };

/**
 * Live availability check for the handle field. Returns { ok:true } only when
 * the handle is valid AND not already taken by another profile.
 */
export async function checkHandleAction(raw: string): Promise<HandleCheck> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, reason: 'Session expired — refresh.' };
    return checkHandleAvailability(raw, me.profileId);
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

    const res = await saveProfileFields({
        profileId: me.profileId,
        handle: input.handle,
        displayName: input.displayName,
        bio: input.bio,
    });
    if (!res.ok) return { ok: false, error: res.error };

    redirect(safeNext(input.next) ?? '/me');
}
