/**
 * Glide pieces for the tickets lane (tickets, checkout, store, orders).
 * Server-safe: no hooks. Stepper takes callbacks, so it is only rendered from
 * client components. Styles: ./tickets.css (classes prefixed `gt-`).
 */
import './tickets.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check, ChevronLeft, CircleAlert, CircleX, Clock, Minus, Plus, ShoppingBag } from 'lucide-react';

function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** Page title block: optional back link, display title, sub-line, actions on the right. */
export function PageHead({
    title,
    code,
    sub,
    meta,
    back,
    actions,
}: {
    title: ReactNode;
    /** Title is an id or code (Michroma, not uppercase display). */
    code?: boolean;
    sub?: ReactNode;
    meta?: ReactNode;
    back?: { href: string; label: string };
    actions?: ReactNode;
}) {
    return (
        <header className="gt-head">
            <div className="gt-head-t">
                {back ? <BackLink href={back.href} label={back.label} /> : null}
                <h1 className={code ? 'gt-code' : undefined}>{title}</h1>
                {sub ? <p>{sub}</p> : null}
                {meta ? <div className="gt-head-meta">{meta}</div> : null}
            </div>
            {actions ? <div className="gt-head-acts">{actions}</div> : null}
        </header>
    );
}

export function BackLink({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href} className="g-link gt-back">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            {label}
        </Link>
    );
}

type Tone = 'ok' | 'wait' | 'off' | 'plain';

/**
 * Status chip. `tone` comes from the caller's own status mapping (the /me
 * pages pass statusVariant's verdict), so the meaning of a status is never
 * re-decided here.
 */
export function StatusChip({ label, tone = 'plain' }: { label: string; tone?: Tone }) {
    const icon =
        tone === 'ok' ? (
            <Check size={14} strokeWidth={2.4} aria-hidden="true" />
        ) : tone === 'wait' ? (
            <Clock size={14} strokeWidth={2} aria-hidden="true" />
        ) : tone === 'off' ? (
            <CircleX size={14} strokeWidth={2} aria-hidden="true" />
        ) : null;
    return (
        <span className={cx('gt-status', tone === 'ok' && 'gt-status--ok', tone === 'off' && 'gt-status--off')}>
            {icon}
            {label}
        </span>
    );
}

/** "in_progress" → "In progress". */
export function statusLabel(status: string): string {
    const s = String(status).replace(/[_-]+/g, ' ').trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The /me helpers' statusVariant verdict ('' | gold | neon | warn) as a chip tone. */
export function toneFromVariant(v: string): Tone {
    if (v === 'neon') return 'ok';
    if (v === 'gold') return 'wait';
    if (v === 'warn') return 'off';
    return 'plain';
}

/** An error line: ink text with an alert icon (red is never text). */
export function ErrorLine({ children, live = true }: { children: ReactNode; live?: boolean }) {
    return (
        <p className="gt-err" role={live ? 'alert' : undefined}>
            <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

/** Quantity stepper (G2 .stp). Client-only: it takes callbacks. */
export function Stepper({
    value,
    min = 1,
    max,
    onChange,
    disabled,
    label,
    line,
}: {
    value: number;
    min?: number;
    max: number;
    onChange: (next: number) => void;
    disabled?: boolean;
    /** What is being counted, for the button names ("tickets"). */
    label: string;
    line?: boolean;
}) {
    return (
        <span className={cx('gt-stp', line && 'gt-stp--line')} role="group" aria-label={`${label[0].toUpperCase()}${label.slice(1)}`}>
            <button type="button" aria-label={`Fewer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
                <Minus size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <output aria-live="polite">{value}</output>
            <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
                <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
        </span>
    );
}

/** The big check roundel with tricolore rings ("You're in"). */
export function OkRoundel({ waiting }: { waiting?: boolean }) {
    return (
        <span className={cx('gt-ok', waiting && 'gt-ok--wait')} aria-hidden="true">
            {waiting ? <Clock size={38} strokeWidth={2} /> : <Check size={40} strokeWidth={2.4} />}
        </span>
    );
}

/** Floating cart pill with the live line count (server-rendered count). */
export function CartPill({ count }: { count: number }) {
    return (
        <Link href="/store/cart" className="gt-cartpill g-fp" aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}>
            <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />
            Cart
            {count > 0 ? <span className="g-w" aria-hidden="true">{count}</span> : null}
        </Link>
    );
}

/** Empty state: icon roundel, heading, line, optional action. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="g-card gt-empty">
            <span className="g-ic" aria-hidden="true">
                {icon}
            </span>
            <h2>{title}</h2>
            {children ? <p>{children}</p> : null}
            {action}
        </div>
    );
}

/** A shimmering block for loading.tsx skeletons. */
export function Skel({ w = '100%', h = 16, r, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
    return <span className="gt-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
