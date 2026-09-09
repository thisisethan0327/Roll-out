/**
 * The one definition of "this member has not finished onboarding yet".
 *
 * rollout.handle_new_auth_user mints a placeholder handle (u_<8 hex>) and the
 * display name 'NEW USER' the moment an auth user exists; ensure_rollout_profile
 * can add a _<6 hex> suffix. Only /signup forced the onboarding form, so a
 * member who came in by any other door — /login, an event page's SIGN IN, an
 * invitation link — RSVP'd and posted as "NEW USER" / @u_8c18f177, and the
 * host's attendee list and notifications read that way too (run R12: R1, R4,
 * RC). Ethan's ruling 2026-09-09: whichever door, a placeholder profile goes
 * through onboarding first, carrying next= so it lands where it was going.
 *
 * Two enforcement points, both importing THIS regex so they cannot drift:
 *   - /auth/landing, which every sign-in now passes through after the browser
 *     consumes the token (the callback itself is client-side and cannot read
 *     the profile);
 *   - requireConsumer(), for a member who signed in some other day and is
 *     coming back to a gated page still on the placeholder.
 */
export const PLACEHOLDER_HANDLE = /^u_[0-9a-f]{8}(_[0-9a-f]{6})?$/i;

export function isPlaceholderHandle(handle: string | null | undefined): boolean {
    return !!handle && PLACEHOLDER_HANDLE.test(handle);
}

/** Same-origin path or nothing — never an absolute URL, never protocol-relative. */
export function safeNextPath(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}

const ONBOARDING = '/signup/onboarding';

/** True when `path` is the onboarding flow itself — never bounce into a loop. */
export function isOnboardingPath(path: string | null | undefined): boolean {
    return !!path && path.startsWith(ONBOARDING);
}

export function onboardingUrl(next: string | null | undefined): string {
    const n = safeNextPath(next);
    return n && !isOnboardingPath(n) ? `${ONBOARDING}?next=${encodeURIComponent(n)}` : ONBOARDING;
}
