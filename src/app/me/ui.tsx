/**
 * Small presentational helpers shared across /me pages. Server-safe (no client
 * hooks) — pure rendering. Styling matches the shop dashboard's HUD look via
 * the shared CSS custom properties.
 */
import Link from 'next/link';
import { formatDateTime } from '@/lib/event-time';

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    // No timeZone here meant the SERVER's zone (UTC on Coolify) with no label:
    // "3:00 PM" on /me for an event the event page called 8:00 AM PT (R12).
    return formatDateTime(d);
}

export function fmtDay(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function money(amount: number | null | undefined): string {
    if (amount == null) return '—';
    return `$${Number(amount).toFixed(2)}`;
}

type PillVariant = '' | 'gold' | 'neon' | 'warn';

export function statusVariant(status: string | null | undefined): PillVariant {
    const s = (status ?? '').toLowerCase();
    if (['pending', 'quote', 'estimate', 'reschedule', 'requested', 'draft', 'sent'].includes(s)) return 'gold';
    if (['accepted', 'in-progress', 'in_progress', 'completed', 'converted', 'going', 'paid', 'confirmed'].includes(s))
        return 'neon';
    if (['cancelled', 'canceled', 'declined', 'overdue', 'not_going', 'void'].includes(s)) return 'warn';
    return '';
}

export function StatusPill({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    return (
        <span className={`admin-pill ${statusVariant(status)}`}>
            {String(status).replace(/_/g, ' ').toUpperCase()}
        </span>
    );
}

export function Panel({
    title,
    href,
    hrefLabel,
    children,
}: {
    title: string;
    href?: string;
    hrefLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-widest)',
                        color: 'var(--text-3)',
                    }}
                >
                    {title}
                </div>
                {href && (
                    <Link
                        href={href}
                        className="text-link"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        {hrefLabel ?? 'VIEW'} ›
                    </Link>
                )}
            </div>
            {children}
        </section>
    );
}

export type EmptyArt = 'empty-meets' | 'empty-orders' | 'empty-garage' | 'empty-shops' | 'code-sent' | '404';

/** An empty row, optionally with one of the gold-line illustrations above the text. */
export function EmptyRow({ text, art }: { text: string; art?: EmptyArt }) {
    if (!art) return <div className="admin-empty">{text}</div>;
    return (
        <div className="admin-empty empty-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/illo/${art}.svg`} alt="" width={160} height={120} loading="lazy" />
            <div>{text}</div>
        </div>
    );
}

export function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 12, lineHeight: 1.5 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 9,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--text-3)',
                    paddingTop: 2,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    fontFamily: mono ? 'var(--font-mono, monospace)' : 'var(--font-body)',
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </div>
        </div>
    );
}
