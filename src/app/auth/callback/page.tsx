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
import { LoaderCircle } from 'lucide-react';
import { AuthShell } from '@/components/glide-auth/AuthShell';

export const metadata = { title: 'Signing you in' };
export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
    return (
        <AuthShell
            title={
                <>
                    Signing you in
                    <LoaderCircle size={26} strokeWidth={2} className="g-spin" aria-hidden="true" />
                </>
            }
            sub="Hold tight while we check your secure link."
        >
            <Suspense fallback={null}>
                <AuthCallbackClient />
            </Suspense>
        </AuthShell>
    );
}
