import { cookies } from 'next/headers';

/**
 * Web-only: remember the event cart for /event/[id]/checkout.
 *
 * Kept OUT of the 'use server' modules on purpose — an exported function there
 * becomes a client-callable server action, and a caller-chosen cart id must
 * never be settable from the browser. Same name and options as the cookie
 * lib/event-cart.ts reads (getEventCart).
 *
 * Why this exists: 1c0f9eb moved the web reserve actions onto the cookie-free
 * cores, which create the cart but (by design) never write the cookie — so the
 * checkout page found no cart and bounced every member back to the event page
 * ("COMPLETE PAYMENT does nothing").
 */
export async function rememberEventCartId(cartId: string): Promise<void> {
    const store = await cookies();
    store.set('rollout_event_cart_id', cartId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24,
    });
}
