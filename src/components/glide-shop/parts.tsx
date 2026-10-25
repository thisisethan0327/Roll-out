/**
 * Glide shop console parts: count strip, filter track, search bar, panel,
 * definition rows, status chip, empty table row, notice. Server-safe (no
 * hooks), so server pages and client components can both use them.
 *
 * Styling: ./shop.module.css. Page heads use ConsoleHead from the /me console
 * kit (src/components/glide-console/parts.tsx). Boards: G3, G5, G6.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HeadSub } from '@/components/glide/head';
import { CircleCheck, CircleDashed, CircleX, Clock, Search } from 'lucide-react';
import { EmptyState, type EmptyStateProps } from '@/components/glide/EmptyState';
import s from './shop.module.css';

export { s as shopStyles };

export function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** A quiet count strip (G3 `.cnt`): label over a Michroma number. `dot` marks a count that wants attention. */
export function Counts({ items, label }: { items: { label: string; value: ReactNode; dot?: boolean }[]; label?: string }) {
    return (
        <ul className={s.counts} aria-label={label}>
            {items.map((it) => (
                <li key={it.label}>
                    <small>{it.label}</small>
                    <b>
                        {it.dot ? <i aria-hidden="true" /> : null}
                        {it.value}
                    </b>
                </li>
            ))}
        </ul>
    );
}

/** Filter links drawn as the segmented track; the current one is aria-current. */
export function FilterTabs({
    label,
    items,
}: {
    label: string;
    items: { href: string; label: ReactNode; active: boolean; count?: number }[];
}) {
    return (
        <nav className={s.tabs} aria-label={label}>
            {items.map((it) => (
                <Link key={it.href} href={it.href} aria-current={it.active ? 'page' : undefined} scroll={false}>
                    {it.label}
                    {it.count != null ? <span>{it.count}</span> : null}
                </Link>
            ))}
        </nav>
    );
}

/**
 * A GET search form as a pill field with a search icon. `hidden` keeps the
 * other query params; `clearHref` adds a Clear link while a query is set.
 */
export function SearchBar({
    action,
    defaultValue,
    placeholder,
    label,
    hidden,
    clearHref,
}: {
    action: string;
    defaultValue?: string;
    placeholder: string;
    label: string;
    hidden?: Record<string, string | undefined>;
    clearHref?: string | null;
}) {
    return (
        <form action={action} className={s.search} role="search">
            {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <label className={s.searchField}>
                <span className="g-sr">{label}</span>
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <input name="q" type="search" defaultValue={defaultValue ?? ''} placeholder={placeholder} />
            </label>
            <button type="submit" className={cx('g-sec', s.searchBtn)}>
                Search
            </button>
            {clearHref ? (
                <Link href={clearHref} className="g-link" style={{ padding: '0 6px' }}>
                    Clear
                </Link>
            ) : null}
        </form>
    );
}

/** A card section with a Chakra heading, optional sub line, count and action. */
export function Panel({
    id,
    title,
    sub,
    count,
    action,
    flush,
    edge,
    className,
    children,
}: {
    id?: string;
    title: ReactNode;
    sub?: HeadSub;
    count?: number;
    action?: ReactNode;
    flush?: boolean;
    edge?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const hid = id ? `${id}-h` : undefined;
    return (
        <section className={cx('g-card', edge && 'g-edge', s.panel, className)} aria-labelledby={hid} id={id}>
            <div className={s.panelH}>
                <div style={{ minWidth: 0 }}>
                    <h2 id={hid}>
                        {title}
                        {count != null && count > 0 ? <span className={s.count}>{count}</span> : null}
                    </h2>
                    {sub ? <p>{sub}</p> : null}
                </div>
                {action}
            </div>
            <div className={flush ? s.panelFlush : s.panelBody}>{children}</div>
        </section>
    );
}

/** Key · value rows. `wide` sets the value in Michroma (codes, money, dates). */
export function KVList({ rows }: { rows: { k: ReactNode; v: ReactNode; wide?: boolean }[] }) {
    return (
        <dl className={s.kv}>
            {rows.map((r, i) => (
                <div key={i} style={{ display: 'contents' }}>
                    <dt>{r.k}</dt>
                    <dd className={r.wide ? s.w : undefined}>{r.v}</dd>
                </div>
            ))}
        </dl>
    );
}

export type Tone = 'pos' | 'wait' | 'off' | 'none';

/** Map a console status word onto a chip tone. Never red text (DESIGN.md). */
export function toneFor(status: string | null | undefined): Tone {
    const v = (status ?? '').toLowerCase();
    if (['accepted', 'in-progress', 'in_progress', 'completed', 'converted', 'confirmed', 'paid', 'published', 'live', 'going', 'active', 'verified'].includes(v))
        return 'pos';
    if (['pending', 'quote', 'estimate', 'reschedule_requested', 'requested', 'draft', 'sent', 'upcoming', 'maybe', 'invited', 'waitlist', 'rush'].includes(v))
        return 'wait';
    if (['cancelled', 'canceled', 'declined', 'void', 'archived', 'past', 'not_going', 'rejected', 'suspended', 'ended'].includes(v)) return 'off';
    return 'none';
}

function sentence(t: string): string {
    const x = t.replace(/[_]+/g, ' ').replace(/-/g, ' ').trim().toLowerCase();
    return x.charAt(0).toUpperCase() + x.slice(1);
}

/** A status as a Glide chip: tint + check (done), clock (waiting), cross (closed). */
export function StatusChip({ status, label }: { status: string | null | undefined; label?: string }) {
    if (!status) return <span className={s.muted}>—</span>;
    const tone = toneFor(status);
    const ic = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;
    const text = label ?? sentence(status);
    if (tone === 'pos')
        return (
            <span className="g-chip g-chip--tint">
                <CircleCheck {...ic} />
                {text}
            </span>
        );
    if (tone === 'wait')
        return (
            <span className="g-chip">
                <Clock {...ic} />
                {text}
            </span>
        );
    if (tone === 'off')
        return (
            <span className="g-chip" style={{ color: 'var(--ink-2)' }}>
                <CircleX {...ic} />
                {text}
            </span>
        );
    return (
        <span className="g-chip">
            <CircleDashed {...ic} />
            {text}
        </span>
    );
}

/** A full-width empty row inside a quiet table: the kit EmptyState (no body prop). */
export function EmptyRow({ colSpan, ...rest }: EmptyStateProps & { colSpan: number }) {
    return (
        <tr className={s.emptyRow}>
            <td colSpan={colSpan}>
                <EmptyState {...rest} look={{ root: s.tblEmpty, smallIcon: true, inline: true }} />
            </td>
        </tr>
    );
}

/** Initials for an avatar roundel. */
export function initials(name: string | null | undefined): string {
    const parts = (name ?? '').replace(/^@+/, '').replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * "Oct 25, 17:30" for console tables: the same instant and zone the console
 * always showed (UTC, from toISOString), written for people. The year shows
 * only when it is not this year.
 */
export function fmtWhen(iso: string | null | undefined, withTime = true): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
    const date = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
        timeZone: 'UTC',
    });
    if (!withTime) return date;
    return `${date}, ${d.toISOString().slice(11, 16)}`;
}

/** A date-only "YYYY-MM-DD" value (service_day etc.) as "Oct 25". */
export function fmtDay(ymd: string | null | undefined): string {
    if (!ymd) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    if (!m) return ymd;
    return fmtWhen(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`, false);
}
