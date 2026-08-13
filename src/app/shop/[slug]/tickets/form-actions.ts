'use server';
/**
 * Data/server actions backing the structured new+edit ticket forms:
 *   - customer typeahead (shop-scoped)
 *   - a customer's vehicles (shop-scoped)
 *   - service catalog (EMWRAPS → public.service_items with tint options;
 *     other shops → rollout.shop_services)
 *   - NHTSA VPIC VIN decode (server-side)
 *   - lazy materials picker options (products + in-stock serials)
 *   - edit-mode customer/vehicle relink (+ inline create)
 *
 * Every read/write re-resolves slug → shop_id and re-checks role. All
 * public.customers/vehicles/tickets access filters or stamps shop_id (the
 * Rollout tenant key) explicitly — never trusting the column default.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { logTicketActivity } from '@/lib/ticket-activity';
import { resolveActingWorkerId } from '@/lib/staff-bridge';

const INSTALLER_ROLES = new Set(['owner', 'admin', 'manager', 'installer']);
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function resolveSlug(slug: string): Promise<{ shopId: number; slug: string } | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('id, slug').eq('slug', slug).maybeSingle();
    if (!data) return null;
    return { shopId: (data as any).id, slug: (data as any).slug };
}

async function guard(slug: string, roles: Set<string>) {
    const shop = await resolveSlug(slug);
    if (!shop) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shop.shopId);
    if (!roles.has(role)) throw new Error('Insufficient role for this action.');
    return { profile, role, shopId: shop.shopId, shopSlug: shop.slug };
}

// ── CUSTOMER TYPEAHEAD ──────────────────────────────────────────────────────

export type CustomerHit = {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
};

/** Shop-scoped customer search over name/email/phone/company. */
export async function searchCustomers(slug: string, query: string): Promise<CustomerHit[]> {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    const q = (query ?? '').trim();
    if (q.length < 2) return [];
    const pub = getSupabasePublicAdmin();
    // Escape PostgREST or() reserved chars (comma / parens) in the term.
    const safe = q.replace(/[,()]/g, ' ');
    const like = `%${safe}%`;
    const { data, error } = await pub
        .from('customers')
        .select('id, name, email, phone, company, first_name, last_name')
        .eq('shop_id', shopId)
        .or(
            `name.ilike.${like},email.ilike.${like},phone.ilike.${like},company.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
        )
        .order('name')
        .limit(8);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((c) => ({
        id: c.id,
        name: c.name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        company: c.company ?? null,
    }));
}

// ── CUSTOMER VEHICLES ───────────────────────────────────────────────────────

export type VehicleHit = {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    color: string | null;
    vin: string | null;
};

/** A customer's vehicles at this shop. */
export async function listCustomerVehicles(slug: string, customerId: string): Promise<VehicleHit[]> {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    if (!customerId) return [];
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('vehicles')
        .select('id, year, make, model, trim, color, vin')
        .eq('shop_id', shopId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleHit[];
}

// ── SERVICE CATALOG ─────────────────────────────────────────────────────────

export type CatalogOption = { label: string; price: number | null; duration: string | null };
export type CatalogItem = {
    id: string;
    name: string;
    price: number | null;
    priceType: string | null;
    duration: string | null;
    options: CatalogOption[];
};
export type CatalogSub = { subcategory: string; items: CatalogItem[] };
export type CatalogCategory = { category: string; subcategories: CatalogSub[] };

function groupCatalog(
    rows: { category: string | null; subcategory: string | null; name: string; price: number | null; priceType: string | null; duration: string | null; options: CatalogOption[]; id: string }[],
): CatalogCategory[] {
    const cats = new Map<string, Map<string, CatalogItem[]>>();
    for (const r of rows) {
        const cat = (r.category ?? 'Other').trim() || 'Other';
        const sub = (r.subcategory ?? 'General').trim() || 'General';
        if (!cats.has(cat)) cats.set(cat, new Map());
        const subs = cats.get(cat)!;
        if (!subs.has(sub)) subs.set(sub, []);
        subs.get(sub)!.push({
            id: r.id,
            name: r.name,
            price: r.price,
            priceType: r.priceType,
            duration: r.duration,
            options: r.options,
        });
    }
    return Array.from(cats.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, subs]) => ({
            category,
            subcategories: Array.from(subs.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([subcategory, items]) => ({ subcategory, items })),
        }));
}

/**
 * The shop's service catalog. EMWRAPS uses public.service_items (their real
 * catalog, includes tint % options + price_type + duration). Other shops use
 * rollout.shop_services.
 */
export async function loadServiceCatalog(slug: string): Promise<CatalogCategory[]> {
    const { shopId, shopSlug } = await guard(slug, INSTALLER_ROLES);
    const pub = getSupabasePublicAdmin();
    const admin = getSupabaseAdmin();

    if (shopSlug === 'emwraps' || shopId === 1) {
        const { data, error } = await pub
            .from('service_items')
            .select('id, category, subcategory, name, price, price_type, duration, options, sort_order')
            .eq('active', true)
            .order('sort_order')
            .limit(1000);
        if (error) console.error('[shop/tickets/form-actions] service_items catalog load failed:', error.message);
        const rows = ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            category: r.category,
            subcategory: r.subcategory,
            name: r.name,
            price: r.price != null ? Number(r.price) : null,
            priceType: r.price_type ?? null,
            duration: r.duration ?? null,
            options: Array.isArray(r.options)
                ? r.options.map((o: any) => ({
                      label: String(o.label ?? ''),
                      price: o.price != null ? Number(o.price) : null,
                      duration: o.duration ?? null,
                  }))
                : [],
        }));
        return groupCatalog(rows);
    }

    // rollout.shop_services (schema-pinned admin client).
    const { data, error } = await admin
        .from('shop_services')
        .select('id, category, subcategory, name, base_price, duration_hours, sort_order')
        .eq('shop_id', shopId)
        .eq('active', true)
        .order('sort_order')
        .limit(1000);
    if (error) console.error('[shop/tickets/form-actions] shop_services catalog load failed:', error.message);
    const rows = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        category: r.category,
        subcategory: r.subcategory,
        name: r.name,
        price: r.base_price != null ? Number(r.base_price) : null,
        priceType: 'fixed' as string | null,
        duration: r.duration_hours != null ? `${r.duration_hours}h` : null,
        options: [] as CatalogOption[],
    }));
    return groupCatalog(rows);
}

// ── NHTSA VPIC VIN DECODE ───────────────────────────────────────────────────

function titleCase(s: string): string {
    return s
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

export type VinDecode = {
    year: string | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    bodyClass: string | null;
    fuelType: string | null;
};

/** Decode a 17-char VIN via NHTSA VPIC (server-side; mirrors emwraps useNHTSA). */
export async function decodeVin(slug: string, vin: string): Promise<VinDecode> {
    await guard(slug, INSTALLER_ROLES);
    const clean = (vin ?? '').trim().toUpperCase();
    if (clean.length !== 17) throw new Error('VIN must be 17 characters.');
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        clean,
    )}?format=json`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`NHTSA lookup failed (${res.status}).`);
    const json: any = await res.json();
    const r = json?.Results?.[0];
    if (!r || !r.Make) throw new Error('No vehicle found for that VIN.');
    return {
        year: r.ModelYear || null,
        make: r.Make ? titleCase(r.Make) : null,
        model: r.Model || null,
        trim: r.Trim || null,
        bodyClass: r.BodyClass || null,
        fuelType: r.FuelTypePrimary || null,
    };
}

// ── LAZY MATERIALS PICKER ───────────────────────────────────────────────────

export type MaterialPickerProduct = {
    id: string;
    name: string | null;
    default_unit: string | null;
    serials: { id: string; serial_number: string | null; status: string | null }[];
};

/**
 * Shop-scoped products + their in-stock serials for the materials picker.
 * Loaded lazily (on first "add material" open) so the ticket page's first
 * paint never pays for it.
 */
export async function loadMaterialPickerOptions(slug: string): Promise<MaterialPickerProduct[]> {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    const pub = getSupabasePublicAdmin();
    const { data: productRows } = await pub
        .from('products')
        .select('id, name, default_unit')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('name')
        .limit(500);
    const products = (productRows ?? []) as any[];
    const productIds = products.map((p) => p.id);
    const serialsByProduct = new Map<string, any[]>();
    if (productIds.length > 0) {
        const { data: serials } = await pub
            .from('serial_numbers')
            .select('id, serial_number, status, product_id')
            .in('product_id', productIds)
            .in('status', ['in_stock', 'low_stock', 'split'])
            .limit(2000);
        for (const s of (serials ?? []) as any[]) {
            const arr = serialsByProduct.get(s.product_id) ?? [];
            arr.push({ id: s.id, serial_number: s.serial_number, status: s.status });
            serialsByProduct.set(s.product_id, arr);
        }
    }
    return products
        .map((p) => ({
            id: p.id,
            name: p.name,
            default_unit: p.default_unit,
            serials: serialsByProduct.get(p.id) ?? [],
        }))
        .filter((p) => p.serials.length > 0);
}

// ── EDIT-MODE CUSTOMER / VEHICLE RELINK ─────────────────────────────────────

async function ownedTicket(shopId: number, ticketRowId: string) {
    const pub = getSupabasePublicAdmin();
    const { data } = await pub
        .from('tickets')
        .select('id, customer_id, vehicle_id')
        .eq('id', ticketRowId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (!data) throw new Error('Ticket not found for this shop.');
    return data as any;
}

function bust(slug: string, ticketRowId: string) {
    revalidatePath(`/shop/${slug}/tickets/${ticketRowId}`, 'page');
    revalidatePath(`/shop/${slug}/tickets/${ticketRowId}/work-order`, 'page');
}

export type CustomerDraft = {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
};

/**
 * Link an existing customer (by id) or create a new one, then stamp the ticket's
 * customer_id + mirrored contact fields (customer_name/email/phone).
 */
export async function relinkTicketCustomer(
    slug: string,
    ticketRowId: string,
    customerId: string | null,
    draft?: CustomerDraft,
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    let id = customerId;
    let name: string | null = null;
    let email: string | null = null;
    let phone: string | null = null;

    if (!id && draft) {
        const dName = (draft.name ?? '').trim() || null;
        const dEmail = (draft.email ?? '').trim().toLowerCase() || null;
        const dPhone = (draft.phone ?? '').trim() || null;
        if (!dName && !dEmail && !dPhone) throw new Error('Provide a name, email, or phone.');
        const { data: created, error } = await pub
            .from('customers')
            .insert({
                shop_id: shopId,
                name: dName,
                email: dEmail,
                phone: dPhone,
                company: (draft.company ?? '').trim() || null,
                source: 'dashboard',
                status: 'active',
            })
            .select('id, name, email, phone')
            .maybeSingle();
        if (error) throw new Error(error.message);
        id = (created as any).id;
        name = (created as any).name;
        email = (created as any).email;
        phone = (created as any).phone;
    } else if (id) {
        const { data: c } = await pub
            .from('customers')
            .select('id, name, email, phone, first_name, last_name')
            .eq('id', id)
            .eq('shop_id', shopId)
            .maybeSingle();
        if (!c) throw new Error('Customer not found for this shop.');
        name = (c as any).name || `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim() || null;
        email = (c as any).email ?? null;
        phone = (c as any).phone ?? null;
    } else {
        throw new Error('No customer selected.');
    }

    const { error: upErr } = await pub
        .from('tickets')
        .update({
            customer_id: id,
            customer_name: name,
            email,
            phone,
            updated_at: new Date().toISOString(),
        })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (upErr) throw new Error(upErr.message);

    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Customer linked',
        description: name ? `Linked ${name}` : 'Customer updated',
        internal: true,
        createdBy,
    });
    bust(slug, ticketRowId);
}

export type VehicleDraft = {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    color?: string | null;
    vin?: string | null;
};

/**
 * Link an existing vehicle (by id) or create a new one under the ticket's
 * customer, then stamp vehicle_id + mirrored car_year/make/model/trim/color/vin.
 */
export async function relinkTicketVehicle(
    slug: string,
    ticketRowId: string,
    vehicleId: string | null,
    draft?: VehicleDraft,
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    const ticket = await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    let veh: VehicleHit | null = null;

    if (vehicleId) {
        const { data: v } = await pub
            .from('vehicles')
            .select('id, year, make, model, trim, color, vin')
            .eq('id', vehicleId)
            .eq('shop_id', shopId)
            .maybeSingle();
        if (!v) throw new Error('Vehicle not found for this shop.');
        veh = v as VehicleHit;
    } else if (draft) {
        const yearNum =
            draft.year != null && draft.year !== '' && Number.isFinite(Number(draft.year))
                ? Number(draft.year)
                : null;
        const make = (draft.make ?? '').toString().trim() || null;
        const model = (draft.model ?? '').toString().trim() || null;
        const vin = (draft.vin ?? '').toString().trim().toUpperCase() || null;
        if (!make && !model && !vin) throw new Error('Enter a make, model, or VIN.');
        const { data: created, error } = await pub
            .from('vehicles')
            .insert({
                shop_id: shopId,
                customer_id: ticket.customer_id ?? null,
                year: yearNum,
                make,
                model,
                trim: (draft.trim ?? '').toString().trim() || null,
                color: (draft.color ?? '').toString().trim() || null,
                vin,
            })
            .select('id, year, make, model, trim, color, vin')
            .maybeSingle();
        if (error) throw new Error(error.message);
        veh = created as VehicleHit;
    } else {
        throw new Error('No vehicle selected.');
    }

    const { error: upErr } = await pub
        .from('tickets')
        .update({
            vehicle_id: veh.id,
            car_year: veh.year != null ? String(veh.year) : null,
            car_make: veh.make,
            car_model: veh.model,
            trim: veh.trim,
            color: veh.color,
            vin: veh.vin,
            subject_type: 'vehicle',
            updated_at: new Date().toISOString(),
        })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (upErr) throw new Error(upErr.message);

    const createdBy = await resolveActingWorkerId(profile.email);
    const label = [veh.year, veh.make, veh.model].filter(Boolean).join(' ');
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Vehicle linked',
        description: label ? `Linked ${label}` : 'Vehicle updated',
        internal: true,
        createdBy,
    });
    bust(slug, ticketRowId);
}

/** Set both scheduling dates (service_day + end_date) at once. */
export async function setTicketSchedule(
    slug: string,
    ticketRowId: string,
    serviceDay: string | null,
    endDate: string | null,
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();
    const sd = serviceDay && serviceDay.trim() ? serviceDay : null;
    const ed = endDate && endDate.trim() ? endDate : null;
    const { error } = await pub
        .from('tickets')
        .update({ service_day: sd, end_date: ed, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Rescheduled',
        description: `Service ${sd ?? '—'}${ed ? ` → ${ed}` : ''}`,
        internal: true,
        createdBy,
    });
    bust(slug, ticketRowId);
}
