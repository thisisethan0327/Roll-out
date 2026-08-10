'use server';
/**
 * Order actions for a shop's Orders section. Every action:
 *   1. Requires the caller be a manager+ member of the shop (role-gated).
 *   2. Resolves the shop's vendor key server-side from the registry.
 *   3. Delegates to medusa-admin.ts, which re-verifies the target order's
 *      metadata.vendor matches before touching Medusa (never trusts the id).
 * The vendor key is derived from the authenticated slug — it is NEVER accepted
 * from the client — so a caller cannot act across vendors by forging a param.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { resolveShopSlug } from '@/lib/auth-guard';
import { getShopVendorBySlug } from '@/lib/store-shops';
import {
    createFulfillmentWithTracking,
    markFulfillmentDelivered,
    captureOrderPayment,
    cancelVendorOrder,
    type ActionResult,
} from '@/lib/medusa-admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

/**
 * Gate: manager+ member of the shop AND the shop has a vendor key. Returns the
 * vendor key to scope the action. Throws on any failure (surfaced to the client
 * transition as a rejected promise).
 */
async function guard(slug: string): Promise<{ vendorKey: string }> {
    const shop = await resolveShopSlug(slug);
    if (!shop) throw new Error('Shop not found.');
    const { role } = await requireShopMember(shop.shopId);
    if (!MANAGER_ROLES.has(role)) throw new Error('Manager role required for order actions.');
    const resolved = await getShopVendorBySlug(slug);
    if (!resolved) throw new Error('This shop has no order vendor.');
    return { vendorKey: resolved.vendorKey };
}

function revalidate(slug: string, orderId: string) {
    revalidatePath(`/shop/${slug}/orders`, 'page');
    revalidatePath(`/shop/${slug}/orders/${orderId}`, 'page');
}

export async function fulfillOrderAction(
    slug: string,
    orderId: string,
    trackingNumber: string,
    carrier: string,
): Promise<ActionResult> {
    const { vendorKey } = await guard(slug);
    if (!trackingNumber || !trackingNumber.trim()) {
        return { ok: false, error: 'A tracking number is required.' };
    }
    const result = await createFulfillmentWithTracking(
        vendorKey,
        orderId,
        trackingNumber,
        carrier,
    );
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function markDeliveredAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const { vendorKey } = await guard(slug);
    const result = await markFulfillmentDelivered(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function capturePaymentAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const { vendorKey } = await guard(slug);
    const result = await captureOrderPayment(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function cancelOrderAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const { vendorKey } = await guard(slug);
    const result = await cancelVendorOrder(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}
