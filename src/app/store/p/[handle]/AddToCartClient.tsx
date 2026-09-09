'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { MedusaVariant } from '@/lib/medusa-types';
import { Dots } from '../../_ui';

type Props = {
    paused: boolean;
    /** Configured on unityusa.co — no purchase path here. */
    needsConfigurator: boolean;
    configuratorUrl: string;
    /** Dealer-only AND this visitor is not a dealer — explain, do not offer. */
    dealerLocked: boolean;
    dealerSignedIn: boolean;
    options: { title: string; values: string[] }[];
    variants: MedusaVariant[];
    currency: string | null;
};

/**
 * Variant picker + add-to-cart. When paused, renders a disabled COMING SOON
 * control and no purchase path.
 *
 * When the product needs a CONFIGURATOR it renders no purchase path either, and
 * sends the customer to unityusa.co. A pre-cut kit is plotted per vehicle and
 * Printable PPF is printed from artwork; both are collected at add-to-cart on
 * unityusa.co and written onto the line item, which is where the backend reads
 * them to open a print job. Adding one here would take money for work UNITY
 * cannot do. The cart action refuses these too — hidden is not forbidden.
 */
export function AddToCartClient({
    paused,
    dealerLocked,
    dealerSignedIn,
    needsConfigurator,
    configuratorUrl,
    options,
    variants,
    currency,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(false);
    const [justAdded, setJustAdded] = useState(false);

    // "Default" single-variant products have one no-op option — skip the UI.
    const realOptions = options.filter(
        (o) => !(o.values.length === 1 && o.values[0] === 'Default'),
    );

    const [selection, setSelection] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const o of realOptions) if (o.values[0]) init[o.title] = o.values[0];
        return init;
    });

    const selectedVariant = useMemo<MedusaVariant | null>(() => {
        if (variants.length === 1) return variants[0];
        return (
            variants.find((v) =>
                realOptions.every((o) => v.optionValues[o.title] === selection[o.title]),
            ) ?? null
        );
    }, [variants, realOptions, selection]);

    // PAUSED WINS, and it is checked first.
    //
    // I had the dealer and configurator branches ahead of it, reasoning that a
    // dealer can buy the product today so "coming soon" would be false. That
    // was wrong: `paused` is a PRODUCT-level flag and the cart refuses a paused
    // line for everyone, dealer or not, on every storefront. So while a product
    // is paused, "sold through UNITY dealers" invites a dealer to try something
    // that cannot work, and "configure on unityusa.co" sends a buyer somewhere
    // it is equally unbuyable. The canary caught this rendering both messages
    // at once (2026-09-09): a gold COMING SOON badge beside "Sold through UNITY
    // dealers", which are two different reasons and cannot both be the answer.
    //
    // The other two are the reasons you CANNOT buy something that is otherwise
    // on sale, so they matter only once the product is live.
    if (paused) {
        return (
            <button type="button" className="btn btn-lg" disabled style={{ opacity: 0.55, cursor: 'not-allowed', width: '100%' }}>
                COMING SOON
            </button>
        );
    }

    // Not paused, but not for this visitor: a dealer buys this normally.
    if (dealerLocked) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                    style={{
                        border: '1px solid var(--line)',
                        background: 'var(--bg-2)',
                        padding: '12px 14px',
                        fontSize: 13,
                        lineHeight: 1.5,
                    }}
                >
                    Sold through UNITY dealers.{' '}
                    {dealerSignedIn
                        ? 'Your account is not a dealer account yet.'
                        : 'Sign in to your dealer account,'}{' '}
                    <a
                        href="https://unityusa.co/us/dealers"
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: 'underline', color: 'var(--text)' }}
                    >
                        apply on unityusa.co
                    </a>
                    .
                </div>
            </div>
        );
    }

    // Not paused: the customer can buy this today, just not here.
    if (needsConfigurator) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a
                    href={configuratorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-lg"
                    style={{ width: '100%', textAlign: 'center' }}
                >
                    CONFIGURE ON UNITYUSA.CO
                </a>
                <span className="text-dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    This kit is cut to your vehicle, so it is configured on unityusa.co.
                </span>
            </div>
        );
    }

    const onAdd = () => {
        if (pending) return; // guard against double-submit
        setError(null);
        setAdded(false);
        if (!selectedVariant) {
            setError('Select an option first.');
            return;
        }
        startTransition(async () => {
            const res = await addToCart(selectedVariant.id, 1);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setAdded(true);
            setJustAdded(true);
            setTimeout(() => setJustAdded(false), 1900);
            router.refresh();
        });
    };

    const soldOut = selectedVariant ? !selectedVariant.inStock : false;
    const priceText = selectedVariant
        ? formatMoney(selectedVariant.price, selectedVariant.currency ?? currency)
        : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {realOptions.map((o) => (
                <div key={o.title}>
                    <div className="eyebrow mb-4">{o.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {o.values.map((val) => {
                            const active = selection[o.title] === val;
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setSelection((s) => ({ ...s, [o.title]: val }))}
                                    className="font-display"
                                    style={{
                                        fontSize: 12,
                                        letterSpacing: 1,
                                        padding: '9px 16px',
                                        border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                                        background: active ? 'var(--gold-dim)' : 'transparent',
                                        color: active ? 'var(--gold)' : 'var(--text-2)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            <button
                type="button"
                className="btn btn-lg"
                onClick={onAdd}
                disabled={pending || soldOut || (!selectedVariant && variants.length > 1)}
                style={{ width: '100%' }}
            >
                {pending ? (
                    <>ADDING<Dots /></>
                ) : justAdded ? (
                    'ADDED ✓'
                ) : soldOut ? (
                    'COMING SOON'
                ) : priceText ? (
                    `ADD TO CART · ${priceText}`
                ) : (
                    'ADD TO CART'
                )}
            </button>

            {added ? (
                <div className="mono-row" style={{ fontSize: 12 }}>
                    <span className="accent">✓ ADDED</span>
                    <span className="sep" />
                    <a href="/store/cart" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        VIEW CART →
                    </a>
                </div>
            ) : null}

            {error ? (
                <p style={{ color: 'var(--danger, #ff6b6b)', fontSize: 13, margin: 0 }}>{error}</p>
            ) : null}
        </div>
    );
}
