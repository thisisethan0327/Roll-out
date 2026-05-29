/**
 * /shop/[slug]/tickets/[id] — single ticket detail.
 *
 * Left column: customer, vehicle, services, pricing, notes.
 * Right column: scheduling controls + read-only metadata.
 * All mutations go through TicketActions.tsx → ../actions.ts.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import {
    StatusSelect,
    PrioritySelect,
    ServiceDayInput,
    AppendNoteForm,
} from './TicketActions';

export const metadata = { title: 'Ticket' };

function statusPillVariant(status: string | null): '' | 'gold' | 'neon' | 'warn' {
    const s = (status ?? '').toLowerCase();
    if (s === 'new') return 'gold';
    if (s === 'in_progress' || s === 'scheduled') return 'neon';
    if (s === 'cancelled' || s === 'awaiting_parts' || s === 'awaiting_payment') return 'warn';
    return '';
}

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

export default async function TicketDetailPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    const t = await loadTicket(shop.shopId, id);
    if (!t) notFound();

    const vehicle = [t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ');
    const services: any = t.services;
    let servicesNode: React.ReactNode;
    if (Array.isArray(services) && services.length > 0) {
        servicesNode = (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                {services.map((s: any, idx: number) => {
                    if (s && typeof s === 'object') {
                        const name = s.name ?? s.notes ?? JSON.stringify(s);
                        const qty = s.qty != null ? ` × ${s.qty}` : '';
                        const price = s.price != null ? ` — $${Number(s.price).toFixed(2)}` : '';
                        return (
                            <li key={idx} style={{ fontFamily: 'var(--font-body)' }}>
                                {String(name)}
                                {qty}
                                {price}
                            </li>
                        );
                    }
                    return <li key={idx}>{String(s)}</li>;
                })}
            </ul>
        );
    } else if (Array.isArray(services) && services.length === 0) {
        servicesNode = <div className="admin-empty">NO SERVICES LISTED</div>;
    } else if (services) {
        servicesNode = (
            <pre
                style={{
                    margin: 0,
                    padding: 10,
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    fontSize: 11,
                    whiteSpace: 'pre-wrap',
                    overflowX: 'auto',
                }}
            >
                {JSON.stringify(services, null, 2)}
            </pre>
        );
    } else {
        servicesNode = <div className="admin-empty">NO SERVICES LISTED</div>;
    }

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
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
                    gap: 20,
                    alignItems: 'start',
                }}
            >
                {/* LEFT: customer/vehicle/services/pricing/notes */}
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
                                        href={`/shop/${slug}/customers/${t.customer_id}`}
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

                    <Section title="SERVICES">{servicesNode}</Section>

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

                {/* RIGHT: scheduling + metadata */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Section title="SERVICE DAY">
                        <ServiceDayInput
                            slug={slug}
                            ticketRowId={t.id}
                            initial={t.service_day ?? null}
                        />
                    </Section>

                    <Section title="STATUS">
                        <StatusSelect
                            slug={slug}
                            ticketRowId={t.id}
                            initial={t.status ?? 'new'}
                        />
                    </Section>

                    <Section title="PRIORITY">
                        <PrioritySelect
                            slug={slug}
                            ticketRowId={t.id}
                            initial={t.priority ?? 'normal'}
                        />
                    </Section>

                    <Section title="SOURCE">
                        <div
                            style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontSize: 12,
                                color: 'var(--text-2)',
                            }}
                        >
                            {t.source ?? '—'}
                        </div>
                    </Section>

                    <Section title="METADATA">
                        <KV
                            label="CREATED"
                            value={new Date(t.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                            mono
                        />
                        <KV
                            label="UPDATED"
                            value={
                                t.updated_at
                                    ? new Date(t.updated_at).toISOString().slice(0, 16).replace('T', ' ')
                                    : '—'
                            }
                            mono
                        />
                        <KV label="ROW ID" value={t.id} mono />
                    </Section>
                </aside>
            </div>
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section
            style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                padding: 16,
            }}
        >
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

function KV({
    label,
    value,
    mono,
}: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
}) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: 10,
                fontSize: 12,
                lineHeight: 1.5,
            }}
        >
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
