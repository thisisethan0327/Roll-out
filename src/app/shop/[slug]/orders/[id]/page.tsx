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
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { refundPolicyShortLine, REFUND_POLICY_PATH } from '@/lib/refund-policy';
import { fmtMoney, fmtDate, maskEmail, StatusChip } from '../ui';
import { OrderActions } from './OrderActions';
import { SHOPS_WITH_OWN_ADMIN } from '@/lib/tenant-hosts';
import { ManagedElsewhereNotice } from '../../ManagedElsewhereNotice';
import { ExternalLink, Eye, Package, Truck } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { CardHead, ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order' };

/**
 * Mirrors the tiers enforced in ../actions.ts. Kept in step by hand rather than
 * imported, because that module is 'use server' and importing a plain Set from
 * it would drag the whole action surface into this page's graph. The tiers are
 * two lines; the enforcement that matters is server-side either way.
 */
const MANAGE_ROLES = new Set(['owner', 'admin', 'manager', 'installer', 'staff']);
const MONEY_ROLES = new Set(['owner', 'admin', 'manager']);

/**
 * The figures the money confirms name. Same payment the server actions pick
 * (lib/medusa-admin.ts refundVendorOrder / captureOrderPayment): the first
 * captured, uncanceled payment for a refund; the first uncaptured,
 * uncanceled one for a capture.
 */
type PayLite = { amount: number | null; refunded_amount?: number | null; captured_at?: string | null; canceled_at?: string | null };
function refundableOn(payments: PayLite[]): number | null {
    const p = payments.find((x) => x.captured_at && !x.canceled_at);
    if (!p) return null;
    return Math.max(0, Number(p.amount ?? 0) - Number(p.refunded_amount ?? 0));
}
function authorizedOn(payments: PayLite[]): number | null {
    const p = payments.find((x) => !x.captured_at && !x.canceled_at);
    return p && p.amount != null ? Number(p.amount) : null;
}

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
    // A shop with its own admin manages orders there; this stays a read. The
    // server action refuses these too — hidden is not the same as forbidden.
    const managedElsewhere = SHOPS_WITH_OWN_ADMIN[slug] ?? null;
    const canManage = !managedElsewhere && MANAGE_ROLES.has(role);
    const canMoney = !managedElsewhere && MONEY_ROLES.has(role);
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

    // Paid-event ticket (077) — see refuseIfClosedEventOrder's comment in
    // ../actions.ts for why an event order cannot actually reach this page
    // today; wired through anyway so nothing has to change here if that does.
    let refundPolicyLine: string | null = null;
    if (o.eventId) {
        try {
            const admin = getSupabaseAdmin();
            const { data: ev } = await admin
                .from('events')
                .select('start_at, time_zone, reservation_policy')
                .eq('id', o.eventId)
                .maybeSingle();
            if (ev) {
                refundPolicyLine = refundPolicyShortLine(
                    (ev as any).start_at,
                    (ev as any).time_zone,
                    (ev as any).reservation_policy,
                );
            }
        } catch (e) {
            console.error('[shop orders/[id]] refund policy lookup failed:', (e as any)?.message ?? e);
        }
    }

    const ic = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <BizPage slug={slug}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/orders`, label: 'All orders' }}
                title={<span className="g-w">#{o.display_id ?? o.id.slice(-8)}</span>}
                sub={`${fmtDate(o.created_at)} · ${maskEmail(o.email)}`}
                actions={
                    <div className="g-chips">
                        {o.payment_status && <StatusChip status={o.payment_status} />}
                        {o.status === 'canceled' ? (
                            <StatusChip status="canceled" />
                        ) : (
                            o.fulfillment_status && <StatusChip status={o.fulfillment_status} />
                        )}
                    </div>
                }
            />

            <div className={bz.split}>
                {/* Actions first in the DOM so a phone sees the next step
                    before the receipt; on a wide screen it sits on the right. */}
                <div className={cx(cs.col, bz.sideFirst)}>
                    {managedElsewhere ? (
                        <ManagedElsewhereNotice adminUrl={managedElsewhere} what="orders" />
                    ) : canManage ? (
                        <OrderActions
                            slug={slug}
                            orderId={o.id}
                            status={o.status}
                            paymentStatus={o.payment_status}
                            fulfillmentStatus={o.fulfillment_status}
                            hasAuthorizedPayment={o.hasAuthorizedPayment}
                            hasUnfulfilledItems={o.hasUnfulfilledItems}
                            hasUnshippedFulfillment={o.fulfillments.some(
                                (f) => !f.canceled_at && !f.shipped_at,
                            )}
                            canMoney={canMoney}
                            role={role}
                            orderNumber={String(o.display_id ?? o.id.slice(-8))}
                            currency={cur}
                            refundable={refundableOn(o.payments)}
                            authorizedAmount={authorizedOn(o.payments)}
                        />
                    ) : (
                        <Notice icon={<Eye {...ic} />}>Viewing only — your role has no order actions on this shop.</Notice>
                    )}

                    {refundPolicyLine ? (
                        <section className="g-card" aria-labelledby="ord-policy">
                            <CardHead id="ord-policy" title="Refund policy" sub="Paid event" />
                            <div className={cs.cardBody}>
                                <p className={cs.small}>
                                    {refundPolicyLine}{' '}
                                    <Link href={REFUND_POLICY_PATH}>Full policy</Link>
                                </p>
                            </div>
                        </section>
                    ) : null}
                </div>

                <div className={cs.col}>
                    {/* ITEMS + TOTALS */}
                    <section className="g-card" aria-labelledby="ord-items">
                        <CardHead id="ord-items" title="Items" sub={`${o.items.length} line${o.items.length === 1 ? '' : 's'}`} />
                        {o.items.length === 0 ? (
                            <CardEmpty icon={<Package size={22} strokeWidth={1.75} />} title="No items on this order" />
                        ) : (
                            <ul className={cx('g-rows', cs.cardRows)}>
                                {o.items.map((it) => (
                                    <li key={it.id} className="g-row" style={{ minHeight: 72, paddingRight: 24 }}>
                                        {it.thumbnail ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={it.thumbnail} alt="" className={bz.thumbSq} />
                                        ) : (
                                            <span className={cx(bz.thumbSq, bz.thumbBlank)} aria-hidden="true">
                                                <Package size={20} strokeWidth={1.75} />
                                            </span>
                                        )}
                                        <span className="g-row-t">
                                            <b>{it.title ?? 'Item'}</b>
                                            <small>
                                                Qty {it.quantity ?? 1}
                                                {it.fulfilledQuantity > 0 ? ` · ${it.fulfilledQuantity} fulfilled` : ''}
                                            </small>
                                        </span>
                                        <span className={cs.rowValue}>{fmtMoney(it.unit_price, cur)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className={cs.cardBody}>
                            <ul className={bz.kv} aria-label="Totals">
                                <TotalRow label="Subtotal" value={fmtMoney(o.item_subtotal, cur)} />
                                {o.discount_total ? <TotalRow label="Discount" value={`- ${fmtMoney(o.discount_total, cur)}`} /> : null}
                                <TotalRow label="Shipping" value={fmtMoney(o.shipping_total, cur)} />
                                {o.tax_total ? <TotalRow label="Tax" value={fmtMoney(o.tax_total, cur)} /> : null}
                                <TotalRow label="Total" value={fmtMoney(o.total, cur)} strong />
                            </ul>
                        </div>
                    </section>

                    {/* SHIPPING + PAYMENT */}
                    <div className={cs.g2}>
                        <section className="g-card" aria-labelledby="ord-ship">
                            <CardHead id="ord-ship" title="Shipping" />
                            <div className={cs.cardBody}>
                                {addrLines.length > 0 ? (
                                    <address className={bz.addr}>
                                        {addrLines.map((line, i) => (
                                            <span key={i}>{line}</span>
                                        ))}
                                    </address>
                                ) : (
                                    <p className={cs.small}>No shipping address on file.</p>
                                )}
                                {o.shipping_method && (
                                    <ul className={bz.kv} style={{ marginTop: 12 }}>
                                        <li className={bz.kvLine}>
                                            <span>{o.shipping_method.name ?? 'Shipping'}</span>
                                            <span className={bz.num}>{fmtMoney(o.shipping_method.amount, cur)}</span>
                                        </li>
                                    </ul>
                                )}
                                {tracking.length > 0 && (
                                    <div className={bz.track}>
                                        <h3>
                                            <Truck size={16} strokeWidth={2} aria-hidden="true" />
                                            Tracking
                                        </h3>
                                        {tracking.map((t, i) =>
                                            t.url ? (
                                                <a key={i} href={t.url} target="_blank" rel="noopener noreferrer" className={cx('g-link', bz.mono)}>
                                                    {t.number ?? 'Track shipment'}
                                                    <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                                                </a>
                                            ) : (
                                                <span key={i} className={bz.mono}>
                                                    {t.number}
                                                </span>
                                            ),
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="g-card" aria-labelledby="ord-pay">
                            <CardHead id="ord-pay" title="Payment" />
                            <div className={cs.cardBody}>
                                {o.payments.length === 0 ? (
                                    <p className={cs.small}>No payment details available.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        {o.payments.map((p) => {
                                            // A refunded payment must not read as money received.
                                            const refunded = Number(p.refunded_amount ?? 0);
                                            const fully = refunded > 0 && Number(p.amount ?? 0) - refunded <= 0.005;
                                            return (
                                                <ul key={p.id} className={bz.kv}>
                                                    <li style={{ color: 'var(--ink)', fontWeight: 600 }}>
                                                        <span>
                                                            {p.captured_at
                                                                ? fully
                                                                    ? 'Refunded'
                                                                    : refunded > 0
                                                                      ? 'Partly refunded'
                                                                      : 'Captured'
                                                                : p.canceled_at
                                                                  ? 'Canceled'
                                                                  : 'Authorized'}
                                                        </span>
                                                        <span className={cx(bz.num, fully && bz.strike)}>{fmtMoney(p.amount, cur)}</span>
                                                    </li>
                                                    {refunded > 0 ? (
                                                        <li className={bz.sub}>
                                                            <span>Refunded</span>
                                                            <span className={bz.num}>- {fmtMoney(refunded, cur)}</span>
                                                        </li>
                                                    ) : null}
                                                    {refunded > 0 && !fully ? (
                                                        <li className={bz.sub}>
                                                            <span>Net</span>
                                                            <span className={bz.num}>{fmtMoney(p.net_amount, cur)}</span>
                                                        </li>
                                                    ) : null}
                                                    <li className={bz.sub}>
                                                        <span>
                                                            {p.captured_at
                                                                ? `Charged ${fmtDate(p.captured_at)}`
                                                                : p.canceled_at
                                                                  ? `Canceled ${fmtDate(p.canceled_at)}`
                                                                  : 'Authorized — capture when the order ships'}
                                                        </span>
                                                    </li>
                                                </ul>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </BizPage>
    );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <li className={strong ? bz.total : undefined}>
            <span>{label}</span>
            <span className={bz.num}>{value}</span>
        </li>
    );
}
