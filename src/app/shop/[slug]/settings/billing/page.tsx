import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';

export const metadata = { title: 'Billing' };

/**
 * Billing is not built yet and is hidden from the shop nav. Anyone who lands
 * here (old link, typed URL) goes to the general settings page. The membership
 * guard still runs first so this never reveals anything about shops the caller
 * doesn't belong to.
 */
export default async function ShopBillingPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    await requireShopMemberBySlug(slug);
    redirect(`/shop/${slug}/settings/general`);
}
