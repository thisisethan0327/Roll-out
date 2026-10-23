'use client';
import { useTransition } from 'react';
import { setShopVerified } from './actions';
import { Check, ChevronRight } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export function ShopRow({ shop }: { shop: any }) {
    const [pending, start] = useTransition();
    const verified = shop.page?.is_verified ?? false;
    // Meant to be on the map but no coordinates yet — mirrors the shop_unmapped
    // action item raised at approval time.
    const notOnMap = shop.show_on_map === true && shop.lat == null;
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
            <td className={a.num}>#{shop.id}</td>
            <td>
                <a href={`/admin/shops/${shop.id}`} className="text-link">
                    {shop.slug}
                </a>
            </td>
            <td>
                {shop.name}
                {notOnMap && (
                    <span className="admin-pill warn" style={{ marginLeft: 8 }}>
                        Not on map
                    </span>
                )}
            </td>
            <td>
                {shop.page ? (
                    <span>
                        @{shop.page.handle}
                        <span className="admin-handle"> {shop.page.display_name}</span>
                    </span>
                ) : (
                    <span className="admin-pill warn">Missing</span>
                )}
            </td>
            <td>{shop.memberCount}</td>
            <td>
                {verified ? (
                    <span className="admin-pill gold"><Check {...ic} /> Verified</span>
                ) : (
                    <span className="admin-pill">Unverified</span>
                )}
            </td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                        className={`admin-action-btn ${verified ? 'muted' : ''}`}
                        disabled={pending || !shop.page}
                        onClick={handleVerify}
                    >
                        {verified ? 'Unverify' : <><Check {...ic} /> Verify</>}
                    </button>
                    <a href={`/admin/shops/${shop.id}`} className="admin-action-btn">
                        Open <ChevronRight {...ic} />
                    </a>
                </div>
            </td>
        </tr>
    );
}
