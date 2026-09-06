'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
    setCheckoutContact,
    listShippingOptions,
    setShippingMethod,
    initStripePaymentSession,
    completeCart,
} from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { Cart, ShippingOption, AddressInput } from '@/lib/medusa-types';
import { Dots, SweepBar } from '../_ui';

type ShippingGroup = { key: string; title: string; note?: string; options: ShippingOption[] };

/**
 * Group shipping options by profile — one method per profile is what Medusa
 * needs to complete the cart. Drop-ship groups (provider data id
 * 'dropship-flat': UNITY film, divine spoilers, flat charge, staff-entered
 * tracking) come first; headings come from the options themselves.
 */
function buildShippingGroups(options: ShippingOption[]): ShippingGroup[] {
    const byProfile = new Map<string, ShippingOption[]>();
    for (const o of options) {
        if (!byProfile.has(o.profileId)) byProfile.set(o.profileId, []);
        byProfile.get(o.profileId)!.push(o);
    }
    const isDrop = (opts: ShippingOption[]) => opts.some((o) => o.dataId === 'dropship-flat');
    const entries = Array.from(byProfile.entries()).sort((a, b) => (isDrop(a[1]) ? 0 : 1) - (isDrop(b[1]) ? 0 : 1));
    return entries.map(([key, opts], i) => {
        if (isDrop(opts)) return { key, title: 'Ships from the factory or partner', note: 'Tracking is added by our staff when it ships.', options: opts };
        if (opts.every((o) => /pickup/i.test(o.name))) return { key, title: 'Pickup', options: opts };
        if (entries.length === 1) return { key, title: 'Shipping method', options: opts };
        return { key, title: `Shipment ${i + 1}`, options: opts };
    });
}

// Stripe.js is loaded once per key. Kept at module scope so it isn't re-created
// on every render.
let stripePromiseCache: { key: string; promise: Promise<Stripe | null> } | null = null;
function getStripe(key: string): Promise<Stripe | null> {
    if (!stripePromiseCache || stripePromiseCache.key !== key) {
        stripePromiseCache = { key, promise: loadStripe(key) };
    }
    return stripePromiseCache.promise;
}

type Step = 'address' | 'shipping' | 'payment';

/**
 * The server actions the checkout drives. Defaults to the store cart lane;
 * the event-package checkout (E3) passes the lib/event-cart.ts equivalents so
 * the SAME UI runs against the walled Events sales channel + event cart cookie
 * without forking the component.
 */
export type CheckoutActions = {
    setCheckoutContact: typeof setCheckoutContact;
    listShippingOptions: typeof listShippingOptions;
    setShippingMethod: typeof setShippingMethod;
    initStripePaymentSession: typeof initStripePaymentSession;
    completeCart: typeof completeCart;
};

const STORE_ACTIONS: CheckoutActions = {
    setCheckoutContact,
    listShippingOptions,
    setShippingMethod,
    initStripePaymentSession,
    completeCart,
};

export function CheckoutClient({
    initialCart,
    stripeKey,
    signedInEmail,
    actions,
    successPathPrefix,
}: {
    initialCart: Cart;
    stripeKey: string;
    signedInEmail?: string | null;
    /** Override the cart/checkout server actions (event-package lane). */
    actions?: CheckoutActions;
    /** The order id is appended to this on success (default: store order page). */
    successPathPrefix?: string;
}) {
    const stripePromise = useMemo(() => getStripe(stripeKey), [stripeKey]);
    return (
        <Elements stripe={stripePromise}>
            <CheckoutInner
                initialCart={initialCart}
                signedInEmail={signedInEmail ?? null}
                actions={actions ?? STORE_ACTIONS}
                successPathPrefix={successPathPrefix ?? '/store/order/'}
            />
        </Elements>
    );
}

function CheckoutInner({
    initialCart,
    signedInEmail,
    actions,
    successPathPrefix,
}: {
    initialCart: Cart;
    signedInEmail: string | null;
    actions: CheckoutActions;
    successPathPrefix: string;
}) {
    const router = useRouter();
    const stripe = useStripe();
    const elements = useElements();

    const [cart, setCart] = useState<Cart>(initialCart);
    const [step, setStep] = useState<Step>('address');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [placing, setPlacing] = useState(false);

    const [form, setForm] = useState<AddressInput & { email: string }>({
        email: cart.email ?? signedInEmail ?? '',
        firstName: '',
        lastName: '',
        address1: '',
        address2: '',
        city: '',
        province: '',
        postalCode: '',
        countryCode: 'us',
        phone: '',
    });

    const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
    // One shipping method per shipping PROFILE (Medusa keeps one per profile and
    // completion needs every profile satisfied). A cart mixing a drop-shipped
    // spoiler (divine) with a shirt shows one group per profile, each with its
    // own pick. Keyed by profile id → option id.
    const [selectedShipping, setSelectedShipping] = useState<Record<string, string>>({});
    const shippingGroups = useMemo(() => buildShippingGroups(shippingOptions), [shippingOptions]);
    const allShippingChosen = shippingGroups.length > 0 && shippingGroups.every((g) => !!selectedShipping[g.key]);
    // A shipping method chosen THIS session. The cart can carry a stale method
    // from a previous visit (Medusa's Store API has no delete-shipping-method
    // endpoint), so we never trust cart.shipping_total until the shopper has
    // confirmed a method here. Choosing one replaces any stale method on the
    // cart (verified: Medusa replaces per shipping profile) and re-prices the
    // payment collection, so the amount charged is always items + chosen ship.
    const [shippingSet, setShippingSet] = useState(false);

    const currency = cart.currencyCode;
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    // Step 1 → 2: save contact + address, load shipping options.
    const submitAddress = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
            const res = await actions.setCheckoutContact(form.email, form);
            if (!res.ok) return setError(res.error);
            if (res.data) setCart(res.data);
            const opts = await actions.listShippingOptions();
            setShippingOptions(opts);
            // Preselect the first selectable option of every profile group.
            const init: Record<string, string> = {};
            for (const o of opts) if (!init[o.profileId] && !o.unavailable) init[o.profileId] = o.id;
            setSelectedShipping(init);
            setStep('shipping');
        });
    };

    // Step 2 → 3: set shipping method.
    const submitShipping = () => {
        const ids = shippingGroups.map((g) => selectedShipping[g.key]);
        if (!ids.length || ids.some((id) => !id)) {
            return setError(shippingGroups.length > 1 ? 'Select a shipping method for each shipment.' : 'Select a shipping method.');
        }
        setError(null);
        startTransition(async () => {
            // One call per profile; Medusa replaces the method on the same
            // profile, so nothing needs removing.
            let last: Cart | undefined;
            for (const id of ids) {
                const res = await actions.setShippingMethod(id);
                if (!res.ok) return setError(res.error);
                if (res.data) last = res.data;
            }
            if (last) setCart(last);
            setShippingSet(true);
            setStep('payment');
        });
    };

    // Step 3: init Stripe session, confirm card, complete cart.
    const placeOrder = async () => {
        if (placing) return; // guard against double-submit on payment
        setError(null);
        if (!stripe || !elements) return setError('Payment is still loading. One sec…');
        const card = elements.getElement(CardElement);
        if (!card) return setError('Enter your card details.');

        setPlacing(true);
        try {
            const initRes = await actions.initStripePaymentSession();
            if (!initRes.ok || !initRes.data) {
                setPlacing(false);
                return setError(initRes.ok ? 'Could not start payment.' : initRes.error);
            }

            const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(
                initRes.data.clientSecret,
                {
                    payment_method: {
                        card,
                        billing_details: {
                            name: `${form.firstName} ${form.lastName}`.trim(),
                            email: form.email,
                            phone: form.phone || undefined,
                            address: {
                                city: form.city,
                                country: form.countryCode.toUpperCase(),
                                line1: form.address1,
                                line2: form.address2 || undefined,
                                postal_code: form.postalCode,
                                state: form.province,
                            },
                        },
                    },
                },
            );

            // MANUAL capture: a successful authorization lands as
            // `requires_capture` (not `succeeded`). Both mean the money is held
            // and the order can be placed.
            const ok =
                !stripeErr &&
                paymentIntent &&
                (paymentIntent.status === 'requires_capture' ||
                    paymentIntent.status === 'succeeded');

            const authViaError =
                stripeErr?.payment_intent &&
                (stripeErr.payment_intent.status === 'requires_capture' ||
                    stripeErr.payment_intent.status === 'succeeded');

            if (!ok && !authViaError) {
                setPlacing(false);
                return setError(stripeErr?.message || 'Card was not authorized.');
            }

            let complete = await actions.completeCart();
            if (!complete.ok && /payment session/i.test(complete.error ?? '')) {
                // A declined attempt can leave the cart without a usable session
                // ("Payment sessions are required"): re-initialise and retry once.
                const again = await actions.initStripePaymentSession();
                if (again.ok && again.data) complete = await actions.completeCart();
            }
            if (!complete.ok || !complete.data) {
                setPlacing(false);
                return setError(complete.ok ? 'Could not place order.' : complete.error);
            }
            router.push(`${successPathPrefix}${complete.data.orderId}`);
        } catch (err: any) {
            setPlacing(false);
            setError(err?.message ?? 'Something went wrong placing your order.');
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 36, alignItems: 'start' }} className="pdp-grid">
            {/* LEFT: steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {signedInEmail ? (
                    <div className="mono-row" style={{ fontSize: 11 }}>
                        <span className="accent">SIGNED IN AS</span>
                        <span className="sep" />
                        <span style={{ color: 'var(--text)' }}>{signedInEmail}</span>
                    </div>
                ) : null}
                {/* STEP 1 — contact + address */}
                <StepBlock n={1} title="CONTACT & SHIPPING" active={step === 'address'} done={step !== 'address'} onEdit={() => { setShippingSet(false); setStep('address'); }}>
                    {step === 'address' ? (
                        <form onSubmit={submitAddress} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Field label="Email" value={form.email} onChange={set('email')} type="email" required />
                            <Row2>
                                <Field label="First name" value={form.firstName} onChange={set('firstName')} required />
                                <Field label="Last name" value={form.lastName} onChange={set('lastName')} required />
                            </Row2>
                            <Field label="Address" value={form.address1} onChange={set('address1')} required />
                            <Field label="Apt / suite (optional)" value={form.address2 ?? ''} onChange={set('address2')} />
                            <Row2>
                                <Field label="City" value={form.city} onChange={set('city')} required />
                                <Field label="State" value={form.province} onChange={set('province')} required />
                            </Row2>
                            <Row2>
                                <Field label="ZIP" value={form.postalCode} onChange={set('postalCode')} required />
                                <Field label="Phone (optional)" value={form.phone ?? ''} onChange={set('phone')} />
                            </Row2>
                            <button type="submit" className="btn btn-lg" disabled={pending} style={{ marginTop: 6 }}>
                                {pending ? <>SAVING<Dots /></> : 'CONTINUE TO SHIPPING →'}
                            </button>
                        </form>
                    ) : (
                        <div className="text-dim" style={{ fontSize: 13 }}>
                            {form.email} · {form.address1}, {form.city} {form.province} {form.postalCode}
                        </div>
                    )}
                </StepBlock>

                {/* STEP 2 — shipping */}
                <StepBlock n={2} title="SHIPPING METHOD" active={step === 'shipping'} done={step === 'payment'} onEdit={step === 'payment' ? () => { setShippingSet(false); setStep('shipping'); } : undefined}>
                    {step === 'shipping' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {shippingOptions.length === 0 ? (
                                <p className="text-dim" style={{ fontSize: 13 }}>No shipping options available for this address.</p>
                            ) : (
                                <>
                                    {shippingGroups.length > 1 && (
                                        <p className="text-dim" style={{ fontSize: 13 }}>
                                            Your order ships as {shippingGroups.length} shipments. Pick a method for each.
                                        </p>
                                    )}
                                    {shippingGroups.map((g) => (
                                        <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div>
                                                <div style={{ color: 'var(--text)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{g.title}</div>
                                                {g.note && <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>{g.note}</div>}
                                            </div>
                                            {g.options.map((o) => {
                                                const on = selectedShipping[g.key] === o.id;
                                                return (
                                                    <label
                                                        key={o.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '12px 14px',
                                                            border: `1px solid ${on ? 'var(--gold)' : 'var(--line)'}`,
                                                            background: on ? 'var(--gold-dim)' : 'transparent',
                                                            cursor: o.unavailable ? 'not-allowed' : 'pointer',
                                                            opacity: o.unavailable ? 0.5 : 1,
                                                        }}
                                                    >
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <input
                                                                type="radio"
                                                                name={`shipping-${g.key}`}
                                                                checked={on}
                                                                disabled={!!o.unavailable}
                                                                onChange={() => setSelectedShipping((p) => ({ ...p, [g.key]: o.id }))}
                                                            />
                                                            <span style={{ color: 'var(--text)', fontSize: 14 }}>{o.name}</span>
                                                        </span>
                                                        <span className="accent">{o.unavailable ? '—' : formatMoney(o.amount, currency)}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </>
                            )}
                            <button type="button" className="btn btn-lg" disabled={pending || !allShippingChosen} onClick={submitShipping} style={{ marginTop: 6 }}>
                                {pending ? <>SAVING<Dots /></> : 'CONTINUE TO PAYMENT →'}
                            </button>
                        </div>
                    ) : step === 'payment' ? (
                        <div className="text-dim" style={{ fontSize: 13 }}>
                            {shippingGroups
                                .map((g) => shippingOptions.find((o) => o.id === selectedShipping[g.key])?.name)
                                .filter(Boolean)
                                .join(' · ') || 'Selected'}
                        </div>
                    ) : (
                        <div className="text-dim" style={{ fontSize: 13 }}>Enter your address first.</div>
                    )}
                </StepBlock>

                {/* STEP 3 — payment */}
                <StepBlock n={3} title="PAYMENT" active={step === 'payment'} done={false}>
                    {step === 'payment' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ padding: '14px 14px', border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                                {stripe ? (
                                    <CardElement
                                        options={{
                                            style: {
                                                base: {
                                                    color: '#f0f0f0',
                                                    fontFamily: 'monospace',
                                                    fontSize: '15px',
                                                    '::placeholder': { color: '#8a8a9a' },
                                                },
                                                invalid: { color: '#ff6b6b' },
                                            },
                                        }}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <span className="text-dim font-display" style={{ fontSize: 11, letterSpacing: 'var(--track-wider)' }}>
                                            LOADING SECURE PAYMENT…
                                        </span>
                                        <SweepBar />
                                    </div>
                                )}
                            </div>
                            <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
                                TEST MODE — use 4242 4242 4242 4242, any future date + CVC.
                            </p>
                            <button type="button" className="btn btn-lg" onClick={placeOrder} disabled={placing || !stripe} style={{ width: '100%' }}>
                                {placing ? <>PLACING ORDER<Dots /></> : `PLACE ORDER · ${formatMoney(cart.total, currency)}`}
                            </button>
                        </div>
                    ) : (
                        <div className="text-dim" style={{ fontSize: 13 }}>Complete the steps above.</div>
                    )}
                </StepBlock>

                {error ? <p style={{ color: 'var(--danger, #ff6b6b)', fontSize: 13, margin: 0 }}>{error}</p> : null}
            </div>

            {/* RIGHT: order summary */}
            <aside style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', padding: 20, position: 'sticky', top: 84 }}>
                <div className="eyebrow eyebrow-gold mb-4">／ ORDER</div>
                {cart.isMultiVendor ? (
                    <div className="mono-row" style={{ fontSize: 11, marginBottom: 14 }}>
                        <span className="accent">SOLD BY</span>
                        <span className="sep" />
                        <span style={{ color: 'var(--text)' }}>
                            {cart.vendors.map((v) => v.name).filter(Boolean).join(' · ')}
                        </span>
                    </div>
                ) : cart.vendor.name ? (
                    <div className="mono-row" style={{ fontSize: 11, marginBottom: 14 }}>
                        <span className="accent">SOLD BY</span>
                        <span className="sep" />
                        <span style={{ color: 'var(--text)' }}>{cart.vendor.name}</span>
                    </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {cart.items.map((it) => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                            <span className="text-dim" style={{ minWidth: 0 }}>
                                {it.productTitle}
                                {it.variantTitle && it.variantTitle !== 'Default' ? ` · ${it.variantTitle}` : ''} × {it.quantity}
                            </span>
                            <span style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatMoney(it.total, currency)}</span>
                        </div>
                    ))}
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SumRow label="Subtotal" value={formatMoney(cart.subtotal, currency)} />
                    <SumRow label="Shipping" value={shippingSet ? formatMoney(cart.shippingTotal, currency) : '—'} />
                    {shippingSet && cart.taxTotal ? <SumRow label="Tax" value={formatMoney(cart.taxTotal, currency)} /> : null}
                    <SumRow label="Total" value={shippingSet ? formatMoney(cart.total, currency) : 'TBD'} strong />
                </div>
            </aside>
        </div>
    );
}

function StepBlock({
    n,
    title,
    active,
    done,
    onEdit,
    children,
}: {
    n: number;
    title: string;
    active: boolean;
    done: boolean;
    onEdit?: () => void;
    children: React.ReactNode;
}) {
    return (
        <div style={{ border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`, padding: 20, opacity: active || done ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: active ? 16 : 0 }}>
                <div className="mono-row" style={{ fontSize: 12 }}>
                    <span className="accent">{done ? '✓' : n}</span>
                    <span className="sep" />
                    <span style={{ color: 'var(--text)', letterSpacing: 1 }}>{title}</span>
                </div>
                {done && onEdit ? (
                    <button type="button" onClick={onEdit} className="font-display" style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>
                        EDIT
                    </button>
                ) : null}
            </div>
            {children}
        </div>
    );
}

function Field({
    label,
    ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="eyebrow">{label}</span>
            <input
                {...props}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    padding: '11px 12px',
                    fontSize: 15,
                    fontFamily: 'inherit',
                }}
            />
        </label>
    );
}

function Row2({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>{children}</div>;
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 16 : 13 }}>
            <span className="text-dim">{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: strong ? 700 : 400 }}>{value}</span>
        </div>
    );
}
