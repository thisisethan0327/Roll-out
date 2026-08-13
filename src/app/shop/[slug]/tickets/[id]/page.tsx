/**
 * /shop/[slug]/tickets/[id] — single ticket detail with full lifecycle depth:
 * customer/vehicle (editable), editable services, scheduling, worker assignment,
 * check-ins/inspections + photos, materials, customer chat + internal notes,
 * and an activity timeline.
 *
 * PERF: only the ticket CORE (loadTicket, ~1 indexed round-trip) blocks first
 * paint — header, customer, vehicle, services, pricing, notes, scheduling,
 * status, priority render immediately. The heavy panels (installers/worker
 * pool, inspections, materials, chat, activity) stream in behind <Suspense>
 * via ./sections.tsx so they never hold up the interactive shell. Mutations go
 * through ./detail-actions.ts, ../actions.ts and ../form-actions.ts (shop-scoped).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { Skeleton, SkeletonRows, SkeletonText } from '@/components/feedback';
import {
    StatusSelect,
    PrioritySelect,
    ScheduleEditor,
    AppendNoteForm,
} from './TicketActions';
import { TicketServicesEditor } from './TicketServicesEditor';
import { TicketCustomerEditor } from './TicketCustomerEditor';
import { TicketVehicleEditor } from './TicketVehicleEditor';
import {
    WorkersSection,
    CheckinsSection,
    MaterialsSection,
    ChatSection,
    ActivitySection,
} from './sections';

export const metadata = { title: 'Ticket' };

function statusPillVariant(status: string | null): '' | 'gold' | 'neon' | 'warn' {
    const s = (status ?? '').toLowerCase();
    if (s === 'quote' || s === 'estimate' || s === 'pending') return 'gold';
    if (s === 'in-progress' || s === 'completed') return 'neon';
    if (s === 'cancelled' || s === 'declined') return 'warn';
    return '';
}

async function loadTicket(shopId: number, id: string) {
    const pub = getSupabasePublicAdmin();
    const { data, error } = await pub
        .from('tickets')
        .select('*')
        .eq('id', id)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error) console.error('[shop/tickets/[id]] loadTicket failed:', error.message);
    return data as any;
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
                                className={`admin-pill ${t.priority === 'rush' ? 'warn' : 'neon'}`}
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
                        <TicketCustomerEditor
                            slug={slug}
                            ticketRowId={t.id}
                            callerRole={role}
                            current={{
                                customerId: t.customer_id ?? null,
                                name: t.customer_name ?? null,
                                email: t.email ?? null,
                                phone: t.phone ?? null,
                            }}
                        />
                    </Section>

                    <Section title="VEHICLE">
                        <TicketVehicleEditor
                            slug={slug}
                            ticketRowId={t.id}
                            callerRole={role}
                            customerId={t.customer_id ?? null}
                            current={{
                                vehicleId: t.vehicle_id ?? null,
                                year: t.car_year ?? null,
                                make: t.car_make ?? null,
                                model: t.car_model ?? null,
                                trim: t.trim ?? null,
                                color: t.color ?? null,
                                vin: t.vin ?? null,
                            }}
                        />
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
                    <Section title="SCHEDULE">
                        <ScheduleEditor
                            slug={slug}
                            ticketRowId={t.id}
                            initialServiceDay={t.service_day ?? null}
                            initialEndDate={t.end_date ?? null}
                        />
                    </Section>
                    <Section title="STATUS">
                        <StatusSelect slug={slug} ticketRowId={t.id} initial={t.status ?? 'pending'} />
                    </Section>
                    <Section title="PRIORITY">
                        <PrioritySelect slug={slug} ticketRowId={t.id} initial={t.priority ?? 'normal'} />
                    </Section>
                    <Section title="INSTALLERS">
                        <Suspense fallback={<SkeletonText lines={3} />}>
                            <WorkersSection
                                slug={slug}
                                shopId={shop.shopId}
                                ticketRowId={t.id}
                                callerRole={role}
                            />
                        </Suspense>
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

            {/* FULL-WIDTH STREAMED SECTIONS */}
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Section title="INSPECTIONS">
                    <Suspense fallback={<SkeletonRows rows={2} cols={3} />}>
                        <CheckinsSection slug={slug} ticketRowId={t.id} callerRole={role} />
                    </Suspense>
                </Section>

                <Section title="MATERIALS">
                    <Suspense fallback={<SkeletonRows rows={2} cols={4} />}>
                        <MaterialsSection slug={slug} ticketRowId={t.id} callerRole={role} />
                    </Suspense>
                </Section>

                <Section title="MESSAGES">
                    <Suspense fallback={<SkeletonText lines={4} />}>
                        <ChatSection slug={slug} ticketRowId={t.id} />
                    </Suspense>
                </Section>

                <Section title="ACTIVITY TIMELINE">
                    <Suspense fallback={<SkeletonRows rows={4} cols={2} />}>
                        <ActivitySection ticketRowId={t.id} />
                    </Suspense>
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
