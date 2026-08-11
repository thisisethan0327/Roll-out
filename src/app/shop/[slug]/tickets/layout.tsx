/**
 * TICKETS section gate. Tier module guard: `notFound()` unless this shop has
 * the TICKETS module enabled (tier 3 by default, or an explicit override).
 * Covers every nested route (list, /new, /[id], invoice, work-order) since a
 * Next layout wraps the whole subtree. Sidebar-hiding alone is cosmetic — this
 * is the server-side enforcement boundary. Reversible: enabling the module for
 * a shop restores access with no data change.
 */
import { requireShopModule } from '@/lib/auth-guard';
import { ModuleKey } from '@/lib/shop-modules';

export default async function TicketsGate({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    await requireShopModule(slug, ModuleKey.Tickets);
    return <>{children}</>;
}
