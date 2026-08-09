/**
 * /login — consumer (member) sign-in for the public web surface.
 *
 * Reuses the shared email-OTP form, but with allowSignup enabled so first-time
 * members can create an account straight from the web (their rollout.profiles
 * row is minted lazily on first action via public.ensure_rollout_profile — see
 * lib/consumer.ts). Supports ?next= redirect-back so an RSVP prompt can send
 * the user here and land them back on the event afterward.
 *
 * No middleware involvement: gating for authenticated areas lives in the
 * destination server components themselves.
 */
import { OtpLoginForm } from '@/components/auth/OtpLoginForm';

export const metadata = { title: 'Sign In · Rollout' };

/** Only allow same-origin absolute paths, never protocol-relative (`//evil`). */
function safeNext(raw: string | undefined): string {
    if (!raw) return '/meets';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/meets';
    return raw;
}

export default async function ConsumerLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; error?: string }>;
}) {
    const { next, error } = await searchParams;
    const successPath = safeNext(next);

    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">ROLLOUT</span>
                    <span>MEMBER ACCESS · MEETS + RSVP</span>
                </div>
                <h1 className="admin-login-title">SIGN IN</h1>
                <p className="admin-login-sub">
                    Email OTP. New here? Entering your email signs you up.
                </p>
                {error === 'rsvp' && (
                    <div className="admin-login-error">
                        Sign in to RSVP to this meet.
                    </div>
                )}
                <OtpLoginForm successPath={successPath} redirectSuffix="/login" allowSignup />
            </div>
        </div>
    );
}
