/**
 * Glide console parts for the signed-in /me pages: page head, card head,
 * status chip, empty state and the form field. Server-safe (no hooks), so
 * both server pages and client forms can use them.
 *
 * Styling: ./console.module.css. Board references: G3 (web host console),
 * G4 (You, garage), G7 (Settings).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, CircleCheck, CircleDashed, CircleX, Clock } from 'lucide-react';
import { statusVariant } from '@/app/me/ui';
import s from './console.module.css';

export { s as consoleStyles };

function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** Page title with an optional back link, sub line and actions. No eyebrow. */
export function ConsoleHead({
    title,
    sub,
    back,
    actions,
}: {
    title: ReactNode;
    sub?: ReactNode;
    back?: { href: string; label: string };
    actions?: ReactNode;
}) {
    return (
        <header className={s.head}>
            <div style={{ minWidth: 0 }}>
                {back ? (
                    <Link href={back.href} className={cx('g-link', s.back)}>
                        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                        {back.label}
                    </Link>
                ) : null}
                <h1>{title}</h1>
                {sub ? <p>{sub}</p> : null}
            </div>
            {actions ? <div className={s.headActs}>{actions}</div> : null}
        </header>
    );
}

/** Card heading row: Chakra title, optional sub line and an action on the right. */
export function CardHead({ id, title, sub, action }: { id?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
    return (
        <div className={s.cardH}>
            <div style={{ minWidth: 0 }}>
                <h2 id={id}>{title}</h2>
                {sub ? <p>{sub}</p> : null}
            </div>
            {action}
        </div>
    );
}

function sentence(status: string): string {
    const t = status.replace(/[_-]+/g, ' ').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * A status as a Glide chip. Positive states take the tint; waiting states a
 * clock; closed states a muted chip. Never red text (DESIGN.md).
 */
export function StatusChip({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    const v = statusVariant(status);
    const ic = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;
    if (v === 'neon') {
        return (
            <span className={cx('g-chip g-chip--tint', s.status)}>
                <CircleCheck {...ic} />
                {sentence(status)}
            </span>
        );
    }
    if (v === 'gold') {
        return (
            <span className={cx('g-chip', s.status)}>
                <Clock {...ic} />
                {sentence(status)}
            </span>
        );
    }
    if (v === 'warn') {
        return (
            <span className={cx('g-chip', s.status, s.statusMuted)}>
                <CircleX {...ic} />
                {sentence(status)}
            </span>
        );
    }
    return (
        <span className={cx('g-chip', s.status)}>
            <CircleDashed {...ic} />
            {sentence(status)}
        </span>
    );
}

/** An empty state that says what goes here and how to get it. */
export function Empty({
    icon,
    title,
    body,
    action,
    center,
}: {
    icon: ReactNode;
    title: string;
    body?: ReactNode;
    action?: ReactNode;
    center?: boolean;
}) {
    return (
        <div className={cx(s.empty, center && s.emptyCenter)}>
            <span className="g-ic" aria-hidden="true">
                {icon}
            </span>
            <b>{title}</b>
            {body ? <p>{body}</p> : null}
            {action ? <div className={s.emptyAct}>{action}</div> : null}
        </div>
    );
}

/** Label + control + hint, stacked. Pass the control as children. */
export function Field({
    label,
    htmlFor,
    hint,
    children,
    className,
}: {
    label: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cx(s.field, className)}>
            <label className={s.label} htmlFor={htmlFor}>
                {label}
            </label>
            {children}
            {hint ? <p className={s.hint}>{hint}</p> : null}
        </div>
    );
}

/** A form section as a card: heading, optional sub line, then the fields. */
export function FormSection({
    id,
    title,
    sub,
    action,
    children,
    edge,
}: {
    id: string;
    title: ReactNode;
    sub?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    edge?: boolean;
}) {
    return (
        <section className={cx('g-card', edge && 'g-edge', s.fsec)} aria-labelledby={`${id}-h`} id={id}>
            <CardHead id={`${id}-h`} title={title} sub={sub} action={action} />
            <div className={cx(s.cardBody, s.form)}>{children}</div>
        </section>
    );
}
