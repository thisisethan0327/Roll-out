/**
 * Glide admin parts: page head, section head, filter tabs, label/value list
 * and the copy helper the /admin pages share. Server-safe (no hooks).
 *
 * Styling: ./admin.module.css. Board references: G3 (host console), G5.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import s from './admin.module.css';

export { s as adminStyles };

export function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** snake/kebab/upper data values ("in_review", "NIGHT_RUN") as sentence case. */
export function sentence(v: string | null | undefined): string {
    const t = String(v ?? '').replace(/[_-]+/g, ' ').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Page title (Chakra), optional back link, sub line and actions. No eyebrow. */
export function AdminHead({
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
                    <Link href={back.href} className={s.back}>
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

/** Section head: Chakra h2, optional sub line and an action on the right. */
export function SectionHead({
    id,
    title,
    sub,
    action,
}: {
    id?: string;
    title: ReactNode;
    sub?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className={s.sec} id={id} style={id ? { scrollMarginTop: 96 } : undefined}>
            <div style={{ minWidth: 0 }}>
                <h2>{title}</h2>
                {sub ? <p>{sub}</p> : null}
            </div>
            {action}
        </div>
    );
}

/** Filter tabs as links; the current one is the navy roundel pill. */
export function Tabs({
    label,
    items,
}: {
    label: string;
    items: { href: string; label: ReactNode; count?: number | null; current: boolean }[];
}) {
    return (
        <nav className={s.tabs} aria-label={label}>
            {items.map((t) => (
                <Link key={t.href} href={t.href} className={s.tab} aria-current={t.current ? 'page' : undefined}>
                    {t.label}
                    {t.count != null ? <b>{t.count}</b> : null}
                </Link>
            ))}
        </nav>
    );
}

/** Label / value list in a card. */
export function DefList({ rows, label }: { rows: { k: ReactNode; v: ReactNode; key?: string }[]; label?: string }) {
    return (
        <div className={s.card} aria-label={label}>
            <dl className={s.dl}>
                {rows.map((r, i) => (
                    <div key={r.key ?? i}>
                        <dt>{r.k}</dt>
                        <dd>{r.v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

/** A tile in the quiet stat strip (legacy admin-stat classes, restyled). */
export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className="admin-stat-num">{value}</div>
            {sub ? <div className="admin-stat-sub">{sub}</div> : null}
        </div>
    );
}
