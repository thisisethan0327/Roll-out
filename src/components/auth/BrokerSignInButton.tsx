'use client';
/**
 * One-click sign-in through the House broker.
 *
 * Somebody already signed in on UNITY, NeferStock or EMWRAPS should not have to
 * type a six-digit code to open their own shop console. The broker holds the
 * identity and hands it across; this is just the door.
 *
 * The return URL is decided SERVER-side and passed in, because the broker's
 * allowlist is per origin AND per path — it refuses anything it was not told
 * about, and a button that reliably lands on the broker's error page is worse
 * than no button. When the current host has no allowlisted console return, the
 * page renders nothing here and the code form stands alone.
 */
import { useState } from 'react';

export function BrokerSignInButton({
    brokerOrigin,
    returnUrl,
    next,
}: {
    brokerOrigin: string;
    returnUrl: string;
    /** Where to go once signed in, if the console sent them here with a ?next=. */
    next?: string | null;
}) {
    const [going, setGoing] = useState(false);

    if (!brokerOrigin || !returnUrl) return null;

    return (
        <div style={{ marginBottom: 18 }}>
            <button
                type="button"
                className="admin-action-btn"
                style={{ width: '100%' }}
                disabled={going}
                onClick={() => {
                    setGoing(true);
                    // The broker may only return to an allowlisted path and
                    // drops the query string, so a pending destination waits
                    // here, on this origin, and the console picks it up.
                    try {
                        if (next && next.startsWith('/') && !next.startsWith('//')) {
                            window.sessionStorage.setItem('rollout:after-signin', next);
                        }
                    } catch {
                        // Private mode: they land on the console root instead.
                    }
                    window.location.assign(
                        `${brokerOrigin}/id/start?return=${encodeURIComponent(returnUrl)}`,
                    );
                }}
                data-testid="broker-signin-button"
            >
                {going ? 'TAKING YOU THERE…' : 'CONTINUE WITH YOUR ACCOUNT'}
            </button>
            <p className="admin-handle" style={{ fontSize: 10, marginTop: 6 }}>
                Signed in on EMWRAPS, NeferStock or Rollout? This takes a second and
                asks for nothing.
            </p>
        </div>
    );
}
