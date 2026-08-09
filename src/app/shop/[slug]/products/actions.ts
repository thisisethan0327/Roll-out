'use server';
/**
 * CRUD for a shop's own inventory products (public.products, shop-scoped).
 * Only used by shops WITHOUT a Medusa catalog; Medusa-backed shops render a
 * read-only catalog and edit in the Medusa admin.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function guard(slug: string) {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('id').eq('slug', slug).maybeSingle();
    const shopId = (data as any)?.id;
    if (!shopId) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) throw new Error('Manager role required.');
    return { profile, role, shopId };
}

function readFields(formData: FormData) {
    const num = (k: string): number | null => {
        const raw = (formData.get(k) ?? '').toString().trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isNaN(n) ? null : n;
    };
    const trackBy = (formData.get('track_by') ?? 'serial').toString();
    return {
        name: (formData.get('name') ?? '').toString().trim(),
        brand: (formData.get('brand') ?? '').toString().trim() || null,
        model_sku: (formData.get('model_sku') ?? '').toString().trim() || null,
        item_type: (formData.get('item_type') ?? '').toString().trim() || 'other',
        price: num('price'),
        cost_per_unit: num('cost_per_unit'),
        default_unit: (formData.get('default_unit') ?? '').toString().trim() || 'roll',
        low_stock_threshold: num('low_stock_threshold') ?? 1,
        notes: (formData.get('notes') ?? '').toString().trim() || null,
        track_by: trackBy === 'quantity' ? 'quantity' : 'serial',
    };
}

export async function createProduct(slug: string, formData: FormData) {
    const { shopId } = await guard(slug);
    const fields = readFields(formData);
    if (!fields.name) throw new Error('Name is required.');
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('products')
        .insert({ ...fields, shop_id: shopId, is_active: true, restockable: true });
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/products`, 'page');
}

export async function updateProduct(slug: string, productId: string, formData: FormData) {
    const { shopId } = await guard(slug);
    const fields = readFields(formData);
    if (!fields.name) throw new Error('Name is required.');
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('products')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/products`, 'page');
}

export async function toggleProductActive(slug: string, productId: string) {
    const { shopId } = await guard(slug);
    const pub = getSupabasePublicAdmin();
    const { data: cur } = await pub
        .from('products')
        .select('is_active')
        .eq('id', productId)
        .eq('shop_id', shopId)
        .maybeSingle();
    const next = !((cur as any)?.is_active);
    const { error } = await pub
        .from('products')
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/products`, 'page');
}
