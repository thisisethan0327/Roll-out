/**
 * /shop/[slug]/orders — a shop's own Medusa orders (vendor-scoped).
 *
 * Only reachable when the shop resolves to a vendor key (a Medusa-backed selling
 * shop — NeferStock, divine). EMWRAPS and other catalog-less shops have no
 * vendor key and 404 here (and the sidebar hides the link). The list is fetched
 * as the platform admin but filtered to this shop's vendor before anything is
 * returned, so a shop only ever sees its own orders.
 */
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { listVendorOrders } from '@/lib/medusa-admin';
import { OrdersList } from './OrdersList';
import { SHOPS_WITH_OWN_ADMIN } from '@/lib/tenant-hosts';
import { ManagedElsewhereNotice } from '../ManagedElsewhereNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders' };

export default async function OrdersPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);

    // Vendor gate — a shop with no vendor key has no Orders section.
    const resolved = await getShopVendorBySlug(slug);
    if (!resolved) notFound();

    // 200 is the route's cap. If a shop ever has more, the header says so
    // rather than quietly showing a short list — silent truncation is the exact
    // bug this whole change exists to remove, and reintroducing it one layer up
    // would be a poor joke.
    const { orders, error, count, hasMore } = await listVendorOrders(resolved.vendorKey, {
        limit: 200,
    });

    // The list hides archived orders until you ask for them, so a single total
    // in the header described a table nobody could see: "106 ORDERS" above ten
    // rows (run 9, lane E). Splitting it makes the header agree with what is on
    // screen — and keeps a header that DISAGREES meaningful, which is the signal
    // worth watching if the index and the vendor predicate ever diverge.
    const archivedCount = orders.filter(
        (o) => String(o.status ?? '').toLowerCase() === 'archived',
    ).length;
    const openCount = orders.length - archivedCount;

    // Read-only for a shop with its own admin — say where, rather than leaving
    // the actions quietly absent.
    const managedElsewhere = SHOPS_WITH_OWN_ADMIN[slug] ?? null;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ORDERS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} ·{' '}
                        {hasMore
                            ? `NEWEST ${orders.length} OF ${count} ORDERS`
                            : archivedCount > 0
                              ? `${openCount} OPEN · ${archivedCount} ARCHIVED`
                              : `${orders.length} ORDER${orders.length === 1 ? '' : 'S'}`}
                    </div>
                </div>
            </div>

            {managedElsewhere ? (
                <ManagedElsewhereNotice adminUrl={managedElsewhere} what="orders" />
            ) : null}

            {error ? (
                <div className="admin-empty">ORDERS UNAVAILABLE — {error.toUpperCase()}</div>
            ) : (
                <OrdersList slug={slug} orders={orders} callerRole={role} />
            )}
        </>
    );
}
