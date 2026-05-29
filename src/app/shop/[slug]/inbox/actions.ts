'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

// EMWRAPS shop_id — gates the SaaS bridge until other tenants opt in.
// TODO: when rollout.shops gets a `tickets_enabled` flag column, gate this on
// that flag instead of shop_id=1 hardcoding.
const EMWRAPS_SHOP_ID = 1;

// Mirrors the SERVICE_LABEL map in inbox/page.tsx — kept inline because the
// page export isn't shareable with this server-action module without an extra
// indirection that would force the page into a 'use client' boundary.
const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'Vinyl Wrap',
    PPF: 'PPF',
    TINT: 'Window Tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts/Install',
    OTHER: 'Other',
};

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) {
        throw new Error('Manager role required.');
    }
    return { profile, role };
}

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

function bustPaths(slug: string) {
    revalidatePath(`/shop/${slug}/inbox`, 'page');
    revalidatePath(`/shop/${slug}/overview`, 'page');
    revalidatePath(`/shop/${slug}/calendar`, 'page');
    revalidatePath(`/shop/${slug}/tickets`, 'page');
}

/**
 * Generate the next `T-####` ticket_id for a shop by scanning the existing
 * pool for the highest numeric tail. Pure-client increment — no race-safe
 * sequence; fine because EMWRAPS staff create tickets one-at-a-time from this
 * UI and from the tickets app.
 */
async function nextTicketId(shopId: number): Promise<string> {
    const publicAdmin = getSupabasePublicAdmin();
    const { data } = await publicAdmin
        .from('tickets')
        .select('ticket_id')
        .eq('shop_id', shopId)
        .like('ticket_id', 'T-%')
        .order('ticket_id', { ascending: false })
        .limit(50); // grab a window — string-sort on 'T-####' isn't reliable for >9999
    const rows = (data as any[]) ?? [];
    let max = 0;
    for (const r of rows) {
        const m = String(r.ticket_id ?? '').match(/^T-(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    }
    const next = max + 1;
    return `T-${String(next).padStart(4, '0')}`;
}

/**
 * Lookup-or-create a public.customers row matching the requester. Tries email
 * first (case-insensitive), then phone, then inserts. Returns the customer row.
 */
async function findOrCreateCustomer(args: {
    email: string | null;
    phone: string | null;
    displayName: string | null;
}): Promise<any> {
    const publicAdmin = getSupabasePublicAdmin();
    const { email, phone, displayName } = args;

    if (email) {
        const { data } = await publicAdmin
            .from('customers')
            .select('*')
            .ilike('email', email)
            .limit(1);
        const hit = ((data as any[]) ?? [])[0];
        if (hit) return hit;
    }

    if (phone) {
        const { data } = await publicAdmin
            .from('customers')
            .select('*')
            .eq('phone', phone)
            .limit(1);
        const hit = ((data as any[]) ?? [])[0];
        if (hit) return hit;
    }

    const name = displayName ?? (email ? email.split('@')[0] : 'Rollout Customer');
    const [first, ...rest] = name.split(' ');
    const last = rest.join(' ').trim() || null;

    const { data: inserted, error } = await publicAdmin
        .from('customers')
        .insert({
            name,
            first_name: first || null,
            last_name: last,
            email: email ?? null,
            phone: phone ?? null,
            source: 'rollout_appointment',
            customer_type: 'retail',
            status: 'active',
        })
        .select('*')
        .single();
    if (error) throw new Error(`customer insert failed: ${error.message}`);
    return inserted;
}

/**
 * SaaS bridge: convert an accepted appointment into a public.tickets row and
 * link the appointment back via `ticket_id`. Marks the appointment 'converted'.
 *
 * Failure isolation: caller wraps this in try/catch. If anything in here
 * throws, the appointment still gets the 'accepted' status from the outer
 * flow — the bridge is a best-effort enhancement on top of the basic accept.
 */
async function bridgeAppointmentToTicket(appointmentId: string, shopId: number): Promise<void> {
    const admin = getSupabaseAdmin();
    const publicAdmin = getSupabasePublicAdmin();

    // 1. Fetch the appointment with joined data we need for the ticket.
    const { data: appt, error: apptErr } = await admin
        .from('appointment_requests')
        .select(
            `id, shop_id, service_type, preferred_at, notes, requester_profile_id, vehicle_id,
             requester:profiles!appointment_requests_requester_profile_id_fkey(auth_user_id, display_name),
             vehicle:vehicles(year, make, model)`,
        )
        .eq('id', appointmentId)
        .single();
    if (apptErr || !appt) throw new Error(`appointment fetch failed: ${apptErr?.message ?? 'not found'}`);
    const a = appt as any;

    // 2. Pull the auth.users record for email + phone.
    let authEmail: string | null = null;
    let authPhone: string | null = null;
    const authUserId = a.requester?.auth_user_id;
    if (authUserId) {
        const { data: userRes, error: userErr } = await (admin as any).auth.admin.getUserById(authUserId);
        if (userErr) throw new Error(`auth lookup failed: ${userErr.message}`);
        authEmail = userRes?.user?.email ?? null;
        authPhone = userRes?.user?.phone ?? null;
        if (authPhone && !authPhone.startsWith('+')) authPhone = `+${authPhone}`;
    }

    // 3. Find or create the matching public.customers row.
    const customer = await findOrCreateCustomer({
        email: authEmail,
        phone: authPhone,
        displayName: a.requester?.display_name ?? null,
    });

    // 4. Build a fresh ticket_id.
    const ticketId = await nextTicketId(shopId);

    // 5. Derive service_day from preferred_at (YYYY-MM-DD) if parseable.
    let serviceDay: string | null = null;
    if (a.preferred_at) {
        const d = new Date(a.preferred_at);
        if (!Number.isNaN(d.getTime())) serviceDay = d.toISOString().slice(0, 10);
    }

    const serviceLabel = SERVICE_LABEL[a.service_type] ?? a.service_type ?? 'Service';

    // 6. Insert the new tickets row.
    const { data: newTicket, error: ticketErr } = await publicAdmin
        .from('tickets')
        .insert({
            ticket_id: ticketId,
            customer_id: customer.id,
            shop_id: shopId,
            customer_name: customer.name,
            email: customer.email,
            phone: customer.phone,
            car_year: a.vehicle?.year ?? null,
            car_make: a.vehicle?.make ?? null,
            car_model: a.vehicle?.model ?? null,
            services: [{ name: serviceLabel, price: null }],
            status: 'scheduled',
            service_day: serviceDay,
            notes: a.notes ?? null,
            total_price: null,
            source: 'rollout',
        })
        .select('id')
        .single();
    if (ticketErr || !newTicket) throw new Error(`ticket insert failed: ${ticketErr?.message}`);

    // 7. Link the appointment back and mark converted.
    const { error: linkErr } = await admin
        .from('appointment_requests')
        .update({
            ticket_id: (newTicket as any).id,
            status: 'converted',
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (linkErr) throw new Error(`appointment link failed: ${linkErr.message}`);
}

export async function acceptAppointment(appointmentId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('appointment_requests')
        .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    // EMWRAPS-only SaaS bridge: spin the accepted appointment into a real
    // public.tickets row so it flows into the ticketing app. Best-effort — if
    // anything fails, the appointment is still accepted and surfaceable in the
    // inbox; staff can retry by re-running the action.
    // TODO: when rollout.shops gets a `tickets_enabled` flag column, gate this
    // on that flag instead of shop_id=1 hardcoding.
    if (shopId === EMWRAPS_SHOP_ID) {
        try {
            await bridgeAppointmentToTicket(appointmentId, shopId);
        } catch (e) {
            console.warn('[inbox] SaaS bridge failed; appointment remains accepted:', e);
        }
    }

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}

export async function declineAppointment(
    appointmentId: string,
    shopId: number,
    reason: string,
) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('appointment_requests')
        .update({
            status: 'declined',
            declined_at: new Date().toISOString(),
            decline_reason: reason || null,
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}

/**
 * Manager+ accepts a customer-requested time change. The row already has the
 * new preferred_at — we just flip the status back to 'accepted' and clear the
 * previous_preferred_at stash. Then fire-and-forget a customer email so they
 * know it's confirmed.
 */
export async function acceptReschedule(appointmentId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('appointment_requests')
        .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            previous_preferred_at: null,
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    notifyCustomerReschedule(appointmentId, shopId, 'accepted').catch((e) =>
        console.warn('[inbox] notify customer reschedule accept failed:', e),
    );

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}

/**
 * Manager+ declines a customer-requested time change. Rolls preferred_at back
 * to the stashed previous_preferred_at and flips status back to 'accepted'.
 */
export async function declineReschedule(appointmentId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();

    // Fetch the prior time so we can restore it.
    const { data: appt, error: fetchErr } = await admin
        .from('appointment_requests')
        .select('id, previous_preferred_at, preferred_at, status')
        .eq('id', appointmentId)
        .eq('shop_id', shopId)
        .single();
    if (fetchErr || !appt) {
        throw new Error(fetchErr?.message ?? 'appointment not found');
    }
    const prior = (appt as any).previous_preferred_at as string | null;
    const requested = (appt as any).preferred_at as string | null;

    const { error } = await admin
        .from('appointment_requests')
        .update({
            status: 'accepted',
            preferred_at: prior,
            previous_preferred_at: null,
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    notifyCustomerReschedule(appointmentId, shopId, 'declined', {
        requested,
        restored: prior,
    }).catch((e) => console.warn('[inbox] notify customer reschedule decline failed:', e));

    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}

/**
 * Fire-and-forget customer email after a reschedule decision. Uses the generic
 * shop_message template so we don't have to land a new template for v1.
 * Mirrors the mobile-side pattern in src/data/appointments.ts.
 */
async function notifyCustomerReschedule(
    appointmentId: string,
    shopId: number,
    outcome: 'accepted' | 'declined',
    times?: { requested: string | null; restored: string | null },
): Promise<void> {
    const admin = getSupabaseAdmin();
    const { data: appt } = await admin
        .from('appointment_requests')
        .select(
            'shop_id, service_type, preferred_at, requester_profile_id, requester:profiles!appointment_requests_requester_profile_id_fkey(display_name)',
        )
        .eq('id', appointmentId)
        .maybeSingle();
    if (!appt) return;

    const a = appt as any;
    const customerName = a.requester?.display_name ?? 'there';
    const service = SERVICE_LABEL[a.service_type] ?? a.service_type ?? 'Service';

    const subject =
        outcome === 'accepted'
            ? `Your new time is confirmed`
            : `Sticking with your original time`;
    const title =
        outcome === 'accepted'
            ? 'New time confirmed.'
            : 'Reschedule declined.';
    const message =
        outcome === 'accepted'
            ? `your ${service} appointment is now set for ${a.preferred_at ?? 'the requested time'}.`
            : `the shop couldn't move your ${service} appointment to ${times?.requested ?? 'the requested time'}. The original time (${times?.restored ?? 'the previous time'}) still stands.`;

    await admin.functions.invoke('send-shop-notification', {
        body: {
            shop_id: shopId,
            template: 'shop_message',
            to_profile_id: a.requester_profile_id,
            linked_appointment_id: appointmentId,
            subject_override: subject,
            vars: {
                subject,
                customer_name: customerName,
                title,
                message,
            },
        },
    });
}

export async function convertAppointmentToTicket(appointmentId: string, shopId: number) {
    await requireManager(shopId);
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('appointment_requests')
        .update({
            status: 'converted',
            ticket_id: null,
        })
        .eq('id', appointmentId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const slug = await fetchSlug(shopId);
    if (slug) bustPaths(slug);
}
