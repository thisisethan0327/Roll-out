'use server';
/**
 * Server actions for the shop console's MY ACCOUNT page.
 *
 * A signed-in shop member edits THEIR OWN rollout.profiles row — handle,
 * display name, bio. Content is shop-agnostic (it's the session user's global
 * profile); the slug is only used by the auth guard to prove the caller is a
 * member of *some* shop before we let them act. We always write the session
 * user's own profileId, never another member's — so there is no cross-member
 * write surface even if a member passes a different shop's slug.
 *
 * Validation, availability, and the write are shared with consumer onboarding
 * via @/lib/profile-handle, so both surfaces enforce identical handle rules.
 * Unlike onboarding's claimProfileAction, saveAccountAction does NOT redirect —
 * it returns a result so the account form can show an inline "saved" state.
 */
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import {
    checkHandleAvailability,
    saveProfileFields,
    type HandleCheck,
    type SaveProfileResult,
} from '@/lib/profile-handle';

export type { HandleCheck, SaveProfileResult };

/** Live availability check for the handle field (debounced from the client). */
export async function checkAccountHandleAction(
    slug: string,
    raw: string,
): Promise<HandleCheck> {
    const { profile } = await requireShopMemberBySlug(slug);
    return checkHandleAvailability(raw, profile.profileId);
}

/** Persist the caller's own profile edits. Returns a result (no redirect). */
export async function saveAccountAction(
    slug: string,
    input: { handle: string; displayName: string; bio?: string },
): Promise<SaveProfileResult> {
    const { profile } = await requireShopMemberBySlug(slug);
    return saveProfileFields({
        profileId: profile.profileId,
        handle: input.handle,
        displayName: input.displayName,
        bio: input.bio,
    });
}
