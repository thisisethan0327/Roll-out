'use client';
/**
 * Consumes every arrival shape a Supabase GoTrue action link can produce, then
 * hard-navigates to `next` so the SSR cookie the session just wrote is visible
 * to the server auth guards.
 *
 * Why a single client component covers all shapes:
 *   - Invite / magic-link buttons in our branded emails route through GoTrue's
 *     `/auth/v1/verify` endpoint, which 302s back here with the session in the
 *     URL **hash fragment** (`#access_token=…&refresh_token=…`). A fragment is
 *     never sent to the server, so only client JS can read it — this is the
 *     PRIMARY path for staff invites (admin-generated links have no PKCE
 *     verifier, so GoTrue always uses the implicit/hash grant).
 *   - Same-device OTP magic-link taps can instead arrive as `?code=` (PKCE) —
 *     the browser client holds the matching code_verifier cookie.
 *   - A future hook that links straight here can arrive as `?token_hash=&type=`.
 *
 * All three are consumed with the cookie-backed browser client (createBrowserClient),
 * which persists the session to cookies the middleware/SSR guards read.
 *
 * On ANY failure we bounce to the appropriate login page with the email
 * prefilled and the form parked on the code-entry step, so the founder only has
 * to type the 6-digit code from the same email (never re-type his address).
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

/** Same-origin relative paths only — never protocol-relative (`//evil`). */
function safeNext(raw: string | null): string {
    if (!raw) return '/me';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/me';
    return raw;
}

/** Pick the login surface that matches where the link was trying to send them. */
function loginPathFor(next: string): string {
    if (next.startsWith('/shop')) return '/shop/login';
    if (next.startsWith('/admin')) return '/admin/login';
    return '/login';
}

export function AuthCallbackClient() {
    const ranRef = useRef(false);
    const [fatal, setFatal] = useState<string | null>(null);

    useEffect(() => {
        // A magic link is single-use; never run the consume twice (StrictMode).
        if (ranRef.current) return;
        ranRef.current = true;

        const run = async () => {
            const search = new URLSearchParams(window.location.search);
            const hash = new URLSearchParams(
                window.location.hash.startsWith('#')
                    ? window.location.hash.slice(1)
                    : window.location.hash,
            );

            const next = safeNext(search.get('next'));
            const email = search.get('email') ?? hash.get('email') ?? '';

            const bounceToLogin = (notice: string) => {
                const params = new URLSearchParams();
                if (email) params.set('email', email);
                params.set('step', 'code');
                params.set('notice', notice);
                // Carry next onward so the code-entry retry still lands them right.
                if (next && next !== '/me') params.set('next', next);
                window.location.replace(`${loginPathFor(next)}?${params.toString()}`);
            };

            if (!isSupabaseConfigured()) {
                setFatal(
                    'Sign-in is temporarily unavailable (deploy config missing). Please try again shortly.',
                );
                return;
            }

            // GoTrue can hand back an explicit error (expired/used link) in either
            // the query or the fragment — treat both as "enter the code instead".
            if (search.get('error') || hash.get('error')) {
                bounceToLogin('link_expired');
                return;
            }

            const supabase = getSupabaseBrowser();

            try {
                const accessToken = hash.get('access_token');
                const refreshToken = hash.get('refresh_token');
                const code = search.get('code');
                const tokenHash = search.get('token_hash');
                const type = search.get('type');

                if (accessToken && refreshToken) {
                    // Implicit/hash grant — the invite + magic-link primary path.
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) return bounceToLogin('link_expired');
                } else if (code) {
                    // PKCE — same-device OTP magic-link tap.
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) return bounceToLogin('link_expired');
                } else if (tokenHash && type) {
                    // token_hash link (verifyOtp) — works without a PKCE verifier.
                    const { error } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        // GoTrue email OTP types: magiclink | invite | signup | recovery | email | email_change
                        type: type as
                            | 'magiclink'
                            | 'invite'
                            | 'signup'
                            | 'recovery'
                            | 'email'
                            | 'email_change',
                    });
                    if (error) return bounceToLogin('link_expired');
                } else {
                    // Landed here with nothing to consume (bookmark, stripped hash,
                    // opened in a second tab after the fragment was cleared, …).
                    return bounceToLogin('link_expired');
                }
            } catch {
                return bounceToLogin('link_expired');
            }

            // Success — full navigation so middleware + server guards see the cookie.
            window.location.replace(next);
        };

        void run();
    }, []);

    if (fatal) {
        return <div className="admin-login-error">{fatal}</div>;
    }
    return null;
}
