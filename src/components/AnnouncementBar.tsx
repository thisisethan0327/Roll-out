import Link from 'next/link';
import { isSafeLink, type Announcement } from '@/lib/announcements-core';
import { AnnouncementShell } from './AnnouncementShell';

/**
 * Time-bounded notices (rollout.announcements). Server component: the text is
 * rendered by React (escaped; plain text with line breaks only, never HTML).
 * `info` can be dismissed per browser (localStorage, see AnnouncementShell);
 * `warning` / `critical` cannot, and announce as role="alert".
 *
 * `variant="band"` is the full-width strip under the header; `variant="card"`
 * is the in-column version for the event page.
 */
const ICON: Record<Announcement['level'], string> = { info: '◉', warning: '▲', critical: '✕' };
const LABEL: Record<Announcement['level'], string> = { info: 'UPDATE', warning: 'HEADS UP', critical: 'IMPORTANT' };

function Cta({ url, label }: { url: string; label: string }) {
    if (!isSafeLink(url)) return null;
    const external = !url.startsWith('/');
    return external ? (
        <a className="btn ann-cta" href={url} target="_blank" rel="noopener noreferrer">
            {label}
        </a>
    ) : (
        <Link className="btn ann-cta" href={url}>
            {label}
        </Link>
    );
}

export function AnnouncementBar({
    announcements,
    variant = 'band',
}: {
    announcements: Announcement[];
    variant?: 'band' | 'card';
}) {
    if (announcements.length === 0) return null;
    const items = (
        <>
            {announcements.map((a) => {
                const dismissible = a.level === 'info';
                return (
                    <AnnouncementShell
                        key={a.id}
                        id={a.id}
                        dismissible={dismissible}
                        className={`ann ann-${a.level}`}
                        role={a.level === 'info' ? 'status' : 'alert'}
                    >
                        <span className="ann-icon" aria-hidden="true">
                            {ICON[a.level]}
                        </span>
                        <div className="ann-main">
                            <div className="ann-kicker">{LABEL[a.level]}</div>
                            <div className="ann-title">{a.title}</div>
                            {a.body ? <p className="ann-body">{a.body}</p> : null}
                        </div>
                        {a.linkUrl ? <Cta url={a.linkUrl} label={a.linkLabel || 'Learn more'} /> : null}
                    </AnnouncementShell>
                );
            })}
        </>
    );
    if (variant === 'card') return <div className="ann-stack ann-stack-card">{items}</div>;
    return (
        <div className="ann-stack ann-stack-band">
            <div className="container">{items}</div>
        </div>
    );
}

/** Small "UPDATE" pill for cards / bands whose event has a live announcement. */
export function UpdatePill({ className }: { className?: string }) {
    return <span className={`ann-pill${className ? ` ${className}` : ''}`}>UPDATE</span>;
}
