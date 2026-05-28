'use client';
import { useTransition } from 'react';
import { setShopVerified } from './actions';

export function ShopRow({ shop }: { shop: any }) {
    const [pending, start] = useTransition();
    const verified = shop.page?.is_verified ?? false;
    const handleVerify = () => {
        if (!shop.page?.id) {
            alert('This shop has no shop_page profile. Create one first.');
            return;
        }
        start(async () => {
            try {
                await setShopVerified(shop.page.id, !verified);
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <tr>
            <td>#{shop.id}</td>
            <td>
                <a href={`/admin/shops/${shop.id}`} className="text-link">
                    {shop.slug}
                </a>
            </td>
            <td>{shop.name}</td>
            <td>
                {shop.page ? (
                    <span>
                        @{shop.page.handle}
                        <span className="admin-handle"> {shop.page.display_name}</span>
                    </span>
                ) : (
                    <span className="admin-pill warn">MISSING</span>
                )}
            </td>
            <td>{shop.memberCount}</td>
            <td>
                {verified ? (
                    <span className="admin-pill gold">✓ VERIFIED</span>
                ) : (
                    <span className="admin-pill">UNVERIFIED</span>
                )}
            </td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                        className={`admin-action-btn ${verified ? 'muted' : ''}`}
                        disabled={pending || !shop.page}
                        onClick={handleVerify}
                    >
                        {verified ? 'UNVERIFY' : 'VERIFY ✓'}
                    </button>
                    <a href={`/admin/shops/${shop.id}`} className="admin-action-btn">
                        OPEN ›
                    </a>
                </div>
            </td>
        </tr>
    );
}
