'use server';

/**
 * Which emails sign in with a PASSWORD on rollout.club instead of the emailed
 * 6-digit code. Kept server-side so the list never ships in the JS bundle;
 * the login form asks once the typed address looks complete.
 *
 * - appreview@rollout.club — the App Store reviewer's demo account (the app
 *   has the same exception, src/lib/auth.ts APP_REVIEW_EMAIL).
 * - Ethan's own account (owner request, 2026-09-28: "when I type it in, it
 *   changes to password instead").
 *
 * Everyone else keeps email-code sign-in. The password itself is checked by
 * Supabase Auth (signInWithPassword) — nothing here sees it.
 */
const PASSWORD_LOGIN_EMAILS = new Set(['appreview@rollout.club', 'thisisethan0327@gmail.com']);

export async function usesPasswordLogin(email: string): Promise<boolean> {
    return PASSWORD_LOGIN_EMAILS.has(String(email || '').trim().toLowerCase());
}
