import Link from 'next/link';
import { getCartCount } from '@/lib/medusa-cart';

/** Cart affordance with a live line-item count. Server component (reads the
 * cart cookie); only rendered on force-dynamic store pages. */
export async function CartLink() {
    let count = 0;
    try {
        count = await getCartCount();
    } catch {
        count = 0;
    }
    return (
        <Link
            href="/store/cart"
            className="btn"
            style={{ padding: '10px 20px', fontSize: 11, whiteSpace: 'nowrap' }}
        >
            CART{count > 0 ? ` · ${count}` : ''}
        </Link>
    );
}
