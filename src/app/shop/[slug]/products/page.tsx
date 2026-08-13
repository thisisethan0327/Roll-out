/**
 * /shop/[slug]/products — a shop's catalog.
 *
 * Medusa-backed shops (rollout.shops.medusa_category_handles non-empty) get a
 * READ-ONLY catalog fetched from the Medusa Store API (attributed to the
 * Rollout sales channel); editing lives in the Medusa admin. Other shops get
 * their own public.products inventory list (read/create/edit, shop-scoped).
 *
 * The section is only reachable when shop.sells_products OR the shop has
 * public.products rows (enforced here + gated in the sidebar).
 */
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { fetchCatalogByHandles, formatMedusaPrice } from '@/lib/medusa';
import { ProductsManager } from './ProductsManager';

export const metadata = { title: 'Products' };

export default async function ProductsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    const { data: shopRow, error: shopRowError } = await admin
        .from('shops')
        .select('sells_products, medusa_category_handles')
        .eq('id', shop.shopId)
        .maybeSingle();
    if (shopRowError) console.error('[shop/products] shop row load failed:', shopRowError.message);

    const handles: string[] = Array.isArray((shopRow as any)?.medusa_category_handles)
        ? (shopRow as any).medusa_category_handles
        : [];
    const sellsProducts = Boolean((shopRow as any)?.sells_products);

    // Inventory rows for this shop (used both for the non-Medusa list and the
    // "section visible?" gate).
    const { data: productRows, error: productRowsError } = await pub
        .from('products')
        .select(
            'id, name, brand, model_sku, item_type, price, cost_per_unit, default_unit, low_stock_threshold, track_by, is_active, notes',
        )
        .eq('shop_id', shop.shopId)
        .order('name')
        .limit(1000);
    if (productRowsError) console.error('[shop/products] inventory load failed:', productRowsError.message);
    const inventory = (productRows ?? []) as any[];

    // Gate: only shops that sell products, are Medusa-backed, or already have
    // inventory rows may view this section.
    if (!sellsProducts && handles.length === 0 && inventory.length === 0) {
        notFound();
    }

    const medusaBacked = handles.length > 0;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">PRODUCTS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} ·{' '}
                        {medusaBacked ? 'MEDUSA CATALOG (READ-ONLY)' : 'INVENTORY'}
                    </div>
                </div>
            </div>

            {medusaBacked ? (
                <MedusaCatalog handles={handles} />
            ) : (
                <ProductsManager slug={slug} products={inventory} callerRole={role} />
            )}
        </>
    );
}

async function MedusaCatalog({ handles }: { handles: string[] }) {
    const { products, error } = await fetchCatalogByHandles(handles);

    return (
        <>
            <div
                style={{
                    border: '1px solid var(--line)',
                    background: 'var(--bg-2)',
                    padding: '10px 12px',
                    marginBottom: 14,
                    fontSize: 12,
                    color: 'var(--text-2)',
                }}
            >
                This catalog is managed in the Medusa admin. Product and pricing
                edits happen there; this view is read-only.
            </div>

            {error ? (
                <div className="admin-empty">CATALOG UNAVAILABLE — {error.toUpperCase()}</div>
            ) : products.length === 0 ? (
                <div className="admin-empty">NO PUBLISHED PRODUCTS IN THIS CATALOG YET</div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 14,
                    }}
                >
                    {products.map((p) => (
                        <div
                            key={p.id}
                            style={{
                                border: '1px solid var(--line)',
                                background: 'var(--bg-1)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div style={{ aspectRatio: '1', background: 'var(--bg-2)', overflow: 'hidden' }}>
                                {p.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={p.thumbnail} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : null}
                            </div>
                            <div style={{ padding: 10 }}>
                                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{p.title}</div>
                                <div
                                    style={{
                                        marginTop: 6,
                                        fontFamily: 'var(--font-mono, monospace)',
                                        fontSize: 13,
                                        color: 'var(--gold)',
                                    }}
                                >
                                    {formatMedusaPrice(p)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
