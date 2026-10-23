import { getCartCount } from '@/lib/medusa-cart';
import { CartPill } from '@/components/glide-tickets/parts';

/** Cart affordance with a live line-item count. Server component (reads the
 * cart cookie); only rendered on force-dynamic store pages. Glide: a floating
 * pill with the count on an accent badge. */
export async function CartLink() {
    let count = 0;
    try {
        count = await getCartCount();
    } catch {
        count = 0;
    }
    return <CartPill count={count} />;
}
