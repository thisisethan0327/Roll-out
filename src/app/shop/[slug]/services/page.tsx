import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ServiceRow, type ServiceRowData } from './ServiceRow';
import { AddServiceForm } from './AddServiceForm';

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

    const { data } = await query;
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
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SERVICES</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · CATALOG
                    </div>
                </div>
                <AddServiceForm shopId={shop.shopId} />
            </div>

            <div className="admin-stat-grid">
                <div className="admin-stat">
                    <div className="admin-stat-lbl">TOTAL SERVICES</div>
                    <div className="admin-stat-num">{totalServices}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">ACTIVE</div>
                    <div className="admin-stat-num gold">{activeCount}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">CATEGORIES</div>
                    <div className="admin-stat-num">{categories.length}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">AVG PRICE</div>
                    <div className="admin-stat-num">{formatPrice(avgPrice)}</div>
                </div>
            </div>

            <form
                className="admin-search"
                action={`/shop/${slug}/services`}
                style={{ marginTop: 12 }}
            >
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH NAME OR DESCRIPTION"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            {groupKeys.length === 0 ? (
                <div className="admin-empty">
                    {q ? (
                        <>NO MATCHES FOR &ldquo;{q}&rdquo;.</>
                    ) : (
                        <>
                            NO SERVICES YET — ADD YOUR FIRST.
                        </>
                    )}
                </div>
            ) : (
                groupKeys.map((cat) => (
                    <div key={cat} style={{ marginTop: 20 }}>
                        <div
                            className="admin-page-head"
                            style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 8 }}
                        >
                            <div>
                                <div className="admin-page-title" style={{ fontSize: 14 }}>
                                    {cat.toUpperCase()}
                                </div>
                                <div className="admin-page-sub">
                                    {grouped[cat].length} ITEM
                                    {grouped[cat].length === 1 ? '' : 'S'}
                                </div>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>NAME</th>
                                        <th>DESCRIPTION</th>
                                        <th>PRICE</th>
                                        <th>DURATION</th>
                                        <th>STATUS</th>
                                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grouped[cat].map((it) => (
                                        <ServiceRow
                                            key={it.id}
                                            service={it}
                                            canDelete={canDelete}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </>
    );
}
