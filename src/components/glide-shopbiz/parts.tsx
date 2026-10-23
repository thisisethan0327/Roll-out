/**
 * Small Glide pieces for the shop console's business pages. Server-safe (no
 * hooks), so server pages and client forms share them. Styling:
 * ./biz.module.css plus the /me console's module for heads, cards and fields.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import cs from '@/components/glide-console/console.module.css';
import b from './biz.module.css';

export { b as bizStyles };

export function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** A notice line (g-note). `bad` puts the red on the icon only, never the text. */
export function Notice({
    tone = 'info',
    icon,
    children,
    action,
    live,
}: {
    tone?: 'info' | 'ok' | 'bad';
    icon?: ReactNode;
    children: ReactNode;
    action?: ReactNode;
    /** Announce it (a result that appears after an action). */
    live?: boolean;
}) {
    const ic = { size: 20, strokeWidth: 2, 'aria-hidden': true } as const;
    const glyph = icon ?? (tone === 'ok' ? <CircleCheck {...ic} /> : tone === 'bad' ? <CircleAlert {...ic} /> : <Info {...ic} />);
    return (
        <div
            className={cx('g-note', b.note, tone === 'bad' && b.noteBad, action ? b.noteSplit : null)}
            role={live ? (tone === 'bad' ? 'alert' : 'status') : undefined}
        >
            {glyph}
            <span className={b.noteBody}>{children}</span>
            {action}
        </div>
    );
}

/** The G3 count strip inside a card: label over a Michroma number. Real counts only. */
export function CountStrip({ items, label }: { items: { label: string; value: ReactNode }[]; label: string }) {
    return (
        <section className="g-card" aria-label={label}>
            <ul className={cx(cs.cnt, b.cntWrap)} style={{ borderTop: 0 }}>
                {items.map((it) => (
                    <li key={it.label}>
                        <small>{it.label}</small>
                        <b>{it.value}</b>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** A 44px filter chip that is a link (server-rendered filters). */
export function FilterLink({ href, on, children }: { href: string; on: boolean; children: ReactNode }) {
    return (
        <Link href={href} className={b.fchip} aria-current={on ? 'page' : undefined}>
            {children}
        </Link>
    );
}

/** An empty table / list body inside a card. */
export function CardEmpty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
    return (
        <div className={cs.empty}>
            <span className="g-ic" aria-hidden="true">
                {icon}
            </span>
            <b>{title}</b>
            {body ? <p>{body}</p> : null}
            {action ? <div className={cs.emptyAct}>{action}</div> : null}
        </div>
    );
}
