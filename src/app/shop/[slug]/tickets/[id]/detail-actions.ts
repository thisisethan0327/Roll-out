'use server';
/**
 * Server actions for the deep ticket-detail surface (check-ins, worker
 * assignment, materials, chat, services editing). All re-resolve the shop slug
 * → shop_id and re-check role via requireShopMember; the form-supplied shopId
 * is an untrusted hint. Every public.* read/write filters/stamps shop_id (or
 * scopes through a ticket already proven to belong to the shop).
 *
 * Shared child tables (ticket_checkins/workers/materials/messages/activity)
 * have no shop_id column — they are scoped by their ticket_id, so we ALWAYS
 * load-and-verify the parent ticket belongs to this shop first.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { logTicketActivity } from '@/lib/ticket-activity';
import { resolveActingWorkerId } from '@/lib/staff-bridge';
import {
    mintCheckinUploadPath,
    mintMessageUploadPath,
    ticketMediaPublicUrl,
    assertTicketMediaPath,
    removeTicketMedia,
} from '@/lib/ticket-media';

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

async function guard(slug: string, roles: Set<string>) {
    const shop = await resolveSlug(slug);
    if (!shop) throw new Error('Shop not found.');
    const { profile, role } = await requireShopMember(shop.shopId);
    if (!roles.has(role)) throw new Error('Insufficient role for this action.');
    return { profile, role, shopId: shop.shopId };
}

/** Load a ticket proven to belong to this shop, or throw. */
async function ownedTicket(shopId: number, ticketRowId: string) {
    const pub = getSupabasePublicAdmin();
    const { data } = await pub
        .from('tickets')
        .select('id, ticket_id, services, total_price')
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

// ── CHECK-INS / INSPECTIONS ─────────────────────────────────────────────────

const CHECKIN_TYPES = new Set(['check-in', 'progress', 'check-out']);
const CHECKIN_ACTIVITY: Record<string, string> = {
    'check-in': 'checkin',
    'check-out': 'checkout',
    progress: 'progress',
};

export async function createCheckin(
    slug: string,
    ticketRowId: string,
    fields: {
        type: string;
        notes?: string;
        condition_notes?: string;
        odometer?: string;
        fuel_level?: string;
    },
): Promise<{ checkinId: string }> {
    const { shopId, profile } = await guard(slug, INSTALLER_ROLES);
    const ticket = await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    const type = CHECKIN_TYPES.has(fields.type) ? fields.type : 'check-in';
    const checkedInBy = await resolveActingWorkerId(profile.email);

    const { data, error } = await pub
        .from('ticket_checkins')
        .insert({
            ticket_id: ticketRowId,
            type,
            notes: (fields.notes ?? '').trim() || null,
            condition_notes: (fields.condition_notes ?? '').trim() || null,
            odometer: (fields.odometer ?? '').trim() || null,
            fuel_level: (fields.fuel_level ?? '').trim() || null,
            media: [],
            checked_in_by: checkedInBy,
        })
        .select('id')
        .maybeSingle();
    if (error) throw new Error(error.message);
    const checkinId = (data as any).id;

    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: CHECKIN_ACTIVITY[type] ?? 'checkin',
        title: `${type.replace('-', ' ').toUpperCase()} recorded`,
        description: (fields.condition_notes ?? '').trim() || null,
        createdBy: checkedInBy,
        metadata: { checkin_id: checkinId },
    });

    bust(slug, ticketRowId);
    return { checkinId };
}

export async function mintCheckinPhotoTarget(
    slug: string,
    ticketRowId: string,
    checkinId: string,
): Promise<{ path: string; token: string }> {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();
    // Verify the check-in belongs to this ticket.
    const { data } = await pub
        .from('ticket_checkins')
        .select('id')
        .eq('id', checkinId)
        .eq('ticket_id', ticketRowId)
        .maybeSingle();
    if (!data) throw new Error('Check-in not found for this ticket.');
    return mintCheckinUploadPath(shopId, ticketRowId, checkinId);
}

export async function attachCheckinPhoto(
    slug: string,
    ticketRowId: string,
    checkinId: string,
    path: string,
): Promise<{ url: string }> {
    const { shopId, profile } = await guard(slug, INSTALLER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    assertTicketMediaPath(path, shopId);
    const pub = getSupabasePublicAdmin();

    const { data: row } = await pub
        .from('ticket_checkins')
        .select('id, media')
        .eq('id', checkinId)
        .eq('ticket_id', ticketRowId)
        .maybeSingle();
    if (!row) throw new Error('Check-in not found for this ticket.');

    const url = ticketMediaPublicUrl(path);
    const checkedInBy = await resolveActingWorkerId(profile.email);
    const existing = Array.isArray((row as any).media) ? (row as any).media : [];
    const media = [
        ...existing,
        {
            url,
            path,
            type: 'image',
            caption: '',
            uploaded_by: checkedInBy,
            uploaded_at: new Date().toISOString(),
        },
    ];
    const { error } = await pub
        .from('ticket_checkins')
        .update({ media, updated_at: new Date().toISOString() })
        .eq('id', checkinId)
        .eq('ticket_id', ticketRowId);
    if (error) throw new Error(error.message);

    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'photo_added',
        title: 'Photo added',
        createdBy: checkedInBy,
        metadata: { checkin_id: checkinId },
    });

    bust(slug, ticketRowId);
    return { url };
}

export async function deleteCheckin(
    slug: string,
    ticketRowId: string,
    checkinId: string,
): Promise<void> {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    const { data: row } = await pub
        .from('ticket_checkins')
        .select('id, media')
        .eq('id', checkinId)
        .eq('ticket_id', ticketRowId)
        .maybeSingle();
    if (!row) return;

    const paths = (Array.isArray((row as any).media) ? (row as any).media : [])
        .map((m: any) => m?.path)
        .filter((p: any) => typeof p === 'string' && p.startsWith(`${shopId}/`));
    const { error } = await pub
        .from('ticket_checkins')
        .delete()
        .eq('id', checkinId)
        .eq('ticket_id', ticketRowId);
    if (error) throw new Error(error.message);
    // Only remove objects we own under the shop prefix (never legacy paths).
    await removeTicketMedia(paths);
    bust(slug, ticketRowId);
}

// ── WORKER ASSIGNMENT (delete-all-then-insert) ──────────────────────────────

export async function setTicketWorkers(
    slug: string,
    ticketRowId: string,
    workerIds: string[],
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    // Snapshot previous for the activity delta.
    const { data: prev } = await pub
        .from('ticket_workers')
        .select('worker_id')
        .eq('ticket_id', ticketRowId);
    const prevIds = new Set(
        (prev ?? []).map((r: any) => r.worker_id).filter(Boolean) as string[],
    );

    const unique = Array.from(new Set(workerIds.filter(Boolean)));

    // delete-all-then-insert.
    const { error: delErr } = await pub
        .from('ticket_workers')
        .delete()
        .eq('ticket_id', ticketRowId);
    if (delErr) throw new Error(delErr.message);

    if (unique.length > 0) {
        const rows = unique.map((worker_id) => ({
            ticket_id: ticketRowId,
            worker_id,
            role: 'assigned',
            notes: '',
            assigned_by: `@${profile.handle}`,
        }));
        const { error: insErr } = await pub.from('ticket_workers').insert(rows);
        if (insErr) throw new Error(insErr.message);
    }

    // Name lookup for the log (public.profiles).
    const idsForNames = Array.from(new Set([...prevIds, ...unique]));
    const nameById = new Map<string, string>();
    if (idsForNames.length > 0) {
        const { data: staff } = await pub
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', idsForNames);
        for (const s of (staff ?? []) as any[]) {
            nameById.set(
                s.id,
                `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'STAFF',
            );
        }
    }
    const added = unique.filter((id) => !prevIds.has(id));
    const removed = Array.from(prevIds).filter((id) => !unique.includes(id));
    const createdBy = await resolveActingWorkerId(profile.email);
    const descParts: string[] = [];
    if (added.length) descParts.push(`Assigned ${added.map((i) => nameById.get(i) ?? i).join(', ')}`);
    if (removed.length) descParts.push(`Removed ${removed.map((i) => nameById.get(i) ?? i).join(', ')}`);

    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'worker_assigned',
        title: prevIds.size === 0 ? 'Installers assigned' : 'Installers updated',
        description: descParts.join(' · ') || 'No change',
        internal: true,
        createdBy,
        metadata: {
            added: added.map((i) => ({ id: i, name: nameById.get(i) ?? null })),
            removed: removed.map((i) => ({ id: i, name: nameById.get(i) ?? null })),
        },
    });

    bust(slug, ticketRowId);
}

// ── SERVICES (editable line items in services JSONB) ────────────────────────

export type ServiceLine = { name: string; qty: number; price: number | null };

export async function updateTicketServices(
    slug: string,
    ticketRowId: string,
    items: ServiceLine[],
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    const clean = items
        .map((i) => ({
            name: String(i.name ?? '').trim(),
            qty: Number.isFinite(i.qty) && i.qty > 0 ? Math.round(i.qty) : 1,
            price:
                i.price != null && Number.isFinite(Number(i.price))
                    ? Number(i.price)
                    : null,
        }))
        .filter((i) => i.name.length > 0);

    const hasAnyPrice = clean.some((i) => i.price != null);
    const total = hasAnyPrice
        ? clean.reduce((s, i) => s + (i.price ?? 0) * (i.qty || 1), 0)
        : null;

    const update: Record<string, any> = {
        services: clean,
        updated_at: new Date().toISOString(),
    };
    // Only overwrite total when we can compute one from priced line items.
    if (total != null) update.total_price = total;

    const { error } = await pub
        .from('tickets')
        .update(update)
        .eq('id', ticketRowId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);

    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'service_added',
        title: 'Services updated',
        description: `${clean.length} line item${clean.length === 1 ? '' : 's'}${
            total != null ? ` · $${total.toFixed(2)}` : ''
        }`,
        createdBy,
    });

    bust(slug, ticketRowId);
}

// ── CUSTOMER CHAT + INTERNAL NOTES ──────────────────────────────────────────

export async function sendTicketMessage(
    slug: string,
    ticketRowId: string,
    message: string,
    visibility: 'customer' | 'internal',
): Promise<void> {
    const { shopId, profile } = await guard(slug, INSTALLER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const trimmed = (message ?? '').trim();
    if (!trimmed) return;
    const vis = visibility === 'internal' ? 'internal' : 'customer';
    const pub = getSupabasePublicAdmin();
    const senderId = await resolveActingWorkerId(profile.email);

    const { error } = await pub.from('ticket_messages').insert({
        ticket_id: ticketRowId,
        sender_type: 'staff',
        sender_id: senderId,
        sender_name: profile.displayName || `@${profile.handle}`,
        message: trimmed,
        visibility: vis,
        channel: 'app',
        attachments: [],
    });
    if (error) throw new Error(error.message);
    bust(slug, ticketRowId);
}

export async function mintChatPhotoTarget(
    slug: string,
    ticketRowId: string,
): Promise<{ path: string; token: string }> {
    const { shopId } = await guard(slug, INSTALLER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    return mintMessageUploadPath(shopId, ticketRowId);
}

export async function sendTicketPhotoMessage(
    slug: string,
    ticketRowId: string,
    path: string,
    visibility: 'customer' | 'internal',
): Promise<void> {
    const { shopId, profile } = await guard(slug, INSTALLER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    assertTicketMediaPath(path, shopId);
    const vis = visibility === 'internal' ? 'internal' : 'customer';
    const pub = getSupabasePublicAdmin();
    const senderId = await resolveActingWorkerId(profile.email);
    const url = ticketMediaPublicUrl(path);

    const { error } = await pub.from('ticket_messages').insert({
        ticket_id: ticketRowId,
        sender_type: 'staff',
        sender_id: senderId,
        sender_name: profile.displayName || `@${profile.handle}`,
        message: '',
        visibility: vis,
        channel: 'app',
        attachments: [{ url, path, type: 'image' }],
    });
    if (error) throw new Error(error.message);
    bust(slug, ticketRowId);
}

// ── MATERIALS ───────────────────────────────────────────────────────────────

/**
 * Add a material (serialized inventory unit) to a ticket. Prefers the emwraps
 * RPC `add_material_to_ticket` (atomic validate + insert + stock deduct); falls
 * back to a direct insert if the RPC is absent. The chosen serial must belong
 * to a product in THIS shop (products.shop_id = shopId) — enforced before the
 * write so tenancy holds.
 */
export async function addTicketMaterial(
    slug: string,
    ticketRowId: string,
    serialNumberId: string,
    fields: {
        quantity_used?: number;
        unit?: string;
        applied_area?: string;
        notes?: string;
        warranty_years?: number | null;
    },
): Promise<void> {
    const { shopId, profile } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();

    // Tenancy: serial → product → product.shop_id must equal this shop.
    const { data: serial } = await pub
        .from('serial_numbers')
        .select('id, product:products(id, shop_id, name)')
        .eq('id', serialNumberId)
        .maybeSingle();
    const product = (serial as any)?.product;
    if (!serial || !product || Number(product.shop_id) !== Number(shopId)) {
        throw new Error('Material not available for this shop.');
    }

    const qty = fields.quantity_used && fields.quantity_used > 0 ? fields.quantity_used : 1;
    const unit = (fields.unit ?? '').trim() || 'sqft';
    const appliedArea = (fields.applied_area ?? '').trim() || null;
    const notes = (fields.notes ?? '').trim() || null;
    const warrantyYears =
        fields.warranty_years != null && Number.isFinite(fields.warranty_years)
            ? fields.warranty_years
            : null;

    // Try the atomic RPC first (keeps stock accounting correct in the shared DB).
    const rpc = await pub.rpc('add_material_to_ticket', {
        p_ticket_id: ticketRowId,
        p_serial_number_id: serialNumberId,
        p_quantity_used: qty,
        p_unit: unit,
        p_applied_area: appliedArea,
        p_notes: notes,
        p_warranty_years: warrantyYears,
    });
    if (rpc.error) {
        // Fallback: direct insert (no stock deduct — RPC missing in this env).
        const warrantyExpires =
            warrantyYears != null
                ? new Date(Date.now() + warrantyYears * 365.25 * 86_400_000)
                      .toISOString()
                      .slice(0, 10)
                : null;
        const { error } = await pub.from('ticket_materials').insert({
            ticket_id: ticketRowId,
            serial_number_id: serialNumberId,
            quantity_used: qty,
            unit,
            applied_area: appliedArea,
            application_date: new Date().toISOString(),
            notes,
            warranty_years: warrantyYears,
            warranty_expires: warrantyExpires,
        });
        if (error) throw new Error(error.message);
    }

    const createdBy = await resolveActingWorkerId(profile.email);
    await logTicketActivity(pub, {
        ticketId: ticketRowId,
        type: 'note',
        title: 'Material added',
        description: `${product.name ?? 'Material'} · ${qty} ${unit}`,
        internal: true,
        createdBy,
    });

    bust(slug, ticketRowId);
}

export async function removeTicketMaterial(
    slug: string,
    ticketRowId: string,
    materialId: string,
): Promise<void> {
    const { shopId } = await guard(slug, MANAGER_ROLES);
    await ownedTicket(shopId, ticketRowId);
    const pub = getSupabasePublicAdmin();
    const { error } = await pub
        .from('ticket_materials')
        .delete()
        .eq('id', materialId)
        .eq('ticket_id', ticketRowId);
    if (error) throw new Error(error.message);
    bust(slug, ticketRowId);
}
