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
import { AuthShell } from '@/components/glide-auth/AuthShell';

// A sign-in / application door: crawlable, never a search result (no ?next= duplicates).
export const metadata = { title: 'Sign Up', robots: { index: false, follow: true } };

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
        <AuthShell
            title="Create your account"
            sub="Enter your email and we'll send a 6-digit code. No password."
            foot={
                <>
                    Already have an account?{' '}
                    <Link href={loginHref} className="ga-inline">
                        Sign in
                    </Link>
                </>
            }
            terms={
                <>
                    By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                </>
            }
        >
            <OtpLoginForm
                successPath={onboardingPath}
                redirectSuffix="/signup"
                allowSignup
                initialEmail={email ?? ''}
                startAtCode={startAtCode}
                notice={notice}
                look="glide"
            />
        </AuthShell>
    );
}
