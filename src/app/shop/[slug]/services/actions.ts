'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) {
        throw new Error('Manager role required.');
    }
    return { profile, role };
}

async function requireOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!OWNER_ROLES.has(role)) {
        throw new Error('Owner/admin role required.');
    }
    return { profile, role };
}

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

function bustPath(slug: string) {
    revalidatePath(`/shop/${slug}/services`, 'page');
}

/**
 * Pull the editable form fields out of a FormData payload. Empty strings
 * become null for nullable columns so the DB doesn't store empties.
 */
function readFields(formData: FormData) {
    const name = (formData.get('name') ?? '').toString().trim();
    const category = (formData.get('category') ?? '').toString().trim().toUpperCase() || 'OTHER';
    const subcategoryRaw = (formData.get('subcategory') ?? '').toString().trim();
    const descriptionRaw = (formData.get('description') ?? '').toString().trim();
    const notesRaw = (formData.get('notes') ?? '').toString().trim();
    const priceRaw = (formData.get('base_price') ?? '').toString().trim();
    const durationRaw = (formData.get('duration_hours') ?? '').toString().trim();
    const sortOrderRaw = (formData.get('sort_order') ?? '').toString().trim();
    const active = formData.get('active') != null;

    let base_price: number | null = null;
    if (priceRaw) {
        const n = parseFloat(priceRaw);
        if (!Number.isNaN(n)) base_price = n;
    }
    let duration_hours: number | null = null;
    if (durationRaw) {
        const n = parseFloat(durationRaw);
        if (!Number.isNaN(n)) duration_hours = n;
    }
    let sort_order: number = 0;
    if (sortOrderRaw) {
        const n = parseInt(sortOrderRaw, 10);
        if (!Number.isNaN(n)) sort_order = n;
    }

    return {
        name,
        category,
        subcategory: subcategoryRaw || null,
        description: descriptionRaw || null,
        notes: notesRaw || null,
        base_price,
        duration_hours,
        sort_order,
        active,
    };
}

export async function addService(shopId: number, formData: FormData) {
    await requireManager(shopId);
    const fields = readFields(formData);
    if (!fields.name) throw new Error('Name is required.');
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_services')
        .insert({ shop_id: shopId, ...fields });
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPath(slug);
}

export async function updateService(
    serviceId: string,
    shopId: number,
    formData: FormData,
) {
    await requireManager(shopId);
    const fields = readFields(formData);
    if (!fields.name) throw new Error('Name is required.');
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_services')
        .update(fields)
        .eq('id', serviceId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPath(slug);
}

export async function toggleServiceActive(serviceId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { data: current, error: getErr } = await admin
        .from('shop_services')
        .select('active')
        .eq('id', serviceId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (getErr || !current) throw new Error(getErr?.message ?? 'Service not found.');
    const nextActive = !((current as any).active);
    const { error } = await admin
        .from('shop_services')
        .update({ active: nextActive })
        .eq('id', serviceId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPath(slug);
}

export async function deleteService(serviceId: string, shopId: number) {
    await requireOwner(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('shop_services')
        .delete()
        .eq('id', serviceId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPath(slug);
}
