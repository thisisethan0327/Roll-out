/**
 * Glide primitives: the presentational pieces of the kit (docs/design/GLIDE.md,
 * "Components"). Server-safe — no state, no effects. The interactive pieces
 * (slide-to-act, segmented control, sheet, appearance) live in their own
 * client files.
 *
 * Every class here is defined in src/styles/glide.css and only renders
 * correctly inside a Glide scope (`.glide` or a `.glide-page`).
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

type ButtonLook = { size?: 'md' | 'sm'; block?: boolean; className?: string };

/**
 * The one primary style: a pill with a circle knob end cap and an arrow.
 * Renders a Next <Link> when given `href`, an <a> for external/plain hrefs
 * (`plain`), otherwise a <button>.
 */
export function GlideButton({
    href,
    plain,
    size = 'md',
    block,
    className,
    children,
    icon,
    ...rest
}: ButtonLook & {
    href?: string;
    /** Render a plain <a> (no client routing) — for /login?next=… style hand-offs. */
    plain?: boolean;
    icon?: ReactNode;
    children: ReactNode;
} & Omit<ComponentProps<'button'>, 'className' | 'children'>) {
    const cls = cx('g-btn', size === 'sm' && 'g-btn--sm', block && 'g-btn--block', className);
    const inner = (
        <>
            <span>{children}</span>
            <span className="g-btn-k" aria-hidden="true">
                {icon ?? <ArrowRight size={size === 'sm' ? 18 : 20} strokeWidth={2} />}
            </span>
        </>
    );
    if (href && plain) {
        return (
            <a href={href} className={cls}>
                {inner}
            </a>
        );
    }
    if (href) {
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" className={cls} {...rest}>
            {inner}
        </button>
    );
}

/** Secondary action: outlined pill, link-coloured. */
export function SecButton({
    href,
    external,
    className,
    children,
    ...rest
}: {
    href?: string;
    external?: boolean;
    className?: string;
    children: ReactNode;
} & Omit<ComponentProps<'button'>, 'className' | 'children'>) {
    const cls = cx('g-sec', className);
    if (href && external) {
        return (
            <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
                {children}
            </a>
        );
    }
    if (href) {
        return (
            <Link href={href} className={cls}>
                {children}
            </Link>
        );
    }
    return (
        <button type="button" className={cls} {...rest}>
            {children}
        </button>
    );
}

/** A card: rounded 28px, white (light) or `card` (dark). `edge` adds the tricolore edge stripe. */
export function Card({
    as: Tag = 'div',
    edge,
    pad,
    className,
    children,
    ...rest
}: {
    as?: 'div' | 'section' | 'aside' | 'article';
    edge?: boolean;
    pad?: boolean;
    className?: string;
    children: ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>) {
    return (
        <Tag className={cx('g-card', edge && 'g-edge', pad && 'g-card--pad', className)} {...rest}>
            {children}
        </Tag>
    );
}

/** A floating pill over photos: always opaque. */
export function FloatingPill({
    className,
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<ComponentProps<'div'>, 'className' | 'children'>) {
    return (
        <div className={cx('g-fp', className)} {...rest}>
            {children}
        </div>
    );
}

/** Pill chip. `tint` is the selected/positive state. */
export function Chip({
    icon,
    tint,
    large,
    href,
    children,
}: {
    icon?: ReactNode;
    tint?: boolean;
    large?: boolean;
    href?: string;
    children: ReactNode;
}) {
    const cls = cx('g-chip', tint && 'g-chip--tint', large && 'g-chip--lg');
    if (href) {
        return (
            <Link href={href} className={cls}>
                {icon}
                {children}
            </Link>
        );
    }
    return (
        <span className={cls}>
            {icon}
            {children}
        </span>
    );
}

/**
 * A plain list row: icon · label · sub-label · value · chevron. At least 52px
 * tall; rows group by spacing with a hairline between them.
 */
export function Row({
    icon,
    label,
    sub,
    value,
    trailing,
    href,
    external,
}: {
    icon?: ReactNode;
    label: ReactNode;
    sub?: ReactNode;
    value?: ReactNode;
    trailing?: ReactNode;
    href?: string;
    external?: boolean;
}) {
    const body = (
        <>
            {icon}
            <span className="g-row-t">
                <b>{label}</b>
                {sub ? <small>{sub}</small> : null}
            </span>
            {value ? <span className="g-row-v">{value}</span> : null}
            {trailing}
        </>
    );
    if (href && external) {
        return (
            <li>
                <a className="g-row" href={href} target="_blank" rel="noopener noreferrer">
                    {body}
                </a>
            </li>
        );
    }
    if (href) {
        return (
            <li>
                <Link className="g-row" href={href}>
                    {body}
                </Link>
            </li>
        );
    }
    return <li className="g-row">{body}</li>;
}

/** Date roundel: Michroma day number under a small label. `rings` = tricolore rings (selected / lead). */
export function DateRoundel({ top, day, rings = true, label }: { top: string; day: string; rings?: boolean; label?: string }) {
    return (
        <span className={cx('g-dt', rings && 'g-dt--rings')} role={label ? 'img' : undefined} aria-label={label}>
            <small aria-hidden={label ? true : undefined}>{top}</small>
            <b aria-hidden={label ? true : undefined}>{day}</b>
        </span>
    );
}

/** The tricolore stripe (light blue, navy, red). Decorative. */
export function Tricolore({ thin, className }: { thin?: boolean; className?: string }) {
    return <span className={cx('g-tri', thin && 'g-tri--thin', className)} aria-hidden="true" />;
}

/** Icon roundel: tinted circle around an icon. */
export function IconRoundel({ children, small }: { children: ReactNode; small?: boolean }) {
    return (
        <span className={cx('g-ic', small && 'g-ic--sm')} aria-hidden="true">
            {children}
        </span>
    );
}

/** Spots-taken bar with the tricolore fill. `value` 0..1. */
export function SpotsBar({ value, label }: { value: number; label: string }) {
    const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
    return (
        <span className="g-bar" role="img" aria-label={label}>
            <i style={{ width: `${Math.max(pct, pct > 0 ? 10 : 0)}%` }} />
        </span>
    );
}
