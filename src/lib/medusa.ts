/**
 * Read-only Medusa Store API client for rendering a shop's product catalog on
 * Rollout. The publishable key attributes reads to the Rollout sales channel.
 * It is a PUBLIC key (safe to ship) — the in-code fallback lets the catalog
 * render even before the Coolify env var is set.
 */
import 'server-only';

export const MEDUSA_URL =
    process.env.NEXT_PUBLIC_MEDUSA_URL || 'https://api.neferstock.com';

// PUBLIC publishable key for the Rollout storefront sales channel. Safe to ship.
const FALLBACK_PUBLISHABLE_KEY =
    'pk_9dc381390dd5fa8494d5f4f7d0607b2963579e773336a0404f790c4c1a850645';

export const MEDUSA_PUBLISHABLE_KEY =
    process.env.ROLLOUT_MEDUSA_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

export type MedusaProduct = {
    id: string;
    title: string;
    handle: string;
    thumbnail: string | null;
    description: string | null;
    price: number | null;
    currency: string | null;
};

function headers(): Record<string, string> {
    return {
        'x-publishable-api-key': MEDUSA_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
    };
}

async function resolveCategoryIds(handles: string[]): Promise<string[]> {
    const ids: string[] = [];
    await Promise.all(
        handles.map(async (h) => {
            try {
                const url = new URL(`${MEDUSA_URL}/store/product-categories`);
                url.searchParams.set('handle', h);
                url.searchParams.set('limit', '1');
                const res = await fetch(url.toString(), {
                    headers: headers(),
                    next: { revalidate: 300 },
                });
                if (!res.ok) return;
                const json = await res.json();
                const cat = json?.product_categories?.[0];
                if (cat?.id) ids.push(cat.id);
            } catch {
                /* best-effort */
            }
        }),
    );
    return ids;
}

function extractPrice(p: any): { price: number | null; currency: string | null } {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    let best: number | null = null;
    let currency: string | null = null;
    for (const v of variants) {
        const cp = v?.calculated_price;
        const amount =
            cp?.calculated_amount ?? cp?.amount ?? v?.prices?.[0]?.amount ?? null;
        if (amount != null && !Number.isNaN(Number(amount))) {
            const n = Number(amount);
            if (best == null || n < best) {
                best = n;
                currency = cp?.currency_code ?? v?.prices?.[0]?.currency_code ?? null;
            }
        }
    }
    return { price: best, currency };
}

/**
 * Fetch published products for a shop's Medusa category handles. Returns [] on
 * any error (surfaced as an empty catalog with an explanatory note).
 */
export async function fetchCatalogByHandles(
    handles: string[],
): Promise<{ products: MedusaProduct[]; error: string | null }> {
    if (!handles || handles.length === 0) return { products: [], error: null };
    try {
        const categoryIds = await resolveCategoryIds(handles);
        const url = new URL(`${MEDUSA_URL}/store/products`);
        url.searchParams.set('limit', '100');
        url.searchParams.set(
            'fields',
            'id,title,handle,thumbnail,description,*variants,*variants.calculated_price',
        );
        for (const cid of categoryIds) url.searchParams.append('category_id[]', cid);

        const res = await fetch(url.toString(), {
            headers: headers(),
            next: { revalidate: 300 },
        });
        if (!res.ok) {
            return { products: [], error: `Medusa responded ${res.status}` };
        }
        const json = await res.json();
        const products: MedusaProduct[] = (json?.products ?? []).map((p: any) => {
            const { price, currency } = extractPrice(p);
            return {
                id: p.id,
                title: p.title,
                handle: p.handle,
                thumbnail: p.thumbnail ?? null,
                description: p.description ?? null,
                price,
                currency,
            };
        });
        return { products, error: null };
    } catch (e: any) {
        return { products: [], error: e?.message ?? 'Catalog fetch failed' };
    }
}

export function formatMedusaPrice(p: MedusaProduct): string {
    if (p.price == null) return '—';
    // Medusa store amounts are already in major units for most modern configs.
    const cur = (p.currency ?? 'usd').toUpperCase();
    return `${cur === 'USD' ? '$' : cur + ' '}${p.price.toFixed(2)}`;
}
