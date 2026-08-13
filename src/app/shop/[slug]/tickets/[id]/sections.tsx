/**
 * Streamed detail sections. Each is an async server component that fetches only
 * its own slice of data, so the ticket page can render its core (header,
 * customer, vehicle, services, scheduling) immediately and stream these heavier
 * panels in behind Suspense boundaries. The parent has already proven the
 * ticket belongs to the shop; these scope by ticket_id (+ shop_id where the
 * table carries it).
 */
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { listShopWorkerPool } from '@/lib/staff-bridge';
import { TicketCheckins } from './TicketCheckins';
import { TicketWorkers } from './TicketWorkers';
import { TicketChat } from './TicketChat';
import { TicketMaterials } from './TicketMaterials';

const ACTIVITY_PILL: Record<string, '' | 'gold' | 'neon' | 'warn'> = {
    created: 'gold',
    status_change: 'neon',
    checkin: 'neon',
    checkout: 'neon',
    progress: '',
    worker_assigned: '',
    service_added: 'gold',
    photo_added: '',
    note: '',
};

/** Resolve public.profiles display names for a set of ids. */
async function resolveNames(pub: any, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
    if (unique.length === 0) return map;
    const { data, error } = await pub
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', unique);
    if (error) console.error('[shop/tickets/[id]] resolveNames failed:', error.message);
    for (const s of (data ?? []) as any[]) {
        map.set(s.id, `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'STAFF');
    }
    return map;
}

// ── INSTALLERS ──────────────────────────────────────────────────────────────

export async function WorkersSection({
    slug,
    shopId,
    ticketRowId,
    callerRole,
}: {
    slug: string;
    shopId: number;
    ticketRowId: string;
    callerRole: string;
}) {
    const pub = getSupabasePublicAdmin();
    const [pool, workersRes] = await Promise.all([
        listShopWorkerPool(shopId),
        pub.from('ticket_workers').select('worker_id').eq('ticket_id', ticketRowId),
    ]);
    const assignedIds = ((workersRes.data ?? []) as any[]).map((r) => r.worker_id).filter(Boolean);
    return (
        <TicketWorkers
            slug={slug}
            ticketRowId={ticketRowId}
            pool={pool}
            assignedIds={assignedIds}
            callerRole={callerRole}
        />
    );
}

// ── INSPECTIONS ─────────────────────────────────────────────────────────────

export async function CheckinsSection({
    slug,
    ticketRowId,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    callerRole: string;
}) {
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('ticket_checkins')
        .select('id, type, notes, condition_notes, odometer, fuel_level, media, checked_in_by, created_at')
        .eq('ticket_id', ticketRowId)
        .order('created_at', { ascending: false });
    if (error) console.error('[shop/tickets/[id]] CheckinsSection failed:', error.message);
    const checkins = (data ?? []) as any[];
    const names = await resolveNames(pub, checkins.map((c) => c.checked_in_by));
    const withNames = checkins.map((c) => ({
        ...c,
        worker_name: c.checked_in_by ? names.get(c.checked_in_by) ?? null : null,
    }));
    return (
        <TicketCheckins slug={slug} ticketRowId={ticketRowId} checkins={withNames} callerRole={callerRole} />
    );
}

// ── MATERIALS (picker options lazy-loaded on interaction) ───────────────────

export async function MaterialsSection({
    slug,
    ticketRowId,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    callerRole: string;
}) {
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('ticket_materials')
        .select(
            'id, quantity_used, unit, applied_area, notes, serial_number:serial_numbers(serial_number, product:products(name))',
        )
        .eq('ticket_id', ticketRowId)
        .order('created_at', { ascending: false });
    if (error) console.error('[shop/tickets/[id]] MaterialsSection failed:', error.message);
    const materials = ((data ?? []) as any[]).map((m) => ({
        id: m.id,
        quantity_used: m.quantity_used,
        unit: m.unit,
        applied_area: m.applied_area,
        notes: m.notes,
        product_name: m.serial_number?.product?.name ?? null,
        serial_number: m.serial_number?.serial_number ?? null,
    }));
    return (
        <TicketMaterials slug={slug} ticketRowId={ticketRowId} materials={materials} callerRole={callerRole} />
    );
}

// ── MESSAGES ────────────────────────────────────────────────────────────────

export async function ChatSection({ slug, ticketRowId }: { slug: string; ticketRowId: string }) {
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('ticket_messages')
        .select('id, sender_type, sender_name, message, visibility, attachments, created_at')
        .eq('ticket_id', ticketRowId)
        .order('created_at', { ascending: true });
    if (error) console.error('[shop/tickets/[id]] ChatSection failed:', error.message);
    return <TicketChat slug={slug} ticketRowId={ticketRowId} messages={(data ?? []) as any[]} />;
}

// ── ACTIVITY TIMELINE ───────────────────────────────────────────────────────

export async function ActivitySection({ ticketRowId }: { ticketRowId: string }) {
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('ticket_activity')
        .select('id, type, title, description, created_by, created_at')
        .eq('ticket_id', ticketRowId)
        .neq('type', 'message')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) console.error('[shop/tickets/[id]] ActivitySection failed:', error.message);
    const activity = (data ?? []) as any[];
    const names = await resolveNames(pub, activity.map((a) => a.created_by));

    if (activity.length === 0) {
        return <div className="admin-empty">NO ACTIVITY YET</div>;
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.map((a) => (
                <div
                    key={a.id}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '130px 1fr',
                        gap: 10,
                        fontSize: 12,
                        borderBottom: '1px solid var(--line)',
                        padding: '6px 0',
                    }}
                >
                    <div className="admin-handle">
                        {a.created_at
                            ? new Date(a.created_at).toISOString().slice(0, 16).replace('T', ' ')
                            : '—'}
                    </div>
                    <div>
                        <span className={`admin-pill ${ACTIVITY_PILL[a.type] ?? ''}`} style={{ marginRight: 8 }}>
                            {(a.title ?? a.type ?? '—').toString()}
                        </span>
                        {a.description && <span style={{ color: 'var(--text-2)' }}>{a.description}</span>}
                        {a.created_by && names.get(a.created_by) && (
                            <span className="admin-handle" style={{ marginLeft: 8 }}>
                                {names.get(a.created_by)}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
