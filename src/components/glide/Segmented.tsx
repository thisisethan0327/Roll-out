'use client';
/**
 * Segmented control (R5 `.seg`): a radio group drawn as a pill track. Arrow
 * keys move the selection, as a native radio group would; only the selected
 * option is in the tab order.
 */
import { useRef, type ReactNode } from 'react';

export type SegOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

export function Segmented<T extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    /** Accessible name of the group. */
    label: string;
    value: T;
    options: SegOption<T>[];
    onChange: (next: T) => void;
    className?: string;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const enabled = options.filter((o) => !o.disabled);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(e.key) || enabled.length === 0) return;
        e.preventDefault();
        const at = enabled.findIndex((o) => o.value === value);
        let next = at;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = enabled.length - 1;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % enabled.length;
        else next = (at - 1 + enabled.length) % enabled.length;
        const opt = enabled[next];
        onChange(opt.value);
        refs.current[options.indexOf(opt)]?.focus();
    };

    return (
        <div role="radiogroup" aria-label={label} className={['g-seg', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>
            {options.map((o, i) => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-disabled={o.disabled || undefined}
                        tabIndex={on ? 0 : -1}
                        onClick={() => {
                            if (!o.disabled && !on) onChange(o.value);
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
