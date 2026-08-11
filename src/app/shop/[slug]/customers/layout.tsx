/**
 * CUSTOMERS section gate. Tier module guard: `notFound()` unless this shop has
 * the CUSTOMERS module enabled (tier 2+ by default, or an explicit override).
 * Covers the whole subtree (list, /new, /[id]). Sidebar-hiding is cosmetic —
 * this is the enforcement boundary. Reversible: enabling the module restores
 * access with no data change.
 */
import { requireShopModule } from '@/lib/auth-guard';
import { ModuleKey } from '@/lib/shop-modules';

export default async function CustomersGate({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    await requireShopModule(slug, ModuleKey.Customers);
    return <>{children}</>;
}
