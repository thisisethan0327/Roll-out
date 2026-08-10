/**
 * /shop/[slug]/orders/[id] — a single vendor-scoped order with staff actions.
 *
 * getVendorOrder returns null both when the id is unknown AND when the order
 * belongs to another vendor, so a foreign / forged id renders Next's 404 and
 * never leaks whether it exists. Actions (fulfill+tracking, capture, cancel,
 * mark delivered) are manager-gated in the sidebar/route and re-verified
 * server-side in medusa-admin.ts before touching Medusa.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { getVendorOrder } from '@/lib/medusa-admin';
import { fmtMoney, fmtDate, maskEmail, StatusChip } from '../ui';
import { OrderActions } from './OrderActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

const SECTION: React.CSSProperties = {
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    padding: 16,
};
const SECTION_TITLE: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    letterSpacing: 'var(--track-widest)',
    color: 'var(--text-3)',
    marginBottom: 12,
};

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { role } = await requireShopMemberBySlug(slug);

    const resolved = await getShopVendorBySlug(slug);
    if (!resolved) notFound();

    const o = await getVendorOrder(resolved.vendorKey, id);
    if (!o) notFound();

    const cur = o.currency_code;
    const canManage = MANAGER_ROLES.has(role);
    const addr = o.shipping_address;
    const addrLines = addr
        ? [
              [addr.first_name, addr.last_name].filter(Boolean).join(' '),
              addr.company,
              addr.address_1,
              addr.address_2,
              [addr.city, addr.province, addr.postal_code].filter(Boolean).join(', '),
              addr.country_code ? addr.country_code.toUpperCase() : '',
              addr.phone,
          ].filter((l) => l && l.trim())
        : [];

    const tracking = o.fulfillments
        .filter((f) => !f.canceled_at)
        .flatMap((f) => f.trackingNumbers);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
                <Link
                    href={`/shop/${slug}/orders`}
                    className="text-link"
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        textDecoration: 'none',
                        color: 'var(--text-2)',
                    }}
                >
                    ‹ ALL ORDERS
                </Link>
                <div className="admin-page-head" style={{ marginTop: 8 }}>
                    <div>
                        <div
                            className="admin-page-title"
                            style={{ fontFamily: 'var(--font-mono, monospace)' }}
                        >
                            #{o.display_id ?? o.id.slice(-8)}
                        </div>
                        <div className="admin-page-sub">
                            {fmtDate(o.created_at)} · {maskEmail(o.email)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {o.payment_status && <StatusChip status={o.payment_status} />}
                        {o.status === 'canceled' ? (
                            <StatusChip status="canceled" />
                        ) : (
                            o.fulfillment_status && <StatusChip status={o.fulfillment_status} />
                        )}
                    </div>
                </div>
            </div>

            {/* ACTIONS */}
            {canManage ? (
                <OrderActions
                    slug={slug}
                    orderId={o.id}
                    status={o.status}
                    paymentStatus={o.payment_status}
                    fulfillmentStatus={o.fulfillment_status}
                    hasAuthorizedPayment={o.hasAuthorizedPayment}
                    hasUnfulfilledItems={o.hasUnfulfilledItems}
                />
            ) : (
                <div
                    style={{
                        border: '1px solid var(--line)',
                        background: 'var(--bg-2)',
                        padding: '10px 12px',
                        fontSize: 12,
                        color: 'var(--text-2)',
                    }}
                >
                    Viewing only — order actions require a manager role.
                </div>
            )}

            {/* ITEMS + TOTALS */}
            <section style={SECTION}>
                <div style={SECTION_TITLE}>ITEMS ({o.items.length})</div>
                {o.items.length === 0 ? (
                    <div className="admin-empty">NO ITEMS</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {o.items.map((it) => (
                            <div
                                key={it.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    borderTop: '1px solid var(--line)',
                                    paddingTop: 8,
                                }}
                            >
                                {it.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={it.thumbnail}
                                        alt=""
                                        style={{ width: 44, height: 44, objectFit: 'cover', border: '1px solid var(--line)' }}
                                    />
                                ) : (
                                    <div style={{ width: 44, height: 44, background: 'var(--bg-2)', border: '1px solid var(--line)' }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{it.title ?? 'Item'}</div>
                                    <div className="admin-handle" style={{ fontSize: 11 }}>
                                        Qty {it.quantity ?? 1}
                                        {it.fulfilledQuantity > 0 ? ` · ${it.fulfilledQuantity} fulfilled` : ''}
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-2)' }}>
                                    {fmtMoney(it.unit_price, cur)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line-mid)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <TotalRow label="SUBTOTAL" value={fmtMoney(o.item_subtotal, cur)} />
                    {o.discount_total ? <TotalRow label="DISCOUNT" value={`- ${fmtMoney(o.discount_total, cur)}`} /> : null}
                    <TotalRow label="SHIPPING" value={fmtMoney(o.shipping_total, cur)} />
                    {o.tax_total ? <TotalRow label="TAX" value={fmtMoney(o.tax_total, cur)} /> : null}
                    <TotalRow label="TOTAL" value={fmtMoney(o.total, cur)} strong />
                </div>
            </section>

            {/* SHIPPING + PAYMENT */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <section style={SECTION}>
                    <div style={SECTION_TITLE}>SHIPPING</div>
                    {addrLines.length > 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                            {addrLines.map((line, i) => (
                                <div key={i}>{line}</div>
                            ))}
                        </div>
                    ) : (
                        <div className="admin-handle" style={{ fontSize: 12 }}>No shipping address on file.</div>
                    )}
                    {o.shipping_method && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span className="admin-handle">{o.shipping_method.name ?? 'Shipping'}</span>
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                                {fmtMoney(o.shipping_method.amount, cur)}
                            </span>
                        </div>
                    )}
                    {tracking.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                            <div style={{ ...SECTION_TITLE, marginBottom: 8 }}>TRACKING</div>
                            {tracking.map((t, i) => (
                                <div key={i} style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {t.url ? (
                                        <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-link" style={{ color: 'var(--gold)' }}>
                                            {t.number ?? 'Track shipment'}
                                        </a>
                                    ) : (
                                        <span style={{ color: 'var(--text)' }}>{t.number}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section style={SECTION}>
                    <div style={SECTION_TITLE}>PAYMENT</div>
                    {o.payments.length === 0 ? (
                        <div className="admin-handle" style={{ fontSize: 12 }}>No payment details available.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {o.payments.map((p) => (
                                <div key={p.id} style={{ fontSize: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span className="admin-handle">
                                            {p.captured_at ? 'Captured' : p.canceled_at ? 'Canceled' : 'Authorized'}
                                        </span>
                                        <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                                            {fmtMoney(p.amount, cur)}
                                        </span>
                                    </div>
                                    <div className="admin-handle" style={{ fontSize: 11, marginTop: 2 }}>
                                        {p.captured_at
                                            ? `Charged ${fmtDate(p.captured_at)}`
                                            : p.canceled_at
                                                ? `Canceled ${fmtDate(p.canceled_at)}`
                                                : 'Authorized — capture when the order ships'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: strong ? 11 : 10,
                    letterSpacing: 'var(--track-wider)',
                    color: strong ? 'var(--text)' : 'var(--text-3)',
                }}
            >
                {label}
            </span>
            <span
                style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: strong ? 16 : 13,
                    color: strong ? 'var(--gold)' : 'var(--text-2)',
                }}
            >
                {value}
            </span>
        </div>
    );
}
