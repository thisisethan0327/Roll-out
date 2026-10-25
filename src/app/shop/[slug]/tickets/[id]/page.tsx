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
import { ClipboardList, FileText } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { KVList, Panel, StatusChip, cx, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Ticket' };

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
        <div className={sh.stack}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/tickets`, label: 'All tickets' }}
                title={<span className={sh.codeTitle}>{t.ticket_id ?? '—'}</span>}
                sub={
                    <span className="g-chips" style={{ marginTop: 2 }}>
                        <StatusChip status={t.status} />
                        {t.priority ? <StatusChip status={t.priority === 'rush' ? 'rush' : 'active'} label={t.priority === 'rush' ? 'Rush' : 'Normal priority'} /> : null}
                        {t.customer_name ? <span className="g-chip">{t.customer_name}</span> : null}
                    </span>
                }
                actions={
                    <>
                        <Link href={`/shop/${slug}/tickets/${id}/work-order`} className={cx('g-sec g-sec--ink', sh.sec)}>
                            <ClipboardList size={18} strokeWidth={2} aria-hidden="true" />
                            Work order
                        </Link>
                        <Link href={`/shop/${slug}/tickets/${id}/invoice`} className={cx('g-sec', sh.sec)}>
                            <FileText size={18} strokeWidth={2} aria-hidden="true" />
                            Invoice
                        </Link>
                    </>
                }
            />

            <div className={sh.splitWide}>
                {/* LEFT */}
                <div className={sh.stack}>
                    <Panel id="t-customer" title="Customer">
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
                    </Panel>

                    <Panel id="t-vehicle" title="Vehicle">
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
                    </Panel>

                    <Panel id="t-services" title="Services">
                        <TicketServicesEditor slug={slug} ticketRowId={t.id} initial={t.services} callerRole={role} />
                        <KVList
                            rows={[
                                {
                                    k: 'Total',
                                    v: t.total_price != null ? `$${Number(t.total_price).toFixed(2)}` : '—',
                                    wide: true,
                                },
                            ]}
                        />
                    </Panel>

                    <Panel id="t-notes" title="Notes">
                        {t.notes ? <pre className={sh.pre}>{t.notes}</pre> : <p className={sh.muted} style={{ margin: 0 }}>No notes yet</p>}
                        <AppendNoteForm slug={slug} ticketRowId={t.id} />
                    </Panel>
                </div>

                {/* RIGHT */}
                <aside className={sh.stack}>
                    <Panel id="t-schedule" title="Schedule">
                        <ScheduleEditor
                            slug={slug}
                            ticketRowId={t.id}
                            initialServiceDay={t.service_day ?? null}
                            initialEndDate={t.end_date ?? null}
                        />
                    </Panel>
                    <Panel id="t-status" title="Status and priority">
                        <label className={sh.label} htmlFor="ticket-status">
                            Status
                        </label>
                        <StatusSelect id="ticket-status" slug={slug} ticketRowId={t.id} initial={t.status ?? 'pending'} />
                        <label className={sh.label} htmlFor="ticket-priority">
                            Priority
                        </label>
                        <PrioritySelect id="ticket-priority" slug={slug} ticketRowId={t.id} initial={t.priority ?? 'normal'} />
                    </Panel>
                    <Panel id="t-installers" title="Installers">
                        <Suspense fallback={<SkeletonText lines={3} />}>
                            <WorkersSection slug={slug} shopId={shop.shopId} ticketRowId={t.id} callerRole={role} />
                        </Suspense>
                    </Panel>
                    <Panel id="t-meta" title="Details">
                        <KVList
                            rows={[
                                {
                                    k: 'Created',
                                    v: new Date(t.created_at).toISOString().slice(0, 16).replace('T', ' '),
                                },
                                { k: 'Source', v: t.source ?? '—' },
                                { k: 'Row ID', v: <span style={{ fontSize: 13 }}>{t.id}</span> },
                            ]}
                        />
                    </Panel>
                </aside>
            </div>

            {/* FULL-WIDTH STREAMED SECTIONS */}
            <Panel id="t-inspections" title="Inspections">
                <Suspense fallback={<SkeletonRows rows={2} cols={3} />}>
                    <CheckinsSection slug={slug} ticketRowId={t.id} callerRole={role} />
                </Suspense>
            </Panel>

            <Panel id="t-materials" title="Materials">
                <Suspense fallback={<SkeletonRows rows={2} cols={4} />}>
                    <MaterialsSection slug={slug} ticketRowId={t.id} callerRole={role} />
                </Suspense>
            </Panel>

            <div className={sh.two}>
                <Panel id="t-messages" title="Messages">
                    <Suspense fallback={<SkeletonText lines={4} />}>
                        <ChatSection slug={slug} ticketRowId={t.id} />
                    </Suspense>
                </Panel>

                <Panel id="t-activity" title="Activity">
                    <Suspense fallback={<SkeletonRows rows={4} cols={2} />}>
                        <ActivitySection ticketRowId={t.id} />
                    </Suspense>
                </Panel>
            </div>
        </div>
    );
}
