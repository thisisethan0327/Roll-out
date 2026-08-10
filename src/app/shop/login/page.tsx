import { OtpLoginForm } from '@/components/auth/OtpLoginForm';

export const metadata = { title: 'Shop · Sign In' };

/** Only allow same-origin absolute paths, never protocol-relative (`//evil`). */
function safeNext(raw: string | undefined): string {
    if (!raw) return '/shop';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/shop';
    return raw;
}

export default async function ShopLoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        error?: string;
        email?: string;
        step?: string;
        notice?: string;
        next?: string;
    }>;
}) {
    const { error, email, step, notice, next } = await searchParams;
    const startAtCode = step === 'code';
    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">SHOP DASHBOARD</span>
                    <span>ROLLOUT · MANAGE YOUR SHOP</span>
                </div>
                <h1 className="admin-login-title">SIGN IN</h1>
                <p className="admin-login-sub">
                    Email OTP. Shop members only.
                </p>
                {error === 'not_member' && (
                    <div className="admin-login-error">
                        Access denied. You're not a member of any shop yet.
                    </div>
                )}
                {error === 'no_profile' && (
                    <div className="admin-login-error">
                        No Rollout profile for that account. Sign up via the mobile app first.
                    </div>
                )}
                <OtpLoginForm
                    successPath={safeNext(next)}
                    redirectSuffix="/shop/login"
                    initialEmail={email ?? ''}
                    startAtCode={startAtCode}
                    notice={notice}
                />
            </div>
        </div>
    );
}
