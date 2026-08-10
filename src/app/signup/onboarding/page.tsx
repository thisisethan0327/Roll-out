/**
 * /signup/onboarding — first-run profile setup.
 *
 * Reached right after a member verifies their OTP on /signup. Server-gated on a
 * signed-in member (getConsumerProfile lazily mints the rollout.profiles row if
 * the app='rollout' trigger somehow hasn't fired yet). If the member has ALREADY
 * chosen a real handle — i.e. they're an existing account that used /signup as a
 * convergent sign-in, or a returning half-finished sign-up who already picked one
 * — we skip onboarding entirely and forward to ?next / /me. Only members still on
 * the auto-generated placeholder handle (u_xxxxxxxx) see the form.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import { OnboardingForm } from './OnboardingForm';

export const metadata = { title: 'Set Up Your Profile · Rollout' };
export const dynamic = 'force-dynamic';

// Placeholder-handle shapes minted by rollout.handle_new_auth_user (u_<8 hex>)
// and the ensure_rollout_profile fallback (…_<6 hex>). A handle matching these
// means the member hasn't chosen one yet.
const PLACEHOLDER_HANDLE = /^u_[0-9a-f]{8}(_[0-9a-f]{6})?$/i;

function safeNext(raw: string | undefined): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}

export default async function OnboardingPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    const { next } = await searchParams;
    const cleanNext = safeNext(next);

    const profile = await getConsumerProfile();
    if (!profile) {
        // Not signed in — send back to signup, preserving intent.
        redirect(cleanNext ? `/signup?next=${encodeURIComponent(cleanNext)}` : '/signup');
    }

    // Already onboarded → straight through (convergent sign-in path).
    if (!PLACEHOLDER_HANDLE.test(profile.handle)) {
        redirect(cleanNext ?? '/me');
    }

    const suggestedName =
        profile.displayName && profile.displayName !== 'NEW USER'
            ? profile.displayName
            : (profile.email ? profile.email.split('@')[0] : '');

    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card" style={{ maxWidth: 520 }}>
                <div className="admin-login-stamp">
                    <span className="accent">WELCOME TO ROLLOUT</span>
                    <span>SET UP YOUR PROFILE</span>
                </div>
                <h1 className="admin-login-title">CLAIM YOUR HANDLE</h1>
                <p className="admin-login-sub">
                    This is how the community finds you at rollout.club/u/&lt;handle&gt;.
                </p>
                <OnboardingForm
                    suggestedName={suggestedName}
                    next={cleanNext ?? undefined}
                />
            </div>
        </div>
    );
}
