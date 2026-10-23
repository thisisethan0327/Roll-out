import { headers } from 'next/headers';
import { requireSession, listMyShops } from '@/lib/auth-guard';
import { tenantForHost } from '@/lib/tenant-hosts';
import { brandForSlug } from '@/lib/tenant-brand';
import { ShopPickerView } from '@/components/glide-auth/ShopPickerView';

export const metadata = { title: 'Choose Shop' };

export default async function ShopPickerPage() {
    const { profile } = await requireSession('/shop/login');
    const shops = await listMyShops(profile.profileId);
    // A tenant's own door shows the tenant's name in the bar, never "rollout".
    const tenant = tenantForHost((await headers()).get('host'));

    return <ShopPickerView shops={shops} barLabel={tenant ? brandForSlug(tenant.slug).label : undefined} />;
}
