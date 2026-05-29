import Link from 'next/link';
import { requireSession, listMyShops } from '@/lib/auth-guard';

export const metadata = { title: 'Choose Shop' };

export default async function ShopPickerPage() {
    const { profile } = await requireSession('/shop/login');
    const shops = await listMyShops(profile.profileId);

    if (shops.length === 0) {
        return (
            <div className="admin-login-wrap">
                <div className="admin-login-card">
                    <div className="admin-login-stamp">
                        <span className="accent">NO ACCESS</span>
                    </div>
                    <h1 className="admin-login-title">NOT A SHOP MEMBER</h1>
                    <p className="admin-login-sub">
                        Your account isn't on any shop's staff list. Reach out to{' '}
                        <span style={{ color: 'var(--gold)' }}>team@rollout.club</span> if that's not right.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card" style={{ maxWidth: 560 }}>
                <div className="admin-login-stamp">
                    <span className="accent">CHOOSE SHOP</span>
                    <span>YOU&apos;RE A MEMBER OF {shops.length} SHOPS</span>
                </div>
                <h1 className="admin-login-title" style={{ fontSize: 22 }}>PICK A SHOP</h1>
                <p className="admin-login-sub">
                    Each shop has its own inbox, calendar, and customer data.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                    {shops.map((s) => (
                        <Link
                            key={s.shopId}
                            href={`/shop/${s.slug}/overview`}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '16px 18px',
                                border: '1px solid var(--line-mid)',
                                background: 'var(--bg-2)',
                                textDecoration: 'none',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontWeight: 700,
                                        fontSize: 13,
                                        letterSpacing: 'var(--track-widest)',
                                        color: 'var(--text)',
                                    }}
                                >
                                    {s.name.toUpperCase()}
                                </div>
                                <div
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 10,
                                        letterSpacing: 'var(--track-wider)',
                                        color: 'var(--gold)',
                                        marginTop: 4,
                                    }}
                                >
                                    @{s.slug} · {s.role.toUpperCase()}
                                </div>
                            </div>
                            <span style={{ color: 'var(--gold)', fontSize: 18 }}>›</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
