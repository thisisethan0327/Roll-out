/**
 * /auth/callback — the single landing target for every Supabase auth email link
 * (staff invites, consumer magic links, admin sign-in). It consumes the token
 * client-side (see AuthCallbackClient — the session can arrive in the URL hash,
 * which only the browser can read) and forwards to `?next=`.
 *
 * Before this route existed, invite/magic-link buttons pointed at /shop/login,
 * whose server component ignored the token entirely — the founder landed on an
 * empty SIGN IN form and had to re-request a code.
 */
import { Suspense } from 'react';
import { AuthCallbackClient } from './AuthCallbackClient';
import { Dots } from '@/components/feedback';

export const metadata = { title: 'Signing you in · Rollout' };
export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">ROLLOUT</span>
                    <span>VERIFYING ACCESS</span>
                </div>
                <h1 className="admin-login-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    SIGNING YOU IN <Dots />
                </h1>
                <p className="admin-login-sub">
                    Hold tight — consuming your secure link.
                </p>
                <Suspense fallback={null}>
                    <AuthCallbackClient />
                </Suspense>
            </div>
        </div>
    );
}
