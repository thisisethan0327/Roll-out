import { OtpLoginForm } from '@/components/auth/OtpLoginForm';

export const metadata = { title: 'Shop · Sign In' };

export default async function ShopLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
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
                <OtpLoginForm successPath="/shop" redirectSuffix="/shop/login" />
            </div>
        </div>
    );
}
