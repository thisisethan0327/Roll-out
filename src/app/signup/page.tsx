/**
 * /signup — consumer (member) sign-up for the public web surface.
 *
 * Passwordless, so signup and login converge on the same email→OTP primitive
 * (OtpLoginForm with allowSignup) — the difference is *intent*: a first-time
 * member lands here, verifies, and is routed into onboarding (/signup/onboarding)
 * to claim a handle + display name. An existing account that lands here is signed
 * in and skips onboarding (the onboarding step detects an already-chosen handle
 * and forwards straight to ?next / /me).
 *
 * SECURITY: allowSignup makes OtpLoginForm stamp raw_user_meta_data.app='rollout'
 * on the created auth user, which is what keeps a brand-new member OUT of the
 * legacy public.profiles (EMWRAPS staff) auto-provision trigger. Never drop it.
 *
 * ?next= is carried through onboarding so an RSVP / gated page that bounced the
 * user here returns them afterward.
 */
import Link from 'next/link';
import { OtpLoginForm } from '@/components/auth/OtpLoginForm';

export const metadata = { title: 'Sign Up · Rollout' };

/** Only allow same-origin absolute paths, never protocol-relative (`//evil`). */
function safeNext(raw: string | undefined): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}

export default async function ConsumerSignupPage({
    searchParams,
}: {
    searchParams: Promise<{
        next?: string;
        email?: string;
        step?: string;
        notice?: string;
    }>;
}) {
    const { next, email, step, notice } = await searchParams;
    const cleanNext = safeNext(next);
    const startAtCode = step === 'code';
    // After OTP verify, route into onboarding, carrying ?next through so the
    // final redirect lands the member back where they intended.
    const onboardingPath = cleanNext
        ? `/signup/onboarding?next=${encodeURIComponent(cleanNext)}`
        : '/signup/onboarding';
    const loginHref = cleanNext
        ? `/login?next=${encodeURIComponent(cleanNext)}`
        : '/login';

    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">ROLLOUT</span>
                    <span>CREATE YOUR ACCOUNT</span>
                </div>
                <h1 className="admin-login-title">SIGN UP</h1>
                <p className="admin-login-sub">
                    Enter your email — we&apos;ll send a 6-digit code. No password.
                </p>

                <OtpLoginForm
                    successPath={onboardingPath}
                    redirectSuffix="/signup"
                    allowSignup
                    initialEmail={email ?? ''}
                    startAtCode={startAtCode}
                    notice={notice}
                />

                <p
                    style={{
                        marginTop: 20,
                        fontSize: 11,
                        lineHeight: 1.6,
                        color: 'var(--text-3)',
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wide)',
                        textAlign: 'center',
                    }}
                >
                    ONE ACCOUNT FOR ROLLOUT · NEFERSTOCK · EMWRAPS
                </p>

                <p
                    style={{
                        marginTop: 14,
                        fontSize: 12,
                        color: 'var(--text-2, var(--text-3))',
                        textAlign: 'center',
                    }}
                >
                    Already have an account?{' '}
                    <Link href={loginHref} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
