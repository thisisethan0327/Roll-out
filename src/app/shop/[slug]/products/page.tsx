/**
 * /shop/[slug]/products — a shop's catalog.
 *
 * Medusa-backed shops (rollout.shops.medusa_category_handles non-empty) get a
 * READ-ONLY catalog read through the ADMIN API, scoped to the shop's own
 * categories — see listVendorProducts for why it is not the Store API, and why
 * that mattered. Editing still lives in the Medusa admin. Other shops get their
 * own public.products inventory list (read/create/edit, shop-scoped).
 *
 * The section is only reachable when shop.sells_products OR the shop has
 * public.products rows (enforced here + gated in the sidebar).
 */
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { listVendorProducts } from '@/lib/medusa-admin';
import { fmtMoney } from '../orders/ui';
import { ProductsManager } from './ProductsManager';
import { SHOPS_WITH_OWN_ADMIN } from '@/lib/tenant-hosts';
import { ManagedElsewhereNotice } from '../ManagedElsewhereNotice';
import { CircleDashed, CirclePause, ImageOff, Layers, Package } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, Notice } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { ConsoleHead } from '@/components/glide-console/parts';

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
        <BizPage slug={slug}>
            <ConsoleHead
                title="Products"
                sub={`${shop.name} · ${medusaBacked ? 'Store catalog, read-only here' : 'Inventory'}`}
            />

            {medusaBacked ? (
                <MedusaCatalog handles={handles} adminUrl={SHOPS_WITH_OWN_ADMIN[slug] ?? null} />
            ) : (
                <ProductsManager
                    slug={slug}
                    products={inventory}
                    // Read-only for a shop with its own admin: the server
                    // action refuses these too, this only stops offering them.
                    callerRole={SHOPS_WITH_OWN_ADMIN[slug] ? 'viewer' : role}
                />
            )}
        </BizPage>
    );
}

async function MedusaCatalog({
    handles,
    adminUrl,
}: {
    handles: string[];
    /** The shop's own admin, when it has one — see SHOPS_WITH_OWN_ADMIN. */
    adminUrl: string | null;
}) {
    const { products, error } = await listVendorProducts(handles);
    const ic = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <>
            {adminUrl ? (
                <ManagedElsewhereNotice adminUrl={adminUrl} what="its catalogue" />
            ) : null}

            <Notice>
                {/* Pointing a shop with its own admin at "the Medusa admin" sends
                    it to the wrong place — that is the platform's console, not
                    theirs. The notice above already named the right door. */}
                {adminUrl
                    ? 'Paused and draft items are shown, so the list matches the catalog.'
                    : 'This catalog is managed in the Medusa admin. Product and pricing edits happen there; this view is read-only. Paused and draft items are shown, so the list matches the catalog.'}
            </Notice>

            {error ? (
                <Notice tone="bad">
                    <b>The catalog is unavailable right now.</b> {error}
                </Notice>
            ) : products.length === 0 ? (
                <section className="g-card">
                    <CardEmpty
                        icon={<Package size={22} strokeWidth={1.75} />}
                        title="No products in this catalog yet"
                        body="Products added to this shop’s store categories show up here, drafts and paused items included."
                    />
                </section>
            ) : (
                <ul className={bz.grid} aria-label="Catalog">
                    {products.map((p) => (
                        <li key={p.id}>
                            <article className={bz.tile}>
                                <div className={bz.tileIm}>
                                    {p.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.thumbnail} alt={p.title} />
                                    ) : (
                                        <ImageOff size={26} strokeWidth={1.5} aria-hidden="true" />
                                    )}
                                </div>
                                <div className={bz.tileBd}>
                                    <b>{p.title}</b>
                                    {p.priceAmount != null ? (
                                        <span className={bz.price}>{fmtMoney(p.priceAmount, p.currency)}</span>
                                    ) : (
                                        <span className={bz.priceNone}>No price set</span>
                                    )}
                                    {/* The state a shop most needs to see about its
                                        own catalogue, and precisely what the old
                                        store-API read could not show: paused items
                                        and drafts were invisible to it by design. */}
                                    <div className={bz.chipsSm}>
                                        {p.paused && (
                                            <span className="g-chip">
                                                <CirclePause {...ic} />
                                                Paused
                                            </span>
                                        )}
                                        {p.status !== 'published' && (
                                            <span className="g-chip">
                                                <CircleDashed {...ic} />
                                                {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                                            </span>
                                        )}
                                        <span className="g-chip">
                                            <Layers {...ic} />
                                            {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                </div>
                            </article>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
