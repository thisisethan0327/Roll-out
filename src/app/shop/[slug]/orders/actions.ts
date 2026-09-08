'use server';
/**
 * Order actions for a shop's Orders section. Every action:
 *   1. Requires a shop member whose ROLE allows that tier of action (below).
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
import { SHOPS_WITH_OWN_ADMIN } from '@/lib/tenant-hosts';
import {
    createFulfillmentWithTracking,
    markFulfillmentDelivered,
    captureOrderPayment,
    cancelVendorOrder,
    shipVendorFulfillment,
    refundVendorOrder,
    completeVendorOrder,
    type ActionResult,
} from '@/lib/medusa-admin';

/**
 * Two tiers, by Ethan's ruling of 2026-09-08.
 *
 * MANAGE — moves the order forward: put a tracking number on it, say it
 * arrived. Anyone who works here can do it; getting it wrong is embarrassing
 * and fixable.
 *
 * MONEY — capture, cancel, refund, complete. Each either moves money or ends
 * the order, and none of it can be undone by the person who did it.
 *
 * Managers keep MONEY. The brief allowed for admin/manager to differ by member
 * management, but the console has no member management for a manager to be
 * excluded from, so that distinction does not exist here yet — when it arrives,
 * that is the line to draw, not this one.
 *
 * Roles come from rollout.shop_memberships.role, whose check constraint allows
 * owner, admin, manager, installer and staff. Installer and staff are the shop
 * floor: MANAGE only.
 */
const MANAGE_ROLES = new Set(['owner', 'admin', 'manager', 'installer', 'staff']);
const MONEY_ROLES = new Set(['owner', 'admin', 'manager']);

/**
 * A role refusal, RETURNED rather than thrown.
 *
 * Throwing out of a Server Action gives the browser an HTTP 500 and a digest,
 * and the server log a bare unhandled error with no tag on it — a correct
 * outcome delivered as if something had broken (run 10, lane E). A refusal is
 * an ordinary answer: the caller renders it as a message like any other.
 */
const refusal = (role: string, what: string): ActionResult => ({
    ok: false,
    error: `Your role (${role}) can't ${what} on this shop. Ask an owner or admin.`,
});

/**
 * Gate: a member whose role allows this tier, AND a shop with a vendor key.
 * Returns the vendor key to scope the action.
 *
 * Enforced HERE, server-side. The UI also hides what a role cannot do, so
 * nobody is invited to fail — but a server action is a public endpoint, and
 * hidden is not the same as forbidden.
 */
type Guarded = { vendorKey: string; role: string } | { denied: ActionResult };

/** True when the guard refused; narrows the union for the caller. */
function denied(g: Guarded): g is { denied: ActionResult } {
    return 'denied' in g;
}

async function guard(slug: string, tier: 'manage' | 'money', what: string): Promise<Guarded> {
    const shop = await resolveShopSlug(slug);
    if (!shop) return { denied: { ok: false, error: 'Shop not found.' } };

    // A shop that runs its own admin does its order management THERE. Two
    // consoles both able to fulfil, refund and cancel the same order is a way
    // to have the same thing done twice, and the tenant's own admin is the one
    // with their staff roster behind it. Read stays open here; writes move.
    //
    // Scoped to shops that actually have another admin — deliberately NOT a
    // blanket read-only on this console, which also serves NeferStock and
    // divine, who have nowhere else to fulfil an order from.
    const movedTo = SHOPS_WITH_OWN_ADMIN[slug];
    if (movedTo) {
        console.warn(`[console-orders] ${slug}: ${what} refused — shop manages orders at ${movedTo}.`);
        return {
            denied: {
                ok: false,
                error: `${shop.name} manages orders in its own admin. Open ${movedTo} to ${what}.`,
            },
        };
    }

    const { role } = await requireShopMember(shop.shopId);
    const allowed = tier === 'money' ? MONEY_ROLES : MANAGE_ROLES;
    if (!allowed.has(role)) {
        // Logged with the same tag as every other console event, so a refusal
        // is findable next to the actions around it rather than being an
        // untagged stack trace.
        console.warn(`[console-orders] ${slug} ${role}: refused ${what}.`);
        return { denied: refusal(role, what) };
    }
    const resolved = await getShopVendorBySlug(slug);
    if (!resolved) return { denied: { ok: false, error: 'This shop has no order vendor.' } };
    return { vendorKey: resolved.vendorKey, role };
}

/**
 * What the signed-in member may do, so the UI can hide the rest. Never the
 * enforcement boundary — `guard` above is.
 */
export async function orderPermissions(
    slug: string,
): Promise<{ role: string; canManage: boolean; canMoney: boolean; managedElsewhere: string | null }> {
    const shop = await resolveShopSlug(slug);
    if (!shop) return { role: 'none', canManage: false, canMoney: false, managedElsewhere: null };

    const movedTo = SHOPS_WITH_OWN_ADMIN[slug] ?? null;
    if (movedTo) {
        // Nothing is manageable from here, whatever the member's role — so the
        // UI shows the orders and points at the admin instead of offering
        // buttons that the guard above would refuse.
        const { role } = await requireShopMember(shop.shopId);
        return { role, canManage: false, canMoney: false, managedElsewhere: movedTo };
    }

    const { role } = await requireShopMember(shop.shopId);
    return {
        role,
        canManage: MANAGE_ROLES.has(role),
        canMoney: MONEY_ROLES.has(role),
        managedElsewhere: null,
    };
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
    const g = await guard(slug, 'manage', 'fulfil orders');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
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

/**
 * Add tracking to an order that is fulfilled but not shipped — the retry for a
 * label that failed to attach. MANAGE tier: it moves the order forward and
 * touches no money.
 */
export async function shipOrderAction(
    slug: string,
    orderId: string,
    trackingNumber: string,
    carrier: string,
): Promise<ActionResult> {
    const g = await guard(slug, 'manage', 'add tracking');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await shipVendorFulfillment(vendorKey, orderId, trackingNumber, carrier);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function markDeliveredAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const g = await guard(slug, 'manage', 'mark orders delivered');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await markFulfillmentDelivered(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function capturePaymentAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const g = await guard(slug, 'money', 'capture payments');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await captureOrderPayment(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function cancelOrderAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const g = await guard(slug, 'money', 'cancel orders');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await cancelVendorOrder(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function refundOrderAction(
    slug: string,
    orderId: string,
    amountCents?: number | null,
): Promise<ActionResult> {
    const g = await guard(slug, 'money', 'refund orders');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await refundVendorOrder(vendorKey, orderId, amountCents);
    if (result.ok) revalidate(slug, orderId);
    return result;
}

export async function completeOrderAction(
    slug: string,
    orderId: string,
): Promise<ActionResult> {
    const g = await guard(slug, 'money', 'complete orders');
    if (denied(g)) return g.denied;
    const { vendorKey } = g;
    const result = await completeVendorOrder(vendorKey, orderId);
    if (result.ok) revalidate(slug, orderId);
    return result;
}
