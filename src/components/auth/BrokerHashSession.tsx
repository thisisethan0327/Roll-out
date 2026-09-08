'use client';
/**
 * Finish a broker hand-off that arrives as tokens in the URL fragment.
 *
 * The broker mints a Supabase magic link and sends the person back to this
 * origin with #access_token=…&refresh_token=…&type=magiclink. Nothing on the
 * console consumed that: its only sign-in path was the OTP form, which calls
 * verifyOtp itself, so a hand-off landed on the login page and simply sat there
 * showing the form (run 8 console E2E, 2026-09-08).
 *
 * The fragment survives the middleware's 307 from "/" to /shop/login, because
 * browsers carry it across redirects — which is why this lives on the login
 * page rather than only at the root.
 *
 * The hash is parsed and setSession called EXPLICITLY rather than relying on
 * detectSessionInUrl: createBrowserClient defaults to the PKCE flow, and an
 * implicit-style token pair in the fragment is not what that flow expects. Doing
 * it by hand is deterministic and does not depend on a library default that
 * could change underneath us.
 *
 * Renders nothing until it has something to say, and says nothing on a page
 * loaded normally — no hash means this component is inert.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

type Phase = 'idle' | 'working' | 'error';

/** Pull the auth params out of a location hash, or null if it carries none. */
function readAuthHash(hash: string): {
    accessToken?: string;
    refreshToken?: string;
    error?: string;
} | null {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!raw) return null;
    const p = new URLSearchParams(raw);
    const accessToken = p.get('access_token') ?? undefined;
    const refreshToken = p.get('refresh_token') ?? undefined;
    const error = p.get('error_description') ?? p.get('error') ?? undefined;
    if (!accessToken && !refreshToken && !error) return null;
    return { accessToken, refreshToken, error };
}

export function BrokerHashSession({ successPath }: { successPath: string }) {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        const found = readAuthHash(window.location.hash);
        if (!found) return;
        ran.current = true;

        // Clear the fragment before anything else: it is a bearer credential,
        // and leaving it in the address bar means it survives a copied link, a
        // screenshot and the back button.
        const strip = () => {
            try {
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search,
                );
            } catch {
                // Cosmetic only if it fails.
            }
        };

        if (found.error) {
            strip();
            setPhase('error');
            setMessage(found.error);
            return;
        }
        if (!found.accessToken || !found.refreshToken || !isSupabaseConfigured()) {
            strip();
            setPhase('error');
            setMessage('That sign-in link was incomplete. Use the code below instead.');
            return;
        }

        setPhase('working');
        (async () => {
            try {
                const supabase = getSupabaseBrowser();
                const { error } = await supabase.auth.setSession({
                    access_token: found.accessToken!,
                    refresh_token: found.refreshToken!,
                });
                strip();
                if (error) {
                    setPhase('error');
                    setMessage(error.message);
                    return;
                }
                // The session now lives in cookies the server reads, so a normal
                // navigation is enough — the shop layout's guard does the rest,
                // including sending a non-member somewhere sensible.
                router.replace(successPath);
                router.refresh();
            } catch (e: any) {
                strip();
                setPhase('error');
                setMessage(e?.message ?? 'Could not complete that sign-in.');
            }
        })();
    }, [router, successPath]);

    if (phase === 'idle') return null;

    if (phase === 'working') {
        return (
            <div
                className="admin-login-sub"
                style={{ marginBottom: 14, color: 'var(--gold)', letterSpacing: '0.08em' }}
            >
                SIGNING YOU IN…
            </div>
        );
    }

    return (
        <div className="admin-login-error" style={{ marginBottom: 14 }}>
            {message ?? 'Could not complete that sign-in.'}
        </div>
    );
}
