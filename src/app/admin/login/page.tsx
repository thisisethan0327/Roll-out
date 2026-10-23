/**
 * /admin/login — email OTP gate for god mode.
 *
 * Flow: enter email → request OTP → enter 6-digit code → server verifies →
 * cookie session set → redirect to /admin/overview. The post-verify guard
 * checks rollout.platform_admins; non-admins get bounced back here with
 * ?error=not_admin.
 *
 * Glide (board G1 "Sign in"): the shared sign-in sheet without the cover
 * imagery, since this is an operator door rather than a welcome.
 */
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { AuthShell } from '@/components/glide-auth/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Admin · Sign In' };

const ERRORS: Record<string, string> = {
    not_admin: 'Access denied. Your account is not on rollout.platform_admins.',
    no_profile: 'No Rollout profile for that account. Sign up via the mobile app first.',
    suspended: 'This Rollout account is suspended. The console is closed to it.',
    verify_failed: 'Code rejected. Try again.',
};

export default async function AdminLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    const message = error ? ERRORS[error] : undefined;
    return (
        <AuthShell
            bare
            cover={false}
            title="Admin sign in"
            sub={
                <>
                    <b>
                        <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> God
                        mode.
                    </b>{' '}
                    Email code sign-in. Platform admins only.
                </>
            }
        >
            {message ? (
                <div className="ga-note">
                    <p className="g-note" role="alert">
                        <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                        <span>{message}</span>
                    </p>
                </div>
            ) : null}
            <LoginForm />
        </AuthShell>
    );
}
