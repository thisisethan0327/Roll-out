/**
 * /admin/login — email OTP gate for god mode.
 *
 * Flow: enter email → request OTP → enter 6-digit code → server verifies →
 * cookie session set → redirect to /admin/overview. The post-verify guard
 * checks rollout.platform_admins; non-admins get bounced back here with
 * ?error=not_admin.
 */
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Admin · Sign In' };

export default async function AdminLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">GOD MODE</span>
                    <span>ROLLOUT · ADMIN CONSOLE</span>
                </div>
                <h1 className="admin-login-title">SIGN IN</h1>
                <p className="admin-login-sub">
                    Email OTP. Platform admins only.
                </p>
                {error === 'not_admin' && (
                    <div className="admin-login-error">
                        Access denied. Your account is not on rollout.platform_admins.
                    </div>
                )}
                {error === 'no_profile' && (
                    <div className="admin-login-error">
                        No Rollout profile for that account. Sign up via the mobile app first.
                    </div>
                )}
                {error === 'verify_failed' && (
                    <div className="admin-login-error">
                        Code rejected. Try again.
                    </div>
                )}
                <LoginForm />
            </div>
        </div>
    );
}
