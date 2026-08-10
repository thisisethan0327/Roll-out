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

    const { orders, error } = await listVendorOrders(resolved.vendorKey);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ORDERS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {orders.length} ORDER
                        {orders.length === 1 ? '' : 'S'}
                    </div>
                </div>
            </div>

            {error ? (
                <div className="admin-empty">ORDERS UNAVAILABLE — {error.toUpperCase()}</div>
            ) : (
                <OrdersList slug={slug} orders={orders} callerRole={role} />
            )}
        </>
    );
}
