import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Services' };

// EMWRAPS is the bootstrap tenant — its catalog lives in public.service_items
// (single-tenant, predates the rollout schema). All other shops get an empty
// state until the multi-tenant rollout.shop_services table ships.
const EMWRAPS_SHOP_ID = 1;

type ServiceItem = {
    id: string;
    category: string | null;
    subcategory: string | null;
    name: string | null;
    description: string | null;
    base_price: number | null;
    active: boolean | null;
    sort_order: number | null;
};

async function loadEmwrapsCatalog(): Promise<ServiceItem[]> {
    const pub = getSupabasePublicAdmin();
    const { data } = await pub
        .from('service_items')
        .select('id, category, subcategory, name, description, base_price, active, sort_order')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    return (data ?? []) as ServiceItem[];
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '—';
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trimEnd() + '…';
}

function formatPrice(p: number | null | undefined): string {
    if (p == null) return '—';
    const num = typeof p === 'string' ? parseFloat(p) : p;
    if (Number.isNaN(num)) return '—';
    return `$${num.toFixed(2)}`;
}

export default async function ShopServicesPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    if (shop.shopId !== EMWRAPS_SHOP_ID) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">SERVICES</div>
                        <div className="admin-page-sub">
                            {shop.name.toUpperCase()} · CATALOG
                        </div>
                    </div>
                </div>
                <div className="admin-empty">
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                        MULTI-TENANT SERVICE CATALOG COMING SOON
                    </div>
                    <div
                        style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: 'var(--text-3)',
                        }}
                    >
                        For now, services are managed in your shop&apos;s notes. The per-shop
                        editable catalog (with pricing tiers, options, and add-ons) is on the
                        roadmap and ships alongside the public booking form upgrades.
                    </div>
                </div>
            </>
        );
    }

    const items = await loadEmwrapsCatalog();
    const totalServices = items.length;
    const activeCount = items.filter((i) => i.active).length;
    const categories = Array.from(
        new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
    ).sort((a, b) => a.localeCompare(b));

    // Group by category for rendering
    const grouped: Record<string, ServiceItem[]> = {};
    for (const it of items) {
        const key = it.category ?? 'UNCATEGORIZED';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(it);
    }
    const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SERVICES</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · CATALOG
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginBottom: 16,
                    padding: 12,
                    border: '1px solid var(--gold)',
                    background: 'var(--gold-glow)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: 'var(--track-wide)',
                    color: 'var(--text-2)',
                }}
            >
                <strong style={{ color: 'var(--gold)' }}>READ-ONLY FOR V1</strong> — editing the
                catalog per-shop ships in a future update. For now, changes happen in the legacy
                tickets app.
            </div>

            <div className="admin-stat-grid">
                <div className="admin-stat">
                    <div className="admin-stat-lbl">TOTAL SERVICES</div>
                    <div className="admin-stat-num">{totalServices}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">CATEGORIES</div>
                    <div className="admin-stat-num">{categories.length}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">ACTIVE</div>
                    <div className="admin-stat-num gold">{activeCount}</div>
                </div>
            </div>

            {groupKeys.length === 0 ? (
                <div className="admin-empty">NO SERVICES FOUND IN CATALOG.</div>
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
                                    {grouped[cat].length} ITEM{grouped[cat].length === 1 ? '' : 'S'}
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
                                        <th style={{ textAlign: 'right' }}>ACTIVE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grouped[cat].map((it) => (
                                        <tr key={it.id}>
                                            <td>
                                                {it.name ?? '—'}
                                                {it.subcategory ? (
                                                    <div className="admin-handle">
                                                        {it.subcategory}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td>{truncate(it.description, 80)}</td>
                                            <td>{formatPrice(it.base_price)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {it.active ? (
                                                    <span className="admin-pill neon">ACTIVE</span>
                                                ) : (
                                                    <span className="admin-pill warn">OFF</span>
                                                )}
                                            </td>
                                        </tr>
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
