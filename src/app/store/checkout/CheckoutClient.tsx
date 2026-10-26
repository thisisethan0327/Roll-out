'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe, type Stripe, type ExpressCheckoutPaymentMethodsOption } from '@stripe/stripe-js';
import { Elements, CardElement, ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
    setCheckoutContact,
    listShippingOptions,
    setShippingMethod,
    initStripePaymentSession,
    completeCart,
} from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { Cart, ShippingOption, AddressInput } from '@/lib/medusa-types';
import { ArrowRight, Check, Lock, LoaderCircle, Package, Pencil, Store } from 'lucide-react';
import { ErrorLine } from '@/components/glide-tickets/parts';
import { confirmDialog } from '@/components/glide/confirm';

type ShippingGroup = { key: string; title: string; note?: string; options: ShippingOption[] };

/**
 * Where an error is shown: next to the thing it is about (overlay plan Phase
 * 0 #6), not in one line under step 3. An address error used to render below
 * the payment block, far from the field.
 */
type ErrAt = 'address' | 'shipping' | 'card' | 'agreement' | 'payment';

/**
 * Colours for the Stripe card field.
 *
 * Stripe renders CardElement inside its own IFRAME, so it cannot see our CSS
 * custom properties and has to be handed literal colours. Those were hard-coded
 * to the dark palette (#f0f0f0 text on what is now a light --bg-2), which in
 * light mode meant near-white digits on near-white paper: the customer could
 * not read the card number they were typing.
 *
 * So the values are READ BACK from the same custom properties the surrounding
 * panel uses, and the element is remounted when the theme changes — Stripe
 * reads `style` once at creation, so a changed value alone never reaches the
 * iframe. Falls back to the dark palette if the properties cannot be read,
 * which is what the page looked like before this existed.
 */
function useCardColors() {
    const read = () => {
        if (typeof window === 'undefined') {
            return { theme: 'dark', text: '#f0f0f0', dim: '#8a8a9a', bad: '#ff6b6b' };
        }
        const root = document.documentElement;
        // Read from <body>: on a Glide page the palette (and the legacy names
        // bridged onto it) resolve there, not on <html>.
        const cs = getComputedStyle(document.body ?? root);
        const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
        const stamped = root.getAttribute('data-theme');
        const theme =
            stamped === 'light' || stamped === 'dark'
                ? stamped
                : window.matchMedia?.('(prefers-color-scheme: light)').matches
                  ? 'light'
                  : 'dark';
        return {
            theme,
            text: v('--ink', '') || v('--text', '#f0f0f0'),
            dim: v('--ink-2', '') || v('--text-3', '#8a8a9a'),
            bad: v('--warn', '#ff6b6b'),
        };
    };

    const [colors, setColors] = useState(read);
    useEffect(() => {
        const apply = () => setColors(read());
        apply(); // the server render could not read any of this
        const mq = window.matchMedia?.('(prefers-color-scheme: light)');
        mq?.addEventListener?.('change', apply);
        const obs = new MutationObserver(apply);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-dark'] });
        return () => {
            mq?.removeEventListener?.('change', apply);
            obs.disconnect();
        };
    }, []);
    return colors;
}

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
    const VENDOR_NAMES: Record<string, string> = { unityusa: 'UNITY USA', neferstock: 'NeferStock', divine: 'divine DESIGN WHEELS', emwraps: 'EMWRAPS' };
    return entries.map(([key, opts], i) => {
        const tenant = opts.map((o) => o.dataTenant).find(Boolean);
        const who = tenant ? VENDOR_NAMES[tenant] ?? tenant : null;
        if (isDrop(opts)) return { key, title: `${who ? who + ' · ' : ''}Ships from the factory or partner`, note: 'Tracking is added by our staff when it ships.', options: opts };
        if (opts.every((o) => /pickup/i.test(o.name))) return { key, title: `${who ? who + ' · ' : ''}Pickup`, options: opts };
        if (entries.length === 1) return { key, title: who ? `${who} · Shipping` : 'Shipping method', options: opts };
        return { key, title: who ? `${who} · Shipment` : `Shipment ${i + 1}`, options: opts };
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

/**
 * An extra required checkbox rendered above the pay button — used by the
 * event-package checkout to gate payment on agreeing to the refund &
 * cancellation policy (077). Optional and unused by the store checkout, so
 * this is purely additive to the shared component.
 */
export type CheckoutAgreement = {
    /** Rendered next to the checkbox, e.g. "I agree to the refund & …". */
    label: React.ReactNode;
};

export function CheckoutClient({
    initialCart,
    stripeKey,
    signedInEmail,
    initialAddress,
    actions,
    successPathPrefix,
    agreement,
}: {
    initialCart: Cart;
    stripeKey: string;
    signedInEmail?: string | null;
    /** The member's saved default shipping address, used when the cart has none. */
    initialAddress?: AddressInput | null;
    /** Override the cart/checkout server actions (event-package lane). */
    actions?: CheckoutActions;
    /** The order id is appended to this on success (default: store order page). */
    successPathPrefix?: string;
    /** Required checkbox that gates the pay button (event checkout only). */
    agreement?: CheckoutAgreement;
}) {
    const stripePromise = useMemo(() => getStripe(stripeKey), [stripeKey]);
    return (
        <Elements stripe={stripePromise}>
            <CheckoutInner
                stripePromise={stripePromise}
                initialCart={initialCart}
                signedInEmail={signedInEmail ?? null}
                initialAddress={initialAddress ?? null}
                actions={actions ?? STORE_ACTIONS}
                successPathPrefix={successPathPrefix ?? '/store/order/'}
                agreement={agreement}
            />
        </Elements>
    );
}

function CheckoutInner({
    stripePromise,
    initialCart,
    signedInEmail,
    initialAddress,
    actions,
    successPathPrefix,
    agreement,
}: {
    stripePromise: Promise<Stripe | null>;
    initialCart: Cart;
    signedInEmail: string | null;
    initialAddress: AddressInput | null;
    actions: CheckoutActions;
    successPathPrefix: string;
    agreement?: CheckoutAgreement;
}) {
    const cardColors = useCardColors();
    const router = useRouter();
    const stripe = useStripe();
    const elements = useElements();

    const [cart, setCart] = useState<Cart>(initialCart);
    const [step, setStep] = useState<Step>('address');
    const [error, setError] = useState<{ at: ErrAt; text: string } | null>(null);
    const fail = (at: ErrAt, text: string) => setError({ at, text });
    const [pending, startTransition] = useTransition();
    const [placing, setPlacing] = useState(false);

    /**
     * Leave guard while the order is being placed (card confirm through cart
     * completion runs in this tab): a reload or tab close gets the browser's
     * own prompt, and an in-app link asks first. Leaving mid-way could leave
     * the card authorized with no order.
     */
    const leavingRef = useRef(false);
    useEffect(() => {
        if (!placing) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (leavingRef.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        const onClick = async (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
            const url = new URL(a.href, window.location.href);
            // Other sites: the beforeunload prompt covers them.
            if (url.origin !== window.location.origin) return;
            e.preventDefault();
            e.stopPropagation();
            const ok = await confirmDialog({
                title: 'Leave checkout while your order is being placed?',
                message: 'Your payment is still going through. Leaving now can stop the order from finishing.',
                confirmLabel: 'Leave',
                cancelLabel: 'Stay',
                danger: true,
            });
            if (ok) {
                leavingRef.current = true;
                window.location.assign(url.href);
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [placing]);

    // Prefill from the cart's saved address so a reload of /store/checkout
    // does not drop the shopper into a blank form (rerun 2026-09-06).
    const [form, setForm] = useState<AddressInput & { email: string }>({
        email: cart.email ?? signedInEmail ?? '',
        firstName: cart.shippingAddress?.firstName || initialAddress?.firstName || '',
        lastName: cart.shippingAddress?.lastName || initialAddress?.lastName || '',
        address1: cart.shippingAddress?.address1 || initialAddress?.address1 || '',
        address2: cart.shippingAddress?.address2 || initialAddress?.address2 || '',
        city: cart.shippingAddress?.city || initialAddress?.city || '',
        province: cart.shippingAddress?.province || initialAddress?.province || '',
        postalCode: cart.shippingAddress?.postalCode || initialAddress?.postalCode || '',
        countryCode: cart.shippingAddress?.countryCode || initialAddress?.countryCode || 'us',
        phone: cart.shippingAddress?.phone || initialAddress?.phone || '',
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
    // Only meaningful when `agreement` is passed (event checkout); defaults
    // true so the store checkout's pay button is never affected.
    const [agreed, setAgreed] = useState(!agreement);

    const currency = cart.currencyCode;
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    // Step 1 → 2: save contact + address, load shipping options.
    const submitAddress = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
            const res = await actions.setCheckoutContact(form.email, form);
            if (!res.ok) return fail('address', res.error);
            if (res.data) setCart(res.data);
            const opts = await actions.listShippingOptions();
            setShippingOptions(opts);
            // Preselect per profile group: the first selectable SHIPPING option;
            // pickup only when nothing else exists (rerun 2026-09-06: the UNITY
            // group defaulted to Local pickup $0).
            const init: Record<string, string> = {};
            for (const o of opts) if (!init[o.profileId] && !o.unavailable && !/pickup/i.test(o.name)) init[o.profileId] = o.id;
            for (const o of opts) if (!init[o.profileId] && !o.unavailable) init[o.profileId] = o.id;
            setSelectedShipping(init);
            setStep('shipping');
        });
    };

    // Step 2 → 3: set shipping method.
    const submitShipping = () => {
        const ids = shippingGroups.map((g) => selectedShipping[g.key]);
        if (!ids.length || ids.some((id) => !id)) {
            return fail('shipping', shippingGroups.length > 1 ? 'Select a shipping method for each shipment.' : 'Select a shipping method.');
        }
        setError(null);
        startTransition(async () => {
            // One call per profile; Medusa replaces the method on the same
            // profile, so nothing needs removing.
            let last: Cart | undefined;
            for (const id of ids) {
                const res = await actions.setShippingMethod(id);
                if (!res.ok) return fail('shipping', res.error);
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
        if (!stripe || !elements) return fail('payment', 'Payment is still loading. One sec…');
        const card = elements.getElement(CardElement);
        if (!card) return fail('card', 'Enter your card details.');

        setPlacing(true);
        try {
            const initRes = await actions.initStripePaymentSession();
            if (!initRes.ok || !initRes.data) {
                setPlacing(false);
                return fail('payment', initRes.ok ? 'Could not start payment.' : initRes.error);
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
                return fail('card', stripeErr?.message || 'Card was not authorized.');
            }

            await finishOrder();
        } catch (err: any) {
            setPlacing(false);
            fail('payment', err?.message ?? 'Something went wrong placing your order.');
        }
    };

    // After Stripe has authorized the payment (card form OR express wallet):
    // complete the Medusa cart and go to the success page.
    const finishOrder = async () => {
        {
            let complete = await actions.completeCart();
            if (!complete.ok && /payment session/i.test(complete.error ?? '')) {
                // A declined attempt can leave the cart without a usable session
                // ("Payment sessions are required"): re-initialise and retry once.
                const again = await actions.initStripePaymentSession();
                if (again.ok && again.data) complete = await actions.completeCart();
            }
            if (!complete.ok || !complete.data) {
                setPlacing(false);
                return fail('payment', complete.ok ? 'Could not place order.' : complete.error);
            }
            router.push(`${successPathPrefix}${complete.data.orderId}`);
        }
    };

    const errorAt = (at: ErrAt) => (error?.at === at ? <ErrorLine>{error.text}</ErrorLine> : null);
    const errorShown =
        !!error &&
        ((error.at === 'address' && step === 'address') ||
            (error.at === 'shipping' && step === 'shipping') ||
            (step === 'payment' && (error.at === 'card' || error.at === 'payment' || error.at === 'agreement')));

    const shippingSummary =
        shippingGroups
            .map((g) => shippingOptions.find((o) => o.id === selectedShipping[g.key])?.name)
            .filter(Boolean)
            .join(' · ') || 'Selected';
    const soldBy = cart.isMultiVendor
        ? cart.vendors.map((v) => v.name).filter(Boolean).join(' · ')
        : cart.vendor.name || null;

    return (
        <div className="gt-cols">
            {/* LEFT: steps */}
            <div className="gt-steps">
                {/* STEP 1 — contact + address */}
                <StepBlock n={1} title="Contact & shipping" active={step === 'address'} done={step !== 'address'} onEdit={() => { setShippingSet(false); setError(null); setStep('address'); }}>
                    {step === 'address' ? (
                        <form onSubmit={submitAddress} className="gt-step-body">
                            <div className="gt-fields">
                                <Field label="Email" value={form.email} onChange={set('email')} type="email" autoComplete="email" required />
                            </div>
                            <div className="gt-fields">
                                <Row2>
                                    <Field label="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required />
                                    <Field label="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
                                </Row2>
                                <Field label="Address" value={form.address1} onChange={set('address1')} autoComplete="address-line1" required />
                                <Field label="Apt / suite" value={form.address2 ?? ''} onChange={set('address2')} autoComplete="address-line2" />
                                <Row2>
                                    <Field label="City" value={form.city} onChange={set('city')} autoComplete="address-level2" required />
                                    <Field label="State" value={form.province} onChange={set('province')} autoComplete="address-level1" required />
                                </Row2>
                                <Row2>
                                    <Field label="ZIP" value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" required />
                                    <Field label="Phone" value={form.phone ?? ''} onChange={set('phone')} type="tel" autoComplete="tel" />
                                </Row2>
                            </div>
                            {errorAt('address')}
                            <button type="submit" className="g-btn g-btn--block" disabled={pending} aria-busy={pending || undefined}>
                                <span>{pending ? 'Saving…' : 'Continue to shipping'}</span>
                                <span className="g-btn-k" aria-hidden="true">
                                    {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                                </span>
                            </button>
                        </form>
                    ) : (
                        <p className="gt-step-sum">
                            {form.email} · {form.address1}, {form.city} {form.province} {form.postalCode}
                        </p>
                    )}
                </StepBlock>

                {/* STEP 2 — shipping */}
                <StepBlock n={2} title="Shipping method" active={step === 'shipping'} done={step === 'payment'} onEdit={step === 'payment' ? () => { setShippingSet(false); setError(null); setStep('shipping'); } : undefined}>
                    {step === 'shipping' ? (
                        <div className="gt-step-body">
                            {shippingOptions.length === 0 ? (
                                <ErrorLine>No shipping options available for this address.</ErrorLine>
                            ) : (
                                <>
                                    {shippingGroups.map((g) => (
                                        <fieldset key={g.key} className="gt-shipgrp" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                                            <legend style={{ padding: 0 }}>
                                                <h3>{g.title}</h3>
                                            </legend>
                                            {g.note && <p>{g.note}</p>}
                                            {g.options.map((o) => {
                                                const on = selectedShipping[g.key] === o.id;
                                                return (
                                                    <label key={o.id} className="gt-tk">
                                                        <input
                                                            type="radio"
                                                            name={`shipping-${g.key}`}
                                                            checked={on}
                                                            disabled={!!o.unavailable}
                                                            onChange={() => setSelectedShipping((p) => ({ ...p, [g.key]: o.id }))}
                                                        />
                                                        <span className="gt-tk-t">
                                                            <b>{o.name}</b>
                                                            {o.unavailable ? <small>Not available for this address</small> : null}
                                                        </span>
                                                        <span className="gt-tk-pr g-w">{o.unavailable ? '—' : formatMoney(o.amount, currency)}</span>
                                                        <span className="gt-tk-rd" aria-hidden="true">
                                                            <Check size={14} strokeWidth={3} />
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </fieldset>
                                    ))}
                                </>
                            )}
                            {errorAt('shipping')}
                            <button type="button" className="g-btn g-btn--block" disabled={pending || !allShippingChosen} onClick={submitShipping} aria-busy={pending || undefined}>
                                <span>{pending ? 'Saving…' : 'Continue to payment'}</span>
                                <span className="g-btn-k" aria-hidden="true">
                                    {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                                </span>
                            </button>
                        </div>
                    ) : step === 'payment' ? (
                        <p className="gt-step-sum">{shippingSummary}</p>
                    ) : null}
                </StepBlock>

                {/* STEP 3 — payment */}
                <StepBlock n={3} title="Payment" active={step === 'payment'} done={false}>
                    {step === 'payment' ? (
                        <div className="gt-step-body">
                            <ExpressPay
                                stripePromise={stripePromise}
                                amountMinor={Math.round(cart.total * 100)}
                                currency={currency}
                                theme={cardColors.theme}
                                canPay={() => {
                                    if (placing) return false;
                                    if (!agreed) {
                                        fail('agreement', 'Tick the box to agree to the refund & cancellation policy first.');
                                        return false;
                                    }
                                    setError(null);
                                    return true;
                                }}
                                initSession={actions.initStripePaymentSession}
                                onStart={() => setPlacing(true)}
                                onFail={(msg) => {
                                    setPlacing(false);
                                    fail('payment', msg);
                                }}
                                onAuthorized={async () => {
                                    try {
                                        await finishOrder();
                                    } catch (err: any) {
                                        setPlacing(false);
                                        fail('payment', err?.message ?? 'Something went wrong placing your order.');
                                    }
                                }}
                            />
                            <div className="gt-fields">
                                <div className="gt-fld gt-fld--card">
                                    <span>Card</span>
                                    {stripe ? (
                                        <CardElement
                                            // Remounts on a theme change: Stripe reads `style` once,
                                            // when the element is created, so a changed value alone
                                            // would not reach the iframe.
                                            key={`${cardColors.theme}-${cardColors.text}`}
                                            options={{
                                                style: {
                                                    base: {
                                                        color: cardColors.text,
                                                        fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
                                                        fontSize: '16px',
                                                        '::placeholder': { color: cardColors.dim },
                                                    },
                                                    invalid: { color: cardColors.text, iconColor: cardColors.bad },
                                                },
                                            }}
                                        />
                                    ) : (
                                        <span className="gt-busy" style={{ minHeight: 28 }}>
                                            <LoaderCircle size={16} strokeWidth={2} className="g-spin" aria-hidden="true" />
                                            Loading secure payment…
                                        </span>
                                    )}
                                </div>
                            </div>
                            {errorAt('card')}
                            {(process.env.NEXT_PUBLIC_STRIPE_KEY ?? "").startsWith("pk_test_") ? (
                                <p className="gt-fine">Test mode: use 4242 4242 4242 4242, any future date and CVC.</p>
                            ) : null}
                            {agreement ? (
                                <label className="gt-check">
                                    <input
                                        type="checkbox"
                                        checked={agreed}
                                        onChange={(e) => setAgreed(e.target.checked)}
                                        required
                                    />
                                    <span className="gt-box" aria-hidden="true">
                                        <Check size={15} strokeWidth={3} />
                                    </span>
                                    <span>{agreement.label}</span>
                                </label>
                            ) : null}
                            {errorAt('agreement')}
                            <button
                                type="button"
                                className="g-btn g-btn--block"
                                onClick={placeOrder}
                                disabled={placing || !stripe || !agreed}
                                aria-busy={placing || undefined}
                            >
                                <span>{placing ? 'Placing order…' : 'Place order'}</span>
                                {!placing ? <span className="gt-btn-v">{formatMoney(cart.total, currency)}</span> : null}
                                <span className="g-btn-k" aria-hidden="true">
                                    {placing ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <Lock size={18} strokeWidth={2} />}
                                </span>
                            </button>
                            {errorAt('payment')}
                            <p className="gt-lockline">
                                <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
                                Payments by Stripe. Your card goes to Stripe, not to Rollout.
                            </p>
                        </div>
                    ) : null}
                </StepBlock>

                {/* Fallback: an error whose step is not open (should not happen). */}
                {error && !errorShown ? <ErrorLine>{error.text}</ErrorLine> : null}
            </div>

            {/* RIGHT: order summary */}
            <aside className="g-card gt-sumcard gt-side" aria-labelledby="co-order">
                <h2 className="g-card-h" id="co-order">
                    Order
                </h2>
                {soldBy ? (
                    <div className="gt-sold g-chips">
                        <span className="g-chip">
                            <Store size={14} strokeWidth={2} aria-hidden="true" />
                            Sold by {soldBy}
                        </span>
                    </div>
                ) : null}
                <ul className="gt-lines">
                    {cart.items.map((it) => (
                        <li key={it.id} className="gt-line">
                            <span className="gt-thumb" aria-hidden="true">
                                {it.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={it.thumbnail} alt="" />
                                ) : (
                                    <Package size={20} strokeWidth={1.5} />
                                )}
                            </span>
                            <span className="gt-line-t">
                                <b>{it.productTitle}</b>
                                <small>
                                    {it.variantTitle && it.variantTitle !== 'Default' ? `${it.variantTitle} · ` : ''}Qty {it.quantity}
                                </small>
                            </span>
                            <span className="gt-line-v g-w">{formatMoney(it.total, currency)}</span>
                        </li>
                    ))}
                </ul>
                <ul className="gt-sum">
                    <SumRow label="Subtotal" value={formatMoney(cart.subtotal, currency)} />
                    <SumRow label="Shipping" value={shippingSet ? formatMoney(cart.shippingTotal, currency) : '—'} />
                    {shippingSet && cart.taxTotal ? <SumRow label="Tax" value={formatMoney(cart.taxTotal, currency)} /> : null}
                    <SumRow label="Total" value={shippingSet ? formatMoney(cart.total, currency) : 'After shipping'} strong plain={!shippingSet} />
                </ul>
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
        <section
            className={`g-card gt-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}${!active && !done ? ' is-idle' : ''}`}
            aria-label={`Step ${n} of 3: ${title}`}
            aria-current={active ? 'step' : undefined}
        >
            <div className="gt-step-h">
                <span className="gt-step-n" aria-hidden="true">
                    {done ? <Check size={18} strokeWidth={2.6} /> : n}
                </span>
                <h2>{title}</h2>
                {done && onEdit ? (
                    <button type="button" onClick={onEdit} className="g-link">
                        <Pencil size={15} strokeWidth={2} aria-hidden="true" />
                        Edit
                    </button>
                ) : null}
            </div>
            {children}
        </section>
    );
}

function Field({
    label,
    ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <label className="gt-fld">
            <span>{label}</span>
            <input {...props} />
        </label>
    );
}

function Row2({ children }: { children: React.ReactNode }) {
    return <div className="gt-fsp">{children}</div>;
}

function SumRow({ label, value, strong, plain }: { label: string; value: string; strong?: boolean; plain?: boolean }) {
    return (
        <li className={strong ? 'is-all' : undefined}>
            <span>{label}</span>
            <span className={plain ? 'gt-plain' : 'g-w'}>{value}</span>
        </li>
    );
}


/**
 * One-tap wallets (Apple Pay, Google Pay, Link) above the card form, via
 * Stripe's Express Checkout Element. It lives in its own deferred-mode
 * <Elements> (amount/currency known up front); on confirm it creates the same
 * Medusa payment session the card form uses and confirms that PaymentIntent
 * with the wallet. Which wallets appear is decided by the Stripe account's
 * payment-method settings and the device; with none available it renders
 * nothing and the card form works as before.
 */
type ExpressPayProps = {
    stripePromise: Promise<Stripe | null>;
    amountMinor: number;
    currency: string;
    theme: string;
    canPay: () => boolean;
    initSession: CheckoutActions['initStripePaymentSession'];
    onStart: () => void;
    onFail: (msg: string) => void;
    onAuthorized: () => Promise<void>;
};

function ExpressPay(props: ExpressPayProps) {
    if (!(props.amountMinor > 0)) return null;
    return (
        <Elements
            key={`${props.amountMinor}-${props.theme}`}
            stripe={props.stripePromise}
            options={{
                mode: 'payment',
                amount: props.amountMinor,
                currency: props.currency.toLowerCase(),
                appearance: { theme: props.theme === 'light' ? 'stripe' : 'night' },
            }}
        >
            <ExpressPayInner {...props} />
        </Elements>
    );
}

const IN_PLACE_WALLETS: string[] = ['apple_pay', 'google_pay', 'link'];
// onReady reports availability in camelCase; click events use snake_case.
const WALLET_READY_KEY: Record<string, string> = { apple_pay: 'applePay', google_pay: 'googlePay', link: 'link' };

function ExpressPayInner(props: ExpressPayProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [available, setAvailable] = useState(false);
    return (
        <div style={{ display: available ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
            <ExpressCheckoutElement
                options={{
                    buttonHeight: 48,
                    buttonType: { applePay: 'buy', googlePay: 'buy' },
                    // Only wallets that confirm in place. Redirect flows (Amazon Pay,
                    // PayPal, Klarna) would return to checkout with the cart never
                    // completed; Klarna has no option in these typings, so onClick
                    // also refuses anything outside IN_PLACE_WALLETS.
                    // klarna is accepted by Stripe.js at runtime but missing from these typings.
                    paymentMethods: { amazonPay: 'never', paypal: 'never', klarna: 'never' } as ExpressCheckoutPaymentMethodsOption,
                }}
                onReady={(e) => {
                    const m = e.availablePaymentMethods as Record<string, boolean> | undefined;
                    setAvailable(!!m && IN_PLACE_WALLETS.some((k) => m[WALLET_READY_KEY[k]]));
                }}
                onClick={(e) => {
                    if (!IN_PLACE_WALLETS.includes(e.expressPaymentType)) {
                        props.onFail('Use Apple Pay, Google Pay, Link or a card for this order.');
                        return;
                    }
                    if (props.canPay()) e.resolve();
                }}
                onConfirm={async () => {
                    if (!stripe || !elements) return props.onFail('Payment is still loading. One sec…');
                    props.onStart();
                    const { error: submitErr } = await elements.submit();
                    if (submitErr) return props.onFail(submitErr.message ?? 'Payment was not completed.');
                    const initRes = await props.initSession();
                    if (!initRes.ok || !initRes.data) return props.onFail(initRes.ok ? 'Could not start payment.' : initRes.error);
                    const { error, paymentIntent } = await stripe.confirmPayment({
                        elements,
                        clientSecret: initRes.data.clientSecret,
                        confirmParams: { return_url: window.location.href },
                        redirect: 'if_required',
                    });
                    const ok =
                        !error &&
                        paymentIntent &&
                        (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture');
                    if (!ok) return props.onFail(error?.message || 'Payment was not authorized.');
                    await props.onAuthorized();
                }}
            />
            <div className="gt-or">Or pay with card</div>
        </div>
    );
}
