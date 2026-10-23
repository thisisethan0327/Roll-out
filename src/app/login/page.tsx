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
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { OtpLoginForm } from '@/components/auth/OtpLoginForm';
import { AuthShell } from '@/components/glide-auth/AuthShell';

// A sign-in / application door: crawlable, never a search result (no ?next= duplicates).
export const metadata = { title: 'Sign In', robots: { index: false, follow: true } };

/** Only allow same-origin absolute paths, never protocol-relative (`//evil`). */
function safeNext(raw: string | undefined): string {
    if (!raw) return '/meets';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/meets';
    return raw;
}

export default async function ConsumerLoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        next?: string;
        error?: string;
        email?: string;
        step?: string;
        notice?: string;
    }>;
}) {
    const { next, error, email, step, notice } = await searchParams;
    const successPath = safeNext(next);
    const startAtCode = step === 'code';
    // Carry ?next onward so "New here? → /signup" returns the member to the same
    // destination after onboarding.
    const signupHref =
        next && next.startsWith('/') && !next.startsWith('//')
            ? `/signup?next=${encodeURIComponent(next)}`
            : '/signup';

    return (
        <AuthShell
            title="Sign in"
            sub="We'll email you a 6-digit code. Enter it here and you're in, no password."
            foot={
                <>
                    New here?{' '}
                    <Link href={signupHref} className="ga-inline">
                        Create your account
                    </Link>
                </>
            }
            terms={
                <>
                    By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                </>
            }
        >
            {error === 'rsvp' && (
                <div className="ga-note">
                    <p className="g-note" role="status">
                        <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
                        <span>Sign in to RSVP to this meet.</span>
                    </p>
                </div>
            )}
            <OtpLoginForm
                successPath={successPath}
                redirectSuffix="/login"
                allowSignup
                initialEmail={email ?? ''}
                startAtCode={startAtCode}
                notice={notice}
                look="glide"
            />
        </AuthShell>
    );
}
