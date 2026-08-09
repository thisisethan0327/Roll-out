/**
 * /shop/[slug]/tickets/[id] — single ticket detail with full lifecycle depth:
 * customer/vehicle, editable services, scheduling, worker assignment,
 * check-ins/inspections + photos, materials, customer chat + internal notes,
 * and an activity timeline. All mutations go through ./detail-actions.ts and
 * ../actions.ts and are shop-scoped.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { listShopWorkerPool } from '@/lib/staff-bridge';
import {
    StatusSelect,
    PrioritySelect,
    ServiceDayInput,
    AppendNoteForm,
} from './TicketActions';
import { TicketCheckins } from './TicketCheckins';
import { TicketWorkers } from './TicketWorkers';
import { TicketServicesEditor } from './TicketServicesEditor';
import { TicketChat } from './TicketChat';
import { TicketMaterials } from './TicketMaterials';

export const metadata = { title: 'Ticket' };

function statusPillVariant(status: string | null): '' | 'gold' | 'neon' | 'warn' {
    const s = (status ?? '').toLowerCase();
    if (s === 'quote' || s === 'estimate' || s === 'pending') return 'gold';
    if (s === 'in-progress' || s === 'completed') return 'neon';
    if (s === 'cancelled' || s === 'declined') return 'warn';
    return '';
}

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

async function loadTicket(shopId: number, id: string) {
    const pub = getSupabasePublicAdmin();
    const { data } = await pub
        .from('tickets')
        .select('*')
        .eq('id', id)
        .eq('shop_id', shopId)
        .maybeSingle();
    return data as any;
}

/** Load all child data for the ticket detail in parallel. */
async function loadDetail(shopId: number, ticketRowId: string) {
    const pub = getSupabasePublicAdmin();

    const [checkinsRes, workersRes, materialsRes, messagesRes, activityRes, poolRes] =
        await Promise.all([
            pub
                .from('ticket_checkins')
                .select('id, type, notes, condition_notes, odometer, fuel_level, media, checked_in_by, created_at')
                .eq('ticket_id', ticketRowId)
                .order('created_at', { ascending: false }),
            pub
                .from('ticket_workers')
                .select('worker_id')
                .eq('ticket_id', ticketRowId),
            pub
                .from('ticket_materials')
                .select(
                    'id, quantity_used, unit, applied_area, notes, serial_number:serial_numbers(serial_number, product:products(name))',
                )
                .eq('ticket_id', ticketRowId)
                .order('created_at', { ascending: false }),
            pub
                .from('ticket_messages')
                .select('id, sender_type, sender_name, message, visibility, attachments, created_at')
                .eq('ticket_id', ticketRowId)
                .order('created_at', { ascending: true }),
            pub
                .from('ticket_activity')
                .select('id, type, title, description, created_by, created_at')
                .eq('ticket_id', ticketRowId)
                .neq('type', 'message')
                .order('created_at', { ascending: false })
                .limit(50),
            listShopWorkerPool(shopId),
        ]);

    const checkins = (checkinsRes.data ?? []) as any[];
    const activity = (activityRes.data ?? []) as any[];

    // Resolve names for checkin workers + activity authors (public.profiles).
    const nameIds = Array.from(
        new Set(
            [
                ...checkins.map((c) => c.checked_in_by),
                ...activity.map((a) => a.created_by),
            ].filter(Boolean),
        ),
    ) as string[];
    const nameById = new Map<string, string>();
    if (nameIds.length > 0) {
        const { data: staff } = await pub
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', nameIds);
        for (const s of (staff ?? []) as any[]) {
            nameById.set(
                s.id,
                `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'STAFF',
            );
        }
    }

    // Shop-scoped products + their in-stock serials for the materials picker.
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
    const productOptions = products
        .map((p) => ({
            id: p.id,
            name: p.name,
            default_unit: p.default_unit,
            serials: serialsByProduct.get(p.id) ?? [],
        }))
        .filter((p) => p.serials.length > 0);

    return {
        checkins: checkins.map((c) => ({
            ...c,
            worker_name: c.checked_in_by ? nameById.get(c.checked_in_by) ?? null : null,
        })),
        assignedIds: ((workersRes.data ?? []) as any[])
            .map((r) => r.worker_id)
            .filter(Boolean),
        materials: ((materialsRes.data ?? []) as any[]).map((m) => ({
            id: m.id,
            quantity_used: m.quantity_used,
            unit: m.unit,
            applied_area: m.applied_area,
            notes: m.notes,
            product_name: m.serial_number?.product?.name ?? null,
            serial_number: m.serial_number?.serial_number ?? null,
        })),
        messages: (messagesRes.data ?? []) as any[],
        activity: activity.map((a) => ({
            ...a,
            author: a.created_by ? nameById.get(a.created_by) ?? null : null,
        })),
        pool: poolRes,
        productOptions,
    };
}

export default async function TicketDetailPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const t = await loadTicket(shop.shopId, id);
    if (!t) notFound();

    const detail = await loadDetail(shop.shopId, t.id);
    const vehicle = [t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <Link
                        href={`/shop/${slug}/tickets`}
                        className="text-link"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        ‹ ALL TICKETS
                    </Link>
                    <div
                        className="admin-page-title"
                        style={{ fontFamily: 'var(--font-mono, monospace)' }}
                    >
                        {t.ticket_id ?? '—'}
                    </div>
                    <div className="admin-page-sub">
                        <span className={`admin-pill ${statusPillVariant(t.status)}`}>
                            {(t.status ?? '—').toString().toUpperCase()}
                        </span>
                        {t.priority && (
                            <span
                                className={`admin-pill ${t.priority === 'urgent' ? 'warn' : 'neon'}`}
                                style={{ marginLeft: 6 }}
                            >
                                {String(t.priority).toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link
                        href={`/shop/${slug}/tickets/${id}/work-order`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        WORK ORDER
                    </Link>
                    <Link
                        href={`/shop/${slug}/tickets/${id}/invoice`}
                        className="admin-action-btn"
                        style={{ textDecoration: 'none' }}
                    >
                        INVOICE
                    </Link>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
                    gap: 20,
                    alignItems: 'start',
                }}
            >
                {/* LEFT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Section title="CUSTOMER">
                        <KV label="NAME" value={t.customer_name ?? '—'} />
                        <KV label="EMAIL" value={t.email ?? '—'} mono />
                        <KV label="PHONE" value={t.phone ?? '—'} mono />
                        {t.customer_id && (
                            <KV
                                label="CUSTOMER ID"
                                value={
                                    <Link
                                        href={`/shop/${slug}/customers/l-${t.customer_id}`}
                                        className="text-link"
                                        style={{ fontFamily: 'var(--font-mono, monospace)' }}
                                    >
                                        {t.customer_id}
                                    </Link>
                                }
                            />
                        )}
                    </Section>

                    <Section title="VEHICLE">
                        <KV label="YEAR / MAKE / MODEL" value={vehicle || '—'} />
                        <KV label="TRIM" value={t.trim ?? '—'} />
                        <KV label="COLOR" value={t.color ?? '—'} />
                        <KV label="VIN" value={t.vin ?? '—'} mono />
                    </Section>

                    <Section title="SERVICES">
                        <TicketServicesEditor
                            slug={slug}
                            ticketRowId={t.id}
                            initial={t.services}
                            callerRole={role}
                        />
                    </Section>

                    <Section title="PRICING">
                        <KV
                            label="TOTAL"
                            value={
                                t.total_price != null
                                    ? `$${Number(t.total_price).toFixed(2)}`
                                    : '—'
                            }
                            mono
                        />
                    </Section>

                    <Section title="NOTES">
                        {t.notes ? (
                            <pre
                                style={{
                                    margin: 0,
                                    padding: 10,
                                    background: 'var(--bg-2)',
                                    border: '1px solid var(--line)',
                                    fontSize: 12,
                                    lineHeight: 1.55,
                                    whiteSpace: 'pre-wrap',
                                    overflowX: 'auto',
                                    fontFamily: 'var(--font-body)',
                                }}
                            >
                                {t.notes}
                            </pre>
                        ) : (
                            <div className="admin-empty">NO NOTES YET</div>
                        )}
                        <AppendNoteForm slug={slug} ticketRowId={t.id} />
                    </Section>
                </div>

                {/* RIGHT */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Section title="SERVICE DAY">
                        <ServiceDayInput slug={slug} ticketRowId={t.id} initial={t.service_day ?? null} />
                    </Section>
                    <Section title="STATUS">
                        <StatusSelect slug={slug} ticketRowId={t.id} initial={t.status ?? 'pending'} />
                    </Section>
                    <Section title="PRIORITY">
                        <PrioritySelect slug={slug} ticketRowId={t.id} initial={t.priority ?? 'normal'} />
                    </Section>
                    <Section title="INSTALLERS">
                        <TicketWorkers
                            slug={slug}
                            ticketRowId={t.id}
                            pool={detail.pool}
                            assignedIds={detail.assignedIds}
                            callerRole={role}
                        />
                    </Section>
                    <Section title="METADATA">
                        <KV
                            label="CREATED"
                            value={new Date(t.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                            mono
                        />
                        <KV label="SOURCE" value={t.source ?? '—'} mono />
                        <KV label="ROW ID" value={t.id} mono />
                    </Section>
                </aside>
            </div>

            {/* FULL-WIDTH SECTIONS */}
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Section title="INSPECTIONS">
                    <TicketCheckins
                        slug={slug}
                        ticketRowId={t.id}
                        checkins={detail.checkins}
                        callerRole={role}
                    />
                </Section>

                <Section title="MATERIALS">
                    <TicketMaterials
                        slug={slug}
                        ticketRowId={t.id}
                        materials={detail.materials}
                        products={detail.productOptions}
                        callerRole={role}
                    />
                </Section>

                <Section title="MESSAGES">
                    <TicketChat slug={slug} ticketRowId={t.id} messages={detail.messages} />
                </Section>

                <Section title="ACTIVITY TIMELINE">
                    {detail.activity.length === 0 ? (
                        <div className="admin-empty">NO ACTIVITY YET</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {detail.activity.map((a: any) => (
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
                                        <span
                                            className={`admin-pill ${ACTIVITY_PILL[a.type] ?? ''}`}
                                            style={{ marginRight: 8 }}
                                        >
                                            {(a.title ?? a.type ?? '—').toString()}
                                        </span>
                                        {a.description && (
                                            <span style={{ color: 'var(--text-2)' }}>{a.description}</span>
                                        )}
                                        {a.author && (
                                            <span className="admin-handle" style={{ marginLeft: 8 }}>
                                                {a.author}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: 'var(--track-widest)',
                    color: 'var(--text-3)',
                    marginBottom: 10,
                }}
            >
                {title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        </section>
    );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 12, lineHeight: 1.5 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 9,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--text-3)',
                    paddingTop: 2,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    fontFamily: mono ? 'var(--font-mono, monospace)' : 'var(--font-body)',
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </div>
        </div>
    );
}
