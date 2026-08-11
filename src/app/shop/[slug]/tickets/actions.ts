'use server';
/**
 * Server actions for the shop tickets surface.
 *
 * All mutations re-resolve the shop slug → shop_id via the admin client and
 * re-check `requireShopMember` (with role hierarchy) — form-submitted shopId
 * is treated as untrusted hint only.
 *
 * `public.tickets` is queried via the public-schema admin client; the rollout
 * tenant filter is `shop_id`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { logTicketActivity } from '@/lib/ticket-activity';
import { resolveActingWorkerId } from '@/lib/staff-bridge';
import {
    serializeServices,
    totalFromPersisted,
    type ServiceLine,
} from '@/lib/ticket-services';

const ALLOWED_STATUS = new Set([
    'quote',
    'estimate',
    'pending',
    'in-progress',
    'completed',
    'declined',
    'cancelled',
]);

const INSTALLER_ROLES = new Set(['owner', 'admin', 'manager', 'installer']);
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function resolveSlug(slug: string): Promise<{ shopId: number; name: string } | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shops')
        .select('id, name')
        .eq('slug', slug)
        .maybeSingle();
    if (!data) return null;
    return { shopId: (data as any).id, name: (data as any).name };
}

async function guardInstaller(slug: string) {
    const shop = await resolveSlug(slug);
    if (!shop) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shop.shopId);
    if (!INSTALLER_ROLES.has(role)) throw new Error('Installer role required.');
    return { profile, role, shopId: shop.shopId };
}

async function guardManager(slug: string) {
    const shop = await resolveSlug(slug);
    if (!shop) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shop.shopId);
    if (!MANAGER_ROLES.has(role)) throw new Error('Manager role required.');
    return { profile, role, shopId: shop.shopId };
}

function bustPaths(slug: string, ticketId?: string) {
    revalidatePath(`/shop/${slug}/tickets`, 'page');
    revalidatePath(`/shop/${slug}/overview`, 'page');
    if (ticketId) revalidatePath(`/shop/${slug}/tickets/${ticketId}`, 'page');
}

export async function setStatus(slug: string, ticketRowId: string, status: string) {
    const { shopId } = await guardInstaller(slug);
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    // NOTE: the DB trigger `trg_ticket_status_change` already writes a
    // ticket_activity row on status change — do not double-log here.
    bustPaths(slug, ticketRowId);
}

export async function setServiceDay(slug: string, ticketRowId: string, dateString: string) {
    const { profile, shopId } = await guardManager(slug);
    const pub = getSupabasePublicAdmin();
    const value = dateString && dateString.trim() ? dateString : null;
    const { error } = await pub
        .from('tickets')
        .update({ service_day: value, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Service day set',
        description: value ? `Scheduled ${value}` : 'Service day cleared',
        internal: true,
        createdBy,
    });
    bustPaths(slug, ticketRowId);
}

export async function setPriority(slug: string, ticketRowId: string, priority: string) {
    const { profile, shopId } = await guardManager(slug);
    const pub = getSupabasePublicAdmin();
    // Treat 'normal' as null in case priority column is nullable; harmless if it isn't.
    const value = priority === 'normal' ? null : priority;
    const { error } = await pub
        .from('tickets')
        .update({ priority: value, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Priority changed',
        description: `Priority → ${(value ?? 'normal').toUpperCase()}`,
        internal: true,
        createdBy,
    });
    bustPaths(slug, ticketRowId);
}

export async function appendNote(slug: string, ticketRowId: string, text: string) {
    const { profile, shopId } = await guardInstaller(slug);
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;
    const pub = getSupabasePublicAdmin();
    const { data: row, error: readErr } = await pub
        .from('tickets')
        .select('notes')
        .eq('id', ticketRowId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const header = `[${stamp}] @${profile.handle}`;
    const existing = ((row as any)?.notes ?? '').toString();
    const combined = existing
        ? `${existing}\n\n${header}\n${trimmed}`
        : `${header}\n${trimmed}`;
    const { error } = await pub
        .from('tickets')
        .update({ notes: combined, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Note added',
        description: trimmed.slice(0, 140),
        internal: true,
        createdBy,
    });
    bustPaths(slug, ticketRowId);
}

/** Generate the next free T-#### ticket_id for a shop. */
async function nextTicketId(pub: any, shopId: number): Promise<string> {
    const { data: existing } = await pub
        .from('tickets')
        .select('ticket_id')
        .eq('shop_id', shopId)
        .like('ticket_id', 'T-%')
        .order('ticket_id', { ascending: false })
        .limit(100);
    let next = 1;
    const used = new Set<number>();
    for (const r of (existing ?? []) as any[]) {
        const m = /^T-(\d+)$/.exec(r.ticket_id ?? '');
        if (m) used.add(Number(m[1]));
    }
    while (used.has(next)) next++;
    return `T-${String(next).padStart(4, '0')}`;
}

export async function createTicket(slug: string, formData: FormData) {
    const { profile, shopId } = await guardManager(slug);
    const pub = getSupabasePublicAdmin();

    const customerName = (formData.get('customer_name') as string | null)?.trim() ?? '';
    const email = (formData.get('email') as string | null)?.trim() || null;
    const phone = (formData.get('phone') as string | null)?.trim() || null;
    const carYearRaw = (formData.get('car_year') as string | null)?.trim() || '';
    const carYear = carYearRaw ? Number(carYearRaw) : null;
    const carMake = (formData.get('car_make') as string | null)?.trim() || null;
    const carModel = (formData.get('car_model') as string | null)?.trim() || null;
    const servicesText = (formData.get('services_text') as string | null)?.trim() ?? '';
    const priorityRaw = (formData.get('priority') as string | null)?.trim() || 'normal';
    const notes = (formData.get('notes') as string | null)?.trim() || null;

    if (!customerName) throw new Error('Customer name is required.');

    const ticketId = await nextTicketId(pub, shopId);

    const services = servicesText ? [{ notes: servicesText }] : [];

    const insertPayload: Record<string, any> = {
        ticket_id: ticketId,
        shop_id: shopId,
        customer_name: customerName,
        email,
        phone,
        car_year: carYear,
        car_make: carMake,
        car_model: carModel,
        services,
        notes,
        status: 'pending',
        priority: priorityRaw === 'normal' ? null : priorityRaw,
        source: 'manual',
    };

    const { data: inserted, error } = await pub
        .from('tickets')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();
    if (error) throw new Error(error.message);

    bustPaths(slug);
    const newRowId = (inserted as any)?.id;
    if (newRowId) {
        const createdBy = await resolveActingWorkerId(profile.email);
        await logTicketActivity(pub, {
            ticketId: newRowId,
            type: 'created',
            title: 'Ticket created',
            description: `${ticketId} · ${customerName}`,
            createdBy,
        });
        redirect(`/shop/${slug}/tickets/${newRowId}`);
    }
    redirect(`/shop/${slug}/tickets`);
}

// ── STRUCTURED CREATE (customer + vehicle + catalog services) ────────────────

export type NewTicketPayload = {
    customer: {
        customerId: string | null;
        name: string;
        email: string;
        phone: string;
        company: string;
    };
    vehicle: {
        vehicleId: string | null;
        year: string;
        make: string;
        model: string;
        trim: string;
        color: string;
        vin: string;
    } | null;
    services: ServiceLine[];
    serviceDay: string | null;
    endDate: string | null;
    status: string;
    priority: string;
    notes: string | null;
};

/**
 * Resolve the customer for a new ticket: use the linked id (verified in-shop),
 * else match an existing shop customer by email/phone, else create one. Always
 * stamps shop_id + source 'dashboard'. Returns id + mirrored contact fields.
 */
async function resolveCustomer(
    pub: any,
    shopId: number,
    c: NewTicketPayload['customer'],
): Promise<{ id: string | null; name: string | null; email: string | null; phone: string | null }> {
    const name = (c.name ?? '').trim() || null;
    const email = (c.email ?? '').trim().toLowerCase() || null;
    const phone = (c.phone ?? '').trim() || null;
    const company = (c.company ?? '').trim() || null;

    if (c.customerId) {
        const { data } = await pub
            .from('customers')
            .select('id, name, email, phone, first_name, last_name')
            .eq('id', c.customerId)
            .eq('shop_id', shopId)
            .maybeSingle();
        if (data) {
            return {
                id: (data as any).id,
                name:
                    (data as any).name ||
                    `${(data as any).first_name ?? ''} ${(data as any).last_name ?? ''}`.trim() ||
                    null,
                email: (data as any).email ?? null,
                phone: (data as any).phone ?? null,
            };
        }
    }

    // No usable link — try to match an existing shop customer, else create.
    if (email || phone) {
        let match: any = null;
        if (email) {
            const { data } = await pub
                .from('customers')
                .select('id, name, email, phone')
                .eq('shop_id', shopId)
                .ilike('email', email)
                .limit(1);
            match = (data ?? [])[0] ?? null;
        }
        if (!match && phone) {
            const { data } = await pub
                .from('customers')
                .select('id, name, email, phone')
                .eq('shop_id', shopId)
                .eq('phone', phone)
                .limit(1);
            match = (data ?? [])[0] ?? null;
        }
        if (match) {
            return { id: match.id, name: match.name ?? name, email: match.email ?? email, phone: match.phone ?? phone };
        }
    }

    if (!name && !email && !phone) return { id: null, name: null, email: null, phone: null };

    const { data: created, error } = await pub
        .from('customers')
        .insert({ shop_id: shopId, name, email, phone, company, source: 'dashboard', status: 'active' })
        .select('id, name, email, phone')
        .maybeSingle();
    if (error) throw new Error(error.message);
    return {
        id: (created as any).id,
        name: (created as any).name,
        email: (created as any).email,
        phone: (created as any).phone,
    };
}

/**
 * Resolve the vehicle for a new ticket: linked id (verified in-shop), else
 * dedupe by VIN / customer+make+model within the shop, else create. Stamps
 * shop_id + customer_id. Returns the mirrored car_* fields.
 */
async function resolveVehicle(
    pub: any,
    shopId: number,
    customerId: string | null,
    v: NonNullable<NewTicketPayload['vehicle']>,
): Promise<{ id: string | null; year: string | null; make: string | null; model: string | null; trim: string | null; color: string | null; vin: string | null }> {
    const year = (v.year ?? '').toString().trim();
    const make = (v.make ?? '').trim() || null;
    const model = (v.model ?? '').trim() || null;
    const trim = (v.trim ?? '').trim() || null;
    const color = (v.color ?? '').trim() || null;
    const vin = (v.vin ?? '').trim().toUpperCase() || null;
    const yearNum = year && Number.isFinite(Number(year)) ? Number(year) : null;

    const mirror = (row: any) => ({
        id: row.id,
        year: row.year != null ? String(row.year) : null,
        make: row.make ?? null,
        model: row.model ?? null,
        trim: row.trim ?? null,
        color: row.color ?? null,
        vin: row.vin ?? null,
    });

    if (v.vehicleId) {
        const { data } = await pub
            .from('vehicles')
            .select('id, year, make, model, trim, color, vin')
            .eq('id', v.vehicleId)
            .eq('shop_id', shopId)
            .maybeSingle();
        if (data) return mirror(data);
    }

    if (!make && !model && !vin) {
        return { id: null, year: yearNum != null ? String(yearNum) : null, make, model, trim, color, vin };
    }

    // Dedupe within shop (+ customer): prefer VIN, then customer+make+model.
    if (vin) {
        const { data } = await pub
            .from('vehicles')
            .select('id, year, make, model, trim, color, vin')
            .eq('shop_id', shopId)
            .ilike('vin', vin)
            .limit(1);
        if ((data ?? [])[0]) return mirror((data as any)[0]);
    }
    if (customerId && (make || model)) {
        let q = pub
            .from('vehicles')
            .select('id, year, make, model, trim, color, vin')
            .eq('shop_id', shopId)
            .eq('customer_id', customerId);
        if (make) q = q.ilike('make', make);
        if (model) q = q.ilike('model', model);
        const { data } = await q.limit(1);
        if ((data ?? [])[0]) return mirror((data as any)[0]);
    }

    const { data: created, error } = await pub
        .from('vehicles')
        .insert({ shop_id: shopId, customer_id: customerId, year: yearNum, make, model, trim, color, vin })
        .select('id, year, make, model, trim, color, vin')
        .maybeSingle();
    if (error) throw new Error(error.message);
    return mirror(created);
}

export async function createTicketStructured(
    slug: string,
    payload: NewTicketPayload,
): Promise<void> {
    const { profile, shopId } = await guardManager(slug);
    const pub = getSupabasePublicAdmin();

    const cust = await resolveCustomer(pub, shopId, payload.customer);
    const customerName = (cust.name ?? (payload.customer.name ?? '').trim() ?? '') || '';
    if (!customerName && !cust.id) throw new Error('A customer name (or an existing customer) is required.');

    let veh: Awaited<ReturnType<typeof resolveVehicle>> | null = null;
    if (payload.vehicle) {
        veh = await resolveVehicle(pub, shopId, cust.id, payload.vehicle);
    }

    const persisted = serializeServices(payload.services ?? []);
    const total = totalFromPersisted(persisted);

    const status = ALLOWED_STATUS.has(payload.status) ? payload.status : 'pending';
    const priority = payload.priority === 'rush' ? 'rush' : null;

    const ticketId = await nextTicketId(pub, shopId);

    const insertPayload: Record<string, any> = {
        ticket_id: ticketId,
        shop_id: shopId,
        customer_id: cust.id,
        vehicle_id: veh?.id ?? null,
        customer_name: customerName || cust.name || null,
        email: cust.email,
        phone: cust.phone,
        car_year: veh?.year ?? null,
        car_make: veh?.make ?? null,
        car_model: veh?.model ?? null,
        trim: veh?.trim ?? null,
        color: veh?.color ?? null,
        vin: veh?.vin ?? null,
        subject_type: veh?.id || veh?.make || veh?.model ? 'vehicle' : null,
        services: persisted,
        total_price: total,
        service_day: payload.serviceDay && payload.serviceDay.trim() ? payload.serviceDay : null,
        end_date: payload.endDate && payload.endDate.trim() ? payload.endDate : null,
        notes: (payload.notes ?? '').trim() || null,
        status,
        priority,
        source: 'dashboard',
    };

    const { data: inserted, error } = await pub
        .from('tickets')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();
    if (error) throw new Error(error.message);

    const newRowId = (inserted as any)?.id;
    bustPaths(slug, newRowId);
    if (newRowId) {
        const createdBy = await resolveActingWorkerId(profile.email);
        await logTicketActivity(pub, {
            ticketId: newRowId,
            type: 'created',
            title: 'Ticket created',
            description: `${ticketId} · ${customerName || 'customer'}${
                total != null ? ` · $${total.toFixed(2)}` : ''
            }`,
            createdBy,
        });
        redirect(`/shop/${slug}/tickets/${newRowId}`);
    }
    redirect(`/shop/${slug}/tickets`);
}
