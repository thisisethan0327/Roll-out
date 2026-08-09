'use server';
/**
 * Customer + vehicle CRUD for the shop console. Legacy customers live in
 * public.customers (no shop_id of their own — scoped by their tickets) and
 * public.vehicles (shop_id + customer_id, so directly shop-scoped).
 *
 * TENANCY: vehicles always filter/stamp shop_id. Customers are shared rows; we
 * scope access by requiring the customer to already have a ticket/vehicle at
 * this shop before edit, and always stamp new vehicles with this shop_id. New
 * customers are created together with a first vehicle (or on their own) and
 * become visible to the shop once a ticket/vehicle links them.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';

const INSTALLER_ROLES = new Set(['owner', 'admin', 'manager', 'installer']);
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function resolveSlug(slug: string): Promise<number | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('id').eq('slug', slug).maybeSingle();
    return (data as any)?.id ?? null;
}

async function guard(slug: string, roles: Set<string>) {
    const shopId = await resolveSlug(slug);
    if (!shopId) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shopId);
    if (!roles.has(role)) throw new Error('Insufficient role for this action.');
    return { profile, role, shopId };
}

/** Confirm this customer is reachable from the shop (has a ticket or vehicle here). */
async function assertShopCustomer(shopId: number, customerId: string) {
    const pub = getSupabasePublicAdmin();
    const [tk, vh] = await Promise.all([
        pub.from('tickets').select('id').eq('shop_id', shopId).eq('customer_id', customerId).limit(1),
        pub.from('vehicles').select('id').eq('shop_id', shopId).eq('customer_id', customerId).limit(1),
    ]);
    if (((tk.data ?? []).length === 0) && ((vh.data ?? []).length === 0)) {
        throw new Error('Customer not associated with this shop.');
    }
}

function readCustomer(formData: FormData) {
    const first = (formData.get('first_name') ?? '').toString().trim();
    const last = (formData.get('last_name') ?? '').toString().trim();
    const name = (formData.get('name') ?? '').toString().trim() || `${first} ${last}`.trim();
    return {
        first_name: first || null,
        last_name: last || null,
        name: name || null,
        email: (formData.get('email') ?? '').toString().trim() || null,
        phone: (formData.get('phone') ?? '').toString().trim() || null,
        company: (formData.get('company') ?? '').toString().trim() || null,
        notes: (formData.get('notes') ?? '').toString().trim() || null,
    };
}

function readVehicle(formData: FormData) {
    const yearRaw = (formData.get('year') ?? '').toString().trim();
    const year = yearRaw ? Number(yearRaw) : null;
    return {
        year: year && !Number.isNaN(year) ? year : null,
        make: (formData.get('make') ?? '').toString().trim() || null,
        model: (formData.get('model') ?? '').toString().trim() || null,
        trim: (formData.get('trim') ?? '').toString().trim() || null,
        color: (formData.get('color') ?? '').toString().trim() || null,
        vin: (formData.get('vin') ?? '').toString().trim() || null,
        license_plate: (formData.get('license_plate') ?? '').toString().trim() || null,
        notes: (formData.get('notes_vehicle') ?? '').toString().trim() || null,
    };
}

export async function createCustomer(slug: string, formData: FormData) {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    const fields = readCustomer(formData);
    if (!fields.name && !fields.email && !fields.phone) {
        throw new Error('Provide at least a name, email, or phone.');
    }
    const pub = getSupabasePublicAdmin();
    const { data: cust, error } = await pub
        .from('customers')
        .insert({ ...fields, source: 'rollout-shop', status: 'active' })
        .select('id')
        .maybeSingle();
    if (error) throw new Error(error.message);
    const customerId = (cust as any).id;

    // Optionally create a first vehicle (stamped with this shop) so the
    // customer is immediately visible/owned by the shop.
    const veh = readVehicle(formData);
    if (veh.make || veh.model || veh.vin) {
        await pub.from('vehicles').insert({ ...veh, customer_id: customerId, shop_id: shopId });
    }
    revalidatePath(`/shop/${slug}/customers`, 'page');
    redirect(`/shop/${slug}/customers/l-${customerId}`);
}

export async function updateCustomer(slug: string, customerId: string, formData: FormData) {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    await assertShopCustomer(shopId, customerId);
    const fields = readCustomer(formData);
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('customers')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', customerId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/customers/l-${customerId}`, 'page');
}

export async function addVehicle(slug: string, customerId: string, formData: FormData) {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    await assertShopCustomer(shopId, customerId);
    const veh = readVehicle(formData);
    if (!veh.make && !veh.model && !veh.vin) throw new Error('Enter a make, model, or VIN.');
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('vehicles')
        .insert({ ...veh, customer_id: customerId, shop_id: shopId });
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/customers/l-${customerId}`, 'page');
}

export async function updateVehicle(
    slug: string,
    vehicleId: string,
    customerId: string,
    formData: FormData,
) {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    const veh = readVehicle(formData);
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('vehicles')
        .update({ ...veh, updated_at: new Date().toISOString() })
        .eq('id', vehicleId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/customers/l-${customerId}`, 'page');
}

export async function deleteVehicle(slug: string, vehicleId: string, customerId: string) {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('vehicles')
        .delete()
        .eq('id', vehicleId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/customers/l-${customerId}`, 'page');
}
