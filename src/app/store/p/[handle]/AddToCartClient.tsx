'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { MedusaVariant } from '@/lib/medusa-types';
import { Dots } from '../../_ui';

type Props = {
    paused: boolean;
    options: { title: string; values: string[] }[];
    variants: MedusaVariant[];
    currency: string | null;
};

/** Variant picker + add-to-cart. When paused, renders a disabled COMING SOON
 * control and no purchase path. */
export function AddToCartClient({ paused, options, variants, currency }: Props) {
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

    if (paused) {
        return (
            <button type="button" className="btn btn-lg" disabled style={{ opacity: 0.55, cursor: 'not-allowed', width: '100%' }}>
                COMING SOON
            </button>
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
                    'SOLD OUT'
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
