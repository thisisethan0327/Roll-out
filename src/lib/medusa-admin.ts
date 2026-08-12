/**
 * Server-only Medusa **Admin** API client for the Rollout shop dashboard's
 * Orders section. Unlike src/lib/medusa.ts (public Store API, publishable key)
 * and src/lib/medusa-customer.ts (a member's own STORE token), this module
 * authenticates as the platform Medusa admin and is therefore capable of acting
 * on ANY order. That power makes vendor scoping non-negotiable:
 *
 *   EVERY read and EVERY action here is scoped to a single `vendorKey`
 *   (the tenant slug stamped on `order.metadata.vendor`). A shop's staff may
 *   only ever see and act on orders whose metadata.vendor === their shop's
 *   vendor key (resolved server-side from the registry via resolveShopVendorKey).
 *   Order ids from the URL are NEVER trusted: every action re-fetches the order
 *   and re-checks metadata.vendor before doing anything.
 *
 * Medusa's admin list endpoint can't filter on arbitrary metadata reliably, so
 * we page recent orders and filter server-side. There are a handful of orders
 * today; the cap keeps it bounded.
 *
 * Credentials come from env (MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD), set on
 * the Coolify app — never shipped to the client, never committed. The admin JWT
 * is cached in-memory and refreshed on 401.
 */
import 'server-only';
import { MEDUSA_URL } from './medusa';

// ── admin auth (in-memory JWT cache, refresh-on-401) ─────────────────────────

let cachedToken: { token: string; at: number } | null = null;
// Conservative TTL well under Medusa's default admin JWT lifetime; a 401 forces
// an immediate refresh regardless.
const TOKEN_TTL_MS = 15 * 60 * 1000;

async function login(): Promise<string | null> {
    const email = process.env.MEDUSA_ADMIN_EMAIL;
    const password = process.env.MEDUSA_ADMIN_PASSWORD;
    if (!email || !password) {
        console.error(
            '[medusa-admin] MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD are not set — Orders section disabled.',
        );
        return null;
    }
    try {
        const res = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            cache: 'no-store',
        });
        if (!res.ok) {
            console.error(`[medusa-admin] admin login failed (${res.status}).`);
            return null;
        }
        const json = await res.json();
        return typeof json?.token === 'string' ? json.token : null;
    } catch (e: any) {
        console.error(`[medusa-admin] admin login threw: ${e?.message ?? e}`);
        return null;
    }
}

async function getToken(force = false): Promise<string | null> {
    if (!force && cachedToken && Date.now() - cachedToken.at < TOKEN_TTL_MS) {
        return cachedToken.token;
    }
    const token = await login();
    cachedToken = token ? { token, at: Date.now() } : null;
    return token;
}

async function adminFetch(
    path: string,
    init: RequestInit = {},
    retryOn401 = true,
): Promise<Response | null> {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch(`${MEDUSA_URL}${path}`, {
        ...init,
        headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
    });
    if (res.status === 401 && retryOn401) {
        cachedToken = null;
        const fresh = await getToken(true);
        if (!fresh) return res;
        return adminFetch(path, init, false);
    }
    return res;
}

async function errorMessage(res: Response | null): Promise<string> {
    if (!res) return 'Store admin is unavailable right now.';
    try {
        const json = await res.json();
        return json?.message || json?.type || `Medusa responded ${res.status}.`;
    } catch {
        return `Medusa responded ${res.status}.`;
    }
}

// ── types ────────────────────────────────────────────────────────────────────

export type VendorOrderListItem = {
    id: string;
    display_id: number | string | null;
    email: string | null;
    total: number | null;
    currency_code: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    status: string | null;
    created_at: string | null;
    itemCount: number;
    itemsSummary: string;
};

export type VendorOrderItem = {
    id: string;
    title: string | null;
    quantity: number | null;
    fulfilledQuantity: number;
    unit_price: number | null;
    thumbnail: string | null;
};

export type VendorOrderAddress = {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    address_1: string | null;
    address_2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country_code: string | null;
    phone: string | null;
};

export type VendorOrderFulfillment = {
    id: string;
    shipped_at: string | null;
    delivered_at: string | null;
    canceled_at: string | null;
    packed_at: string | null;
    trackingNumbers: { number: string | null; url: string | null }[];
};

export type VendorOrderPayment = {
    id: string;
    amount: number | null;
    captured_at: string | null;
    canceled_at: string | null;
};

export type VendorOrderDetail = {
    id: string;
    display_id: number | string | null;
    email: string | null;
    status: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    currency_code: string | null;
    created_at: string | null;
    total: number | null;
    item_subtotal: number | null;
    shipping_total: number | null;
    tax_total: number | null;
    discount_total: number | null;
    items: VendorOrderItem[];
    shipping_address: VendorOrderAddress | null;
    shipping_method: { name: string | null; amount: number | null } | null;
    fulfillments: VendorOrderFulfillment[];
    payments: VendorOrderPayment[];
    /** True when there is an authorized-but-uncaptured payment (legacy manual). */
    hasAuthorizedPayment: boolean;
    /** True when there are line items still awaiting fulfillment. */
    hasUnfulfilledItems: boolean;
};

// ── mapping ──────────────────────────────────────────────────────────────────

const LIST_FIELDS =
    'id,display_id,email,currency_code,total,payment_status,fulfillment_status,status,created_at,metadata,items.id,items.title,items.quantity,items.total,items.metadata';

const DETAIL_FIELDS = [
    'id',
    'display_id',
    'email',
    'status',
    'payment_status',
    'fulfillment_status',
    'currency_code',
    'created_at',
    'total',
    'item_subtotal',
    'shipping_total',
    'tax_total',
    'discount_total',
    'metadata',
    'items.id',
    'items.title',
    'items.quantity',
    'items.unit_price',
    'items.total',
    'items.metadata',
    'items.thumbnail',
    'items.detail.quantity',
    'items.detail.fulfilled_quantity',
    '*shipping_address',
    'shipping_methods.name',
    'shipping_methods.amount',
    'fulfillments.id',
    'fulfillments.shipped_at',
    'fulfillments.delivered_at',
    'fulfillments.canceled_at',
    'fulfillments.packed_at',
    'fulfillments.items.line_item_id',
    'fulfillments.items.quantity',
    'fulfillments.labels.tracking_number',
    'fulfillments.labels.tracking_url',
    'payment_collections.payments.id',
    'payment_collections.payments.amount',
    'payment_collections.payments.captured_at',
    'payment_collections.payments.canceled_at',
].join(',');

/** Order-level vendor (legacy single-vendor stamp; primary vendor post-P2A). */
function vendorOf(o: any): string | null {
    return o?.metadata?.vendor ?? null;
}

/** A single line's stamped vendor key (null when unattributed / install line). */
function lineVendorOf(item: any): string | null {
    return item?.metadata?.vendor ?? null;
}

/** True when ANY line on the order carries a vendor stamp (post-P2A order). */
function hasLineVendorStamps(o: any): boolean {
    return (Array.isArray(o?.items) ? o.items : []).some(
        (it: any) => lineVendorOf(it) != null,
    );
}

/**
 * LINE-LEVEL vendor match (P2A). An order belongs to a vendor's dashboard when
 * it CONTAINS at least one line stamped with that vendor key. Falls back to the
 * order-level `metadata.vendor` for LEGACY orders placed before line stamping
 * existed (no line carries a vendor). This is the single predicate every read
 * and action re-checks — a shop only ever sees/acts on orders with its lines.
 */
function orderHasVendorLine(o: any, vendorKey: string): boolean {
    if (hasLineVendorStamps(o)) {
        return (Array.isArray(o?.items) ? o.items : []).some(
            (it: any) => lineVendorOf(it) === vendorKey,
        );
    }
    return vendorOf(o) === vendorKey;
}

/** This vendor's line items on the order (legacy: all lines when unstamped). */
function vendorLines(o: any, vendorKey: string): any[] {
    const items = Array.isArray(o?.items) ? o.items : [];
    if (hasLineVendorStamps(o)) {
        return items.filter((it: any) => lineVendorOf(it) === vendorKey);
    }
    // Legacy order (no line stamps) that matched at order level → all lines.
    return vendorOf(o) === vendorKey ? items : [];
}

function itemsSummary(items: any[]): string {
    if (!items || items.length === 0) return 'No items';
    const first = items[0];
    const firstLabel = `${first?.quantity ?? 1}× ${first?.title ?? 'Item'}`;
    if (items.length === 1) return firstLabel;
    return `${firstLabel} +${items.length - 1} more`;
}

/**
 * List-row projection SCOPED to a vendor: item count, summary, and the row
 * `total` reflect ONLY this vendor's lines (their subtotal), not the whole
 * multi-vendor order. Payment status stays order-level (one shared payment).
 */
function mapListItem(o: any, vendorKey: string): VendorOrderListItem {
    const lines = vendorLines(o, vendorKey);
    const theirSubtotal = lines.reduce((n: number, it: any) => n + Number(it?.total ?? 0), 0);
    return {
        id: o.id,
        display_id: o.display_id ?? null,
        email: o.email ?? null,
        total: theirSubtotal,
        currency_code: o.currency_code ?? null,
        payment_status: o.payment_status ?? null,
        fulfillment_status: deriveVendorFulfillmentStatus(o, lines),
        status: o.status ?? null,
        created_at: o.created_at ?? null,
        itemCount: lines.reduce((n: number, it: any) => n + Number(it?.quantity ?? 0), 0),
        itemsSummary: itemsSummary(lines),
    };
}

/**
 * Per-vendor fulfillment status derived from THIS vendor's lines (Medusa's
 * order-level fulfillment_status reflects the whole order, which is wrong for a
 * vendor slice). Looks at remaining unfulfilled quantity on their lines, then at
 * the shipment/delivery state of the fulfillments that cover their lines.
 */
function deriveVendorFulfillmentStatus(o: any, lines: any[]): string {
    if (lines.length === 0) return 'not_fulfilled';
    const remaining = lines.reduce(
        (n: number, it: any) =>
            n + (Number(it?.quantity ?? 0) - Number(it?.detail?.fulfilled_quantity ?? 0)),
        0,
    );
    const anyFulfilled = lines.some(
        (it: any) => Number(it?.detail?.fulfilled_quantity ?? 0) > 0,
    );
    if (remaining > 0) return anyFulfilled ? 'partially_fulfilled' : 'not_fulfilled';

    // All their lines fulfilled — refine by the fulfillments covering their lines.
    const theirLineIds = new Set(lines.map((it) => it.id));
    const theirFuls = (Array.isArray(o?.fulfillments) ? o.fulfillments : []).filter(
        (f: any) =>
            !f?.canceled_at &&
            (Array.isArray(f?.items) ? f.items : []).some((fi: any) =>
                theirLineIds.has(fi?.line_item_id),
            ),
    );
    if (theirFuls.length === 0) return 'fulfilled';
    if (theirFuls.every((f: any) => f.delivered_at)) return 'delivered';
    if (theirFuls.every((f: any) => f.shipped_at)) return 'shipped';
    if (theirFuls.some((f: any) => f.shipped_at)) return 'partially_shipped';
    return 'fulfilled';
}

function mapAddress(a: any): VendorOrderAddress | null {
    if (!a || typeof a !== 'object') return null;
    return {
        first_name: a.first_name ?? null,
        last_name: a.last_name ?? null,
        company: a.company ?? null,
        address_1: a.address_1 ?? null,
        address_2: a.address_2 ?? null,
        city: a.city ?? null,
        province: a.province ?? null,
        postal_code: a.postal_code ?? null,
        country_code: a.country_code ?? null,
        phone: a.phone ?? null,
    };
}

/**
 * Detail projection SCOPED to a vendor. Shows ONLY this vendor's line items and
 * their subtotal (sum of their line totals). Order-level shipping/tax/discount
 * are intentionally omitted (they belong to the whole shared order, not one
 * vendor's slice) and render as '—'; the platform (P2B) owns the whole-order
 * view. Fulfillments are filtered to those covering this vendor's lines, and
 * fulfillment status is derived from this vendor's lines only.
 */
function mapDetail(o: any, vendorKey: string): VendorOrderDetail {
    const lines = vendorLines(o, vendorKey);
    const theirLineIds = new Set(lines.map((it) => it.id));

    const items: VendorOrderItem[] = lines.map((it: any) => ({
        id: it.id,
        title: it.title ?? it.product_title ?? null,
        quantity: it.quantity ?? null,
        fulfilledQuantity: Number(it?.detail?.fulfilled_quantity ?? 0),
        unit_price: it.unit_price ?? null,
        thumbnail: it.thumbnail ?? null,
    }));

    const theirSubtotal = lines.reduce((n: number, it: any) => n + Number(it?.total ?? 0), 0);

    const payments: VendorOrderPayment[] = [];
    for (const pc of (o.payment_collections ?? []) as any[]) {
        for (const p of (pc?.payments ?? []) as any[]) {
            payments.push({
                id: p.id,
                amount: p.amount ?? null,
                captured_at: p.captured_at ?? null,
                canceled_at: p.canceled_at ?? null,
            });
        }
    }

    // Only fulfillments that cover at least one of THIS vendor's lines.
    const fulfillments: VendorOrderFulfillment[] = (
        Array.isArray(o.fulfillments) ? o.fulfillments : []
    )
        .filter((f: any) =>
            (Array.isArray(f?.items) ? f.items : []).some((fi: any) =>
                theirLineIds.has(fi?.line_item_id),
            ),
        )
        .map((f: any) => ({
            id: f.id,
            shipped_at: f.shipped_at ?? null,
            delivered_at: f.delivered_at ?? null,
            canceled_at: f.canceled_at ?? null,
            packed_at: f.packed_at ?? null,
            trackingNumbers: (Array.isArray(f.labels) ? f.labels : [])
                .map((l: any) => ({ number: l?.tracking_number ?? null, url: l?.tracking_url ?? null }))
                .filter((t: any) => t.number || t.url),
        }));

    const hasAuthorizedPayment = payments.some(
        (p) => !p.captured_at && !p.canceled_at,
    ) && (o.payment_status ?? '').toLowerCase() === 'authorized';

    const hasUnfulfilledItems = items.some(
        (it) => (Number(it.quantity ?? 0) - it.fulfilledQuantity) > 0,
    );

    return {
        id: o.id,
        display_id: o.display_id ?? null,
        email: o.email ?? null,
        status: o.status ?? null,
        payment_status: o.payment_status ?? null,
        fulfillment_status: deriveVendorFulfillmentStatus(o, lines),
        currency_code: o.currency_code ?? null,
        created_at: o.created_at ?? null,
        // Per-vendor slice: total == their subtotal; order-level shipping/tax are
        // not attributable to one vendor here (shown as '—').
        total: theirSubtotal,
        item_subtotal: theirSubtotal,
        shipping_total: null,
        tax_total: null,
        discount_total: null,
        items,
        shipping_address: mapAddress(o.shipping_address),
        shipping_method: null,
        fulfillments,
        payments,
        hasAuthorizedPayment,
        hasUnfulfilledItems,
    };
}

// ── reads (vendor-scoped) ────────────────────────────────────────────────────

/**
 * List a vendor's orders, newest first. Pages recent orders and filters on
 * metadata.vendor server-side (Medusa can't filter arbitrary metadata). Bounded
 * by MAX_SCAN so it never runs away as order volume grows.
 */
export async function listVendorOrders(
    vendorKey: string,
): Promise<{ orders: VendorOrderListItem[]; error: string | null }> {
    const PAGE = 100;
    const MAX_SCAN = 1000;
    const collected: any[] = [];
    try {
        let offset = 0;
        let total = Infinity;
        while (offset < total && offset < MAX_SCAN) {
            const res = await adminFetch(
                `/admin/orders?limit=${PAGE}&offset=${offset}&order=-display_id&fields=${encodeURIComponent(
                    LIST_FIELDS,
                )}`,
            );
            if (!res) return { orders: [], error: 'Store admin is unavailable right now.' };
            if (!res.ok) return { orders: [], error: await errorMessage(res) };
            const json = await res.json();
            const batch: any[] = json?.orders ?? [];
            collected.push(...batch);
            total = Number(json?.count ?? batch.length);
            if (batch.length < PAGE) break;
            offset += PAGE;
        }
    } catch (e: any) {
        return { orders: [], error: e?.message ?? 'Order lookup failed.' };
    }
    const mine = collected
        .filter((o) => orderHasVendorLine(o, vendorKey))
        .map((o) => mapListItem(o, vendorKey));
    return { orders: mine, error: null };
}

/**
 * A vendor order row is "needs-attention unfulfilled" when it is paid (captured)
 * but still has line items awaiting fulfillment — the same predicate the Orders
 * list uses for its UNFULFILLED filter, narrowed to paid orders. Canceled orders
 * never qualify. Exported so the overview attention panel and the orders table
 * stay in lock-step on what "unfulfilled" means.
 */
export function isPaidUnfulfilled(o: VendorOrderListItem): boolean {
    const status = (o.status ?? '').toLowerCase();
    const ful = (o.fulfillment_status ?? '').toLowerCase();
    const pay = (o.payment_status ?? '').toLowerCase();
    if (status === 'canceled') return false;
    const unfulfilled = ful === 'not_fulfilled' || ful === 'partially_fulfilled';
    // captured = money in hand; partially_refunded still leaves a paid balance.
    const paid = pay === 'captured' || pay === 'partially_refunded';
    return unfulfilled && paid;
}

/**
 * Count a vendor's paid-but-unfulfilled orders — the shop overview's "needs
 * attention" orders signal. Thin wrapper over `listVendorOrders` so the vendor
 * scoping and the unfulfilled definition are never duplicated. DERIVED live from
 * Medusa (nothing stored). Returns 0 on error alongside the error string so the
 * caller can decide whether to surface a soft failure.
 */
export async function countPaidUnfulfilledOrders(
    vendorKey: string,
): Promise<{ count: number; error: string | null }> {
    const { orders, error } = await listVendorOrders(vendorKey);
    if (error) return { count: 0, error };
    return { count: orders.filter(isPaidUnfulfilled).length, error: null };
}

/**
 * Fetch ONE order for a vendor. Returns null when the order does not exist OR
 * its metadata.vendor does not match — a foreign / unknown id is indistinguishable
 * from "not found", so the caller renders a 404 and never leaks existence.
 */
export async function getVendorOrder(
    vendorKey: string,
    orderId: string,
): Promise<VendorOrderDetail | null> {
    if (!orderId) return null;
    const res = await adminFetch(
        `/admin/orders/${encodeURIComponent(orderId)}?fields=${encodeURIComponent(DETAIL_FIELDS)}`,
    );
    if (!res || !res.ok) return null;
    const o = (await res.json())?.order;
    if (!o?.id || !orderHasVendorLine(o, vendorKey)) return null;
    return mapDetail(o, vendorKey);
}

// ── actions (vendor-scoped, re-verify before acting) ─────────────────────────

export type ActionResult = { ok: boolean; error?: string };

/**
 * Re-fetch the raw order and confirm it belongs to `vendorKey` before any
 * mutation. NEVER trust the id from the caller — this is the single choke point
 * every action passes through. Returns the raw order (with the fields needed by
 * the actions) or null when the order is not this vendor's.
 */
async function assertVendorOrder(vendorKey: string, orderId: string): Promise<any | null> {
    if (!orderId) return null;
    const fields =
        'id,display_id,status,payment_status,fulfillment_status,metadata,' +
        'items.id,items.quantity,items.metadata,items.detail.fulfilled_quantity,' +
        'fulfillments.id,fulfillments.canceled_at,fulfillments.shipped_at,fulfillments.delivered_at,' +
        'fulfillments.items.line_item_id,fulfillments.items.quantity,' +
        'payment_collections.payments.id,payment_collections.payments.amount,' +
        'payment_collections.payments.captured_at,payment_collections.payments.canceled_at';
    const res = await adminFetch(
        `/admin/orders/${encodeURIComponent(orderId)}?fields=${encodeURIComponent(fields)}`,
    );
    if (!res || !res.ok) return null;
    const o = (await res.json())?.order;
    if (!o?.id || !orderHasVendorLine(o, vendorKey)) return null;
    return o;
}

let cachedLocationId: string | null | undefined;
async function defaultStockLocationId(): Promise<string | null> {
    if (cachedLocationId !== undefined) return cachedLocationId ?? null;
    try {
        const res = await adminFetch('/admin/stock-locations?limit=1&fields=id');
        if (res && res.ok) {
            const loc = (await res.json())?.stock_locations?.[0];
            cachedLocationId = loc?.id ?? null;
            return cachedLocationId ?? null;
        }
    } catch {
        /* best-effort */
    }
    cachedLocationId = null;
    return null;
}

/** Build a carrier tracking URL from a known carrier + number (best-effort). */
export function carrierTrackingUrl(carrier: string, num: string): string | null {
    const n = encodeURIComponent(num.trim());
    if (!n) return null;
    switch (carrier.trim().toLowerCase()) {
        case 'ups':
            return `https://www.ups.com/track?tracknum=${n}`;
        case 'usps':
            return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
        case 'fedex':
            return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
        case 'dhl':
            return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
        default:
            return null;
    }
}

/**
 * Create a fulfillment for all remaining line items, then attach a tracking
 * number + carrier by creating a shipment (which also marks the fulfillment
 * shipped). Vendor-scoped; no-op with an explanatory error when nothing is left
 * to fulfill or the order isn't this vendor's.
 */
export async function createFulfillmentWithTracking(
    vendorKey: string,
    orderId: string,
    trackingNumber: string,
    carrier: string,
): Promise<ActionResult> {
    const o = await assertVendorOrder(vendorKey, orderId);
    if (!o) return { ok: false, error: 'Order not found for this shop.' };

    // Fulfill ONLY this vendor's remaining line items — never another vendor's.
    const items = vendorLines(o, vendorKey)
        .map((it: any) => ({
            id: it.id,
            quantity: Number(it?.quantity ?? 0) - Number(it?.detail?.fulfilled_quantity ?? 0),
        }))
        .filter((x: any) => x.quantity > 0);
    if (items.length === 0) return { ok: false, error: 'Nothing left to fulfill for this shop on this order.' };

    const body: any = { items };
    const locationId = await defaultStockLocationId();
    if (locationId) body.location_id = locationId;

    const fRes = await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/fulfillments`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    if (!fRes || !fRes.ok) return { ok: false, error: await errorMessage(fRes) };

    // Resolve the newly-created fulfillment id from the response order.
    let fulfillmentId: string | null = null;
    try {
        const order = (await fRes.json())?.order;
        const fs = (Array.isArray(order?.fulfillments) ? order.fulfillments : []).filter(
            (f: any) => !f?.canceled_at,
        );
        fulfillmentId = fs.length ? fs[fs.length - 1]?.id ?? null : null;
    } catch {
        /* fall through */
    }
    if (!fulfillmentId) {
        // Fulfilled, but we couldn't attach tracking automatically.
        return {
            ok: true,
            error: 'Fulfillment created, but the tracking number could not be attached — add it in the Medusa admin.',
        };
    }

    const trackingUrl = carrierTrackingUrl(carrier, trackingNumber);
    const label: any = { tracking_number: trackingNumber.trim() };
    if (trackingUrl) label.tracking_url = trackingUrl;

    const sRes = await adminFetch(
        `/admin/orders/${encodeURIComponent(orderId)}/fulfillments/${fulfillmentId}/shipments`,
        { method: 'POST', body: JSON.stringify({ items, labels: [label] }) },
    );
    if (!sRes || !sRes.ok) {
        return {
            ok: true,
            error: `Fulfillment created, but marking it shipped with tracking failed: ${await errorMessage(sRes)}`,
        };
    }
    return { ok: true };
}

/**
 * Mark a shipped fulfillment as delivered. Uses the newest non-canceled
 * fulfillment on the order.
 */
export async function markFulfillmentDelivered(
    vendorKey: string,
    orderId: string,
): Promise<ActionResult> {
    const o = await assertVendorOrder(vendorKey, orderId);
    if (!o) return { ok: false, error: 'Order not found for this shop.' };
    // Only fulfillments that cover THIS vendor's lines.
    const theirLineIds = new Set(vendorLines(o, vendorKey).map((it: any) => it.id));
    const fs = (Array.isArray(o.fulfillments) ? o.fulfillments : []).filter(
        (f: any) =>
            !f?.canceled_at &&
            (Array.isArray(f?.items) ? f.items : []).some((fi: any) =>
                theirLineIds.has(fi?.line_item_id),
            ),
    );
    const target = fs.length ? fs[fs.length - 1] : null;
    if (!target?.id) return { ok: false, error: 'No fulfillment to mark delivered.' };
    if (target.delivered_at) return { ok: false, error: 'This fulfillment is already delivered.' };
    const res = await adminFetch(
        `/admin/orders/${encodeURIComponent(orderId)}/fulfillments/${target.id}/mark-as-delivered`,
        { method: 'POST', body: JSON.stringify({}) },
    );
    if (!res || !res.ok) return { ok: false, error: await errorMessage(res) };
    return { ok: true };
}

/**
 * Capture a still-authorized payment (legacy manual-capture orders). New orders
 * capture automatically, so the caller only surfaces this when payment_status
 * is 'authorized'.
 */
export async function captureOrderPayment(
    vendorKey: string,
    orderId: string,
): Promise<ActionResult> {
    const o = await assertVendorOrder(vendorKey, orderId);
    if (!o) return { ok: false, error: 'Order not found for this shop.' };
    let payment: any = null;
    for (const pc of (o.payment_collections ?? []) as any[]) {
        for (const p of (pc?.payments ?? []) as any[]) {
            if (!p?.captured_at && !p?.canceled_at) {
                payment = p;
                break;
            }
        }
        if (payment) break;
    }
    if (!payment?.id) return { ok: false, error: 'No authorized payment to capture.' };
    const res = await adminFetch(`/admin/payments/${payment.id}/capture`, {
        method: 'POST',
        body: JSON.stringify(payment.amount != null ? { amount: payment.amount } : {}),
    });
    if (!res || !res.ok) return { ok: false, error: await errorMessage(res) };
    return { ok: true };
}

// ── console pulse (cross-vendor, cached) ─────────────────────────────────────
// The god console's PULSE section needs whole-store numbers, not one vendor's
// slice: total store revenue and the summed paid-but-unfulfilled backlog. This
// is the ONLY function here that is not vendor-scoped — it is reachable solely
// from the platform-admin /admin/overview (already gated by requirePlatformAdmin)
// and returns aggregates, never another shop's order rows. It pages orders ONCE
// and caches for 5 min so god-mode refreshes don't hammer Medusa.

/** Real selling vendors (seed shops excluded). Mirrors store-shops VENDOR roots. */
const PULSE_VENDORS: { key: string; label: string }[] = [
    { key: 'neferstock', label: 'NeferStock' },
    { key: 'divine', label: 'divine' },
];

/** Seed / KYC-test orders — excluded from every console count. */
function isSeedOrder(o: any): boolean {
    const m = o?.metadata ?? {};
    const v = String(m.vendor ?? m.vendor_slug ?? '');
    return v.startsWith('seed-') || v === 'nfs-kyc-test' || String(m.vendor_shop_id) === '15';
}

// item_subtotal is the ITEMS-ONLY pre-tax total (never Medusa's `subtotal`, which
// folds shipping in — documented money trap). items.detail hydrates line totals so
// item_subtotal foots. Fulfillment fields feed the per-vendor unfulfilled derive.
const SCAN_FIELDS =
    'id,display_id,status,payment_status,fulfillment_status,created_at,currency_code,item_subtotal,metadata,' +
    'items.id,items.quantity,items.total,items.metadata,items.detail.fulfilled_quantity,' +
    'fulfillments.canceled_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.items.line_item_id';

export type MedusaPulse = {
    /** Store revenue = SUM(item_subtotal) over non-canceled, non-seed orders. */
    storeRevenue: {
        d7: { count: number; subtotal: number };
        d30: { count: number; subtotal: number };
    };
    /** Paid-but-unfulfilled backlog, summed + per real vendor (same predicate as the shop console). */
    unfulfilled: { total: number; byVendor: { key: string; label: string; count: number }[] };
    currency: string | null;
    error: string | null;
};

let pulseCache: { at: number; data: MedusaPulse } | null = null;
const PULSE_TTL_MS = 5 * 60 * 1000;

/**
 * Whole-store KPIs for the god console PULSE section. Pages recent orders once
 * (bounded by MAX_SCAN), then derives store revenue windows and the summed
 * paid-unfulfilled backlog. Degrades to zeros + an error string when Medusa
 * admin creds are unset (local dev) or Medusa is unreachable — never throws.
 */
export async function getMedusaPulse(): Promise<MedusaPulse> {
    if (pulseCache && Date.now() - pulseCache.at < PULSE_TTL_MS) return pulseCache.data;

    const empty: MedusaPulse = {
        storeRevenue: { d7: { count: 0, subtotal: 0 }, d30: { count: 0, subtotal: 0 } },
        unfulfilled: { total: 0, byVendor: PULSE_VENDORS.map((v) => ({ ...v, count: 0 })) },
        currency: null,
        error: null,
    };

    const PAGE = 100;
    const MAX_SCAN = 1000;
    const collected: any[] = [];
    try {
        let offset = 0;
        let total = Infinity;
        while (offset < total && offset < MAX_SCAN) {
            const res = await adminFetch(
                `/admin/orders?limit=${PAGE}&offset=${offset}&order=-created_at&fields=${encodeURIComponent(
                    SCAN_FIELDS,
                )}`,
            );
            if (!res) return { ...empty, error: 'Store admin is unavailable right now.' };
            if (!res.ok) return { ...empty, error: await errorMessage(res) };
            const json = await res.json();
            const batch: any[] = json?.orders ?? [];
            collected.push(...batch);
            total = Number(json?.count ?? batch.length);
            if (batch.length < PAGE) break;
            offset += PAGE;
        }
    } catch (e: any) {
        return { ...empty, error: e?.message ?? 'Order lookup failed.' };
    }

    const now = Date.now();
    const within = (iso: string | null, days: number) =>
        iso ? now - new Date(iso).getTime() <= days * 86_400_000 : false;

    // Revenue: non-canceled, non-seed orders; SUM their order-level item_subtotal.
    const revenueOrders = collected.filter(
        (o) => !isSeedOrder(o) && (o.status ?? '').toLowerCase() !== 'canceled',
    );
    const rev = (days: number) => {
        const sel = revenueOrders.filter((o) => within(o.created_at, days));
        return {
            count: sel.length,
            subtotal: sel.reduce((n, o) => n + Number(o.item_subtotal ?? 0), 0),
        };
    };

    // Unfulfilled: reuse the EXACT vendor-scoped predicate the Orders list uses, so
    // the console can never disagree with a shop's own backlog count.
    const byVendor = PULSE_VENDORS.map((v) => {
        const count = collected
            .filter((o) => orderHasVendorLine(o, v.key))
            .map((o) => mapListItem(o, v.key))
            .filter(isPaidUnfulfilled).length;
        return { ...v, count };
    });

    const data: MedusaPulse = {
        storeRevenue: { d7: rev(7), d30: rev(30) },
        unfulfilled: { total: byVendor.reduce((n, v) => n + v.count, 0), byVendor },
        currency: collected.find((o) => o.currency_code)?.currency_code ?? null,
        error: null,
    };
    pulseCache = { at: Date.now(), data };
    return data;
}

// ── console jump search (cross-vendor, platform-admin only) ──────────────────
// Universal-search readers for the god console's JUMP layer (Console Phase C3).
// Like getMedusaPulse, these are NOT vendor-scoped — reachable only from the
// platform-admin search path (gated by requirePlatformAdmin) and returning at
// most 5 preview rows. They never mutate and never leak a shop's row set beyond
// what the admin can already see in the console. Seed/KYC orders are excluded.

export type AdminOrderHit = {
    id: string;
    display_id: number | string | null;
    email: string | null;
    total: number | null;
    currency_code: string | null;
    status: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    created_at: string | null;
};

/**
 * Search orders for the console. Medusa's `q` matches email + display_id; we
 * then re-filter client-side so a numeric query only returns display_id hits and
 * an email query only returns email hits (guarding against `q` returning noise).
 * Returns ≤5 non-seed orders, newest display_id first.
 */
export async function searchAdminOrders(
    term: string,
): Promise<{ orders: AdminOrderHit[]; error: string | null }> {
    const t = term.trim();
    if (!t) return { orders: [], error: null };
    const fields =
        'id,display_id,email,total,currency_code,status,payment_status,fulfillment_status,created_at,metadata';
    const res = await adminFetch(
        `/admin/orders?q=${encodeURIComponent(t)}&limit=15&order=-display_id&fields=${encodeURIComponent(
            fields,
        )}`,
    );
    if (!res) return { orders: [], error: 'Store admin is unavailable right now.' };
    if (!res.ok) return { orders: [], error: await errorMessage(res) };
    let list: any[] = [];
    try {
        list = (await res.json())?.orders ?? [];
    } catch {
        return { orders: [], error: 'Bad response from store admin.' };
    }
    const isEmail = t.includes('@');
    const digits = t.replace(/[^0-9]/g, '');
    const orders = list
        .filter((o) => !isSeedOrder(o))
        .filter((o) => {
            if (isEmail) return String(o.email ?? '').toLowerCase().includes(t.toLowerCase());
            if (digits) return String(o.display_id ?? '').includes(digits);
            return true;
        })
        .slice(0, 5)
        .map((o) => ({
            id: o.id,
            display_id: o.display_id ?? null,
            email: o.email ?? null,
            total: o.total ?? null,
            currency_code: o.currency_code ?? null,
            status: o.status ?? null,
            payment_status: o.payment_status ?? null,
            fulfillment_status: o.fulfillment_status ?? null,
            created_at: o.created_at ?? null,
        }));
    return { orders, error: null };
}

export type AdminProductHit = {
    id: string;
    title: string | null;
    handle: string | null;
    thumbnail: string | null;
    status: string | null;
};

/** Search products (title/handle) for the console. Returns ≤5 rows. */
export async function searchAdminProducts(
    term: string,
): Promise<{ products: AdminProductHit[]; error: string | null }> {
    const t = term.trim();
    if (!t) return { products: [], error: null };
    const res = await adminFetch(
        `/admin/products?q=${encodeURIComponent(t)}&limit=8&fields=id,title,handle,status,thumbnail`,
    );
    if (!res) return { products: [], error: 'Store admin is unavailable right now.' };
    if (!res.ok) return { products: [], error: await errorMessage(res) };
    let list: any[] = [];
    try {
        list = (await res.json())?.products ?? [];
    } catch {
        return { products: [], error: 'Bad response from store admin.' };
    }
    const products = list.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title ?? null,
        handle: p.handle ?? null,
        thumbnail: p.thumbnail ?? null,
        status: p.status ?? null,
    }));
    return { products, error: null };
}

/** Cancel an order. Vendor-scoped; re-verified before acting. */
export async function cancelVendorOrder(
    vendorKey: string,
    orderId: string,
): Promise<ActionResult> {
    const o = await assertVendorOrder(vendorKey, orderId);
    if (!o) return { ok: false, error: 'Order not found for this shop.' };
    if ((o.status ?? '').toLowerCase() === 'canceled') {
        return { ok: false, error: 'This order is already canceled.' };
    }
    // Cancel is a WHOLE-ORDER action in Medusa. On a multi-vendor order it would
    // wrongly cancel other vendors' lines too, so a single shop may only cancel
    // an order that is entirely its own. Cross-vendor cancellation belongs to the
    // platform owner view (P2B).
    const allItems = Array.isArray(o.items) ? o.items : [];
    const mine = vendorLines(o, vendorKey);
    if (mine.length !== allItems.length) {
        return {
            ok: false,
            error: 'This order includes other shops — it can only be canceled by the platform owner.',
        };
    }
    const res = await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    if (!res || !res.ok) return { ok: false, error: await errorMessage(res) };
    return { ok: true };
}
