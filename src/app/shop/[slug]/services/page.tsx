import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ServiceRow, type ServiceRowData } from './ServiceRow';
import { AddServiceForm } from './AddServiceForm';
import { Search, SearchX, Wrench } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, CountStrip, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { CardHead, ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const metadata = { title: 'Services' };

const OWNER_ROLES = new Set(['owner', 'admin']);

type ServiceRecord = ServiceRowData;

async function loadServices(shopId: number, q?: string): Promise<ServiceRecord[]> {
    const admin = getSupabaseAdmin();
    let query = admin
        .from('shop_services')
        .select(
            'id, shop_id, category, subcategory, name, description, base_price, duration_hours, notes, sort_order, active',
        )
        .eq('shop_id', shopId)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

    if (q) {
        const safe = q.replace(/[%_]/g, ' ');
        query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) console.error('[shop/services] loadServices failed:', error.message);
    return ((data as any[]) ?? []) as ServiceRecord[];
}

function formatPrice(p: number | null | undefined): string {
    if (p == null) return '—';
    const num = typeof p === 'string' ? parseFloat(p) : p;
    if (Number.isNaN(num)) return '—';
    return `$${num.toFixed(2)}`;
}

export default async function ShopServicesPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ q?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { q } = await searchParams;

    const items = await loadServices(shop.shopId, q);

    const totalServices = items.length;
    const activeCount = items.filter((i) => i.active).length;
    const categories = Array.from(
        new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
    );
    const pricedItems = items.filter(
        (i) => i.base_price != null && !Number.isNaN(Number(i.base_price)),
    );
    const avgPrice = pricedItems.length
        ? pricedItems.reduce((sum, i) => sum + Number(i.base_price), 0) / pricedItems.length
        : null;

    // Group by category
    const grouped: Record<string, ServiceRecord[]> = {};
    for (const it of items) {
        const key = it.category ?? 'UNCATEGORIZED';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(it);
    }
    const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    const canDelete = OWNER_ROLES.has(role);

    return (
        <BizPage slug={slug}>
            <ConsoleHead title="Services" sub={`${shop.name} · Catalog`} actions={<AddServiceForm shopId={shop.shopId} />} />

            <CountStrip
                label="Service totals"
                items={[
                    { label: 'Total services', value: totalServices },
                    { label: 'Active', value: activeCount },
                    { label: 'Categories', value: categories.length },
                    { label: 'Avg price', value: formatPrice(avgPrice) },
                ]}
            />

            <form className={bz.search} action={`/shop/${slug}/services`} role="search">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <input name="q" defaultValue={q ?? ''} placeholder="Search name or description" aria-label="Search services" />
                <button type="submit">Search</button>
            </form>

            {groupKeys.length === 0 ? (
                <section className="g-card">
                    {q ? (
                        <CardEmpty
                            icon={<SearchX size={22} strokeWidth={1.75} />}
                            title="No services match"
                            search={q}
                            action={
                                <a href={`/shop/${slug}/services`} className={bz.act}>
                                    Clear search
                                </a>
                            }
                        />
                    ) : (
                        <CardEmpty
                            icon={<Wrench size={22} strokeWidth={1.75} />}
                            title="No services yet"
                        />
                    )}
                </section>
            ) : (
                groupKeys.map((cat) => (
                    <section key={cat} className="g-card" aria-labelledby={`svc-${cat}`}>
                        <CardHead
                            id={`svc-${cat}`}
                            title={cat}
                            sub={`${grouped[cat].length} item${grouped[cat].length === 1 ? '' : 's'}`}
                        />
                        <div className={cx(cs.tblWrap)} style={{ marginTop: 10 }}>
                            <table className={cx(cs.tbl, bz.svcTbl)}>
                                <colgroup>
                                    <col style={{ width: '24%' }} />
                                    <col className={bz.svcDesc} />
                                    <col style={{ width: 130 }} />
                                    <col style={{ width: 110 }} />
                                    <col style={{ width: 140 }} />
                                    <col style={{ width: 230 }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th scope="col">Name</th>
                                        <th scope="col" className={cs.mHide}>
                                            Description
                                        </th>
                                        <th scope="col" style={{ textAlign: 'right' }}>
                                            Price
                                        </th>
                                        <th scope="col" className={cs.mHide}>
                                            Duration
                                        </th>
                                        <th scope="col">Status</th>
                                        <th scope="col">
                                            <span className="g-sr">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grouped[cat].map((it) => (
                                        <ServiceRow key={it.id} service={it} canDelete={canDelete} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))
            )}
        </BizPage>
    );
}
