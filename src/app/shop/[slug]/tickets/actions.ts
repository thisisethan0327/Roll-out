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
    const { profile, shopId } = await guardInstaller(slug);
    const pub = getSupabasePublicAdmin();
    const { data: before } = await pub
        .from('tickets')
        .select('status')
        .eq('id', ticketRowId)
        .eq('shop_id', shopId)
        .maybeSingle();
    const { error } = await pub
        .from('tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'status_change',
        title: 'Status changed',
        description: `${((before as any)?.status ?? '—').toString().toUpperCase()} → ${status.toUpperCase()}`,
        createdBy,
        metadata: { from: (before as any)?.status ?? null, to: status },
    });
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

    // Generate next ticket_id by scanning existing T-#### for this shop.
    const { data: existing } = await pub
        .from('tickets')
        .select('ticket_id')
        .eq('shop_id', shopId)
        .like('ticket_id', 'T-%')
        .order('ticket_id', { ascending: false })
        .limit(50);
    let next = 1;
    const used = new Set<number>();
    for (const r of (existing ?? []) as any[]) {
        const m = /^T-(\d+)$/.exec(r.ticket_id ?? '');
        if (m) used.add(Number(m[1]));
    }
    while (used.has(next)) next++;
    const ticketId = `T-${String(next).padStart(4, '0')}`;

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
        status: 'new',
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
