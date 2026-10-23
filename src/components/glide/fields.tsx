/**
 * Glide form fields (docs/design/GLIDE.md, "Fields"). Server-safe: no state,
 * no effects; every control forwards its native props, so they work as
 * controlled or uncontrolled inputs and inside server-action forms.
 *
 *  - `Field`: label · control · hint or error, stacked (`.g-field`).
 *  - `Input`, `TextArea`, `Select`: the G3 field box (`.g-in`); `pill` gives
 *    the 56px round skin from the sign-in board (`.g-in--pill`).
 *  - `PillField`: the pill skin as a wrapper (`.g-pf`) for an input with an
 *    icon, a fixed prefix or a trailing button (`.g-pf-x`).
 *
 * Every outline uses `--field-line`, which keeps 3:1 against card, surface and
 * surface-2 in Light, Midnight and Graphite.
 */
import type { ComponentProps, ReactNode } from 'react';

function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** A label, the control (children) and an optional hint or error underneath. */
export function Field({
    label,
    htmlFor,
    hint,
    error,
    hintId,
    className,
    children,
}: {
    label: ReactNode;
    /** id of the control, so the label is clickable and named. */
    htmlFor?: string;
    hint?: ReactNode;
    /** Shown in place of the hint; give the control aria-invalid and aria-describedby={hintId}. */
    error?: ReactNode;
    /** id for the hint / error line, to point the control's aria-describedby at. */
    hintId?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cx('g-field', className)}>
            <label className="g-field-l" htmlFor={htmlFor}>
                {label}
            </label>
            {children}
            {error ? (
                <p className="g-field-e" id={hintId} role="alert">
                    {error}
                </p>
            ) : hint ? (
                <p className="g-field-h" id={hintId}>
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

type Skin = { pill?: boolean; className?: string };

export function Input({ pill, className, ...rest }: Skin & Omit<ComponentProps<'input'>, 'className'>) {
    return <input className={cx('g-in', pill && 'g-in--pill', className)} {...rest} />;
}

export function TextArea({ pill, className, ...rest }: Skin & Omit<ComponentProps<'textarea'>, 'className'>) {
    return <textarea className={cx('g-in', pill && 'g-in--pill', className)} {...rest} />;
}

export function Select({ pill, className, children, ...rest }: Skin & Omit<ComponentProps<'select'>, 'className'>) {
    return (
        <select className={cx('g-in', pill && 'g-in--pill', className)} {...rest}>
            {children}
        </select>
    );
}

/**
 * Pill field wrapper. Put the <input> (or <select>) in `children`; `icon`
 * leads, `prefix` is fixed text before the value, `trailing` is usually a
 * 44px `.g-pf-x` button (clear, reveal password).
 */
export function PillField({
    icon,
    prefix,
    trailing,
    invalid,
    className,
    children,
}: {
    icon?: ReactNode;
    prefix?: ReactNode;
    trailing?: ReactNode;
    invalid?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cx('g-pf', className)} data-invalid={invalid ? 'true' : undefined}>
            {icon}
            {prefix ? (
                <span className="g-pf-pre">{prefix}</span>
            ) : null}
            {children}
            {trailing}
        </div>
    );
}
