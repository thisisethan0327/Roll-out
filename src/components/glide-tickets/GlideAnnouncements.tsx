/**
 * Live notices on the event page (rollout.announcements), in Glide.
 *
 * Same contract as components/AnnouncementBar: plain text rendered by React
 * (never HTML), `info` dismissible per browser through AnnouncementShell,
 * `warning` / `critical` not dismissible and announced as role="alert", and
 * the call-to-action only for a link isSafeLink accepts. Only the look
 * differs: a notice card with an icon roundel; warning and critical sit on
 * the tint, and critical carries the live dot (red is never text).
 */
import Link from 'next/link';
import { Info, Megaphone, TriangleAlert } from 'lucide-react';
import { isSafeLink, type Announcement } from '@/lib/announcements-core';
import { AnnouncementShell } from '@/components/AnnouncementShell';
import './tickets.css';

const ICON: Record<Announcement['level'], React.ReactNode> = {
    info: <Info size={20} strokeWidth={2} />,
    warning: <TriangleAlert size={20} strokeWidth={2} />,
    critical: <Megaphone size={20} strokeWidth={2} />,
};
const LABEL: Record<Announcement['level'], string> = { info: 'Update', warning: 'Heads up', critical: 'Important' };

function Cta({ url, label }: { url: string; label: string }) {
    if (!isSafeLink(url)) return null;
    const external = !url.startsWith('/');
    return external ? (
        <a className="g-sec" href={url} target="_blank" rel="noopener noreferrer">
            {label}
        </a>
    ) : (
        <Link className="g-sec" href={url}>
            {label}
        </Link>
    );
}

export function GlideAnnouncements({ announcements }: { announcements: Announcement[] }) {
    if (announcements.length === 0) return null;
    return (
        <div className="gt-anns">
            {announcements.map((a) => (
                <AnnouncementShell
                    key={a.id}
                    id={a.id}
                    dismissible={a.level === 'info'}
                    className={`gt-ann gt-ann--${a.level}`}
                    role={a.level === 'info' ? 'status' : 'alert'}
                >
                    <span className="g-ic" aria-hidden="true">
                        {ICON[a.level]}
                    </span>
                    <div className="gt-ann-main">
                        <span className="gt-ann-k">
                            {a.level === 'critical' ? <i className="g-live" aria-hidden="true" /> : null}
                            {LABEL[a.level]}
                        </span>
                        <p className="gt-ann-title">{a.title}</p>
                        {a.body ? <p className="gt-ann-body">{a.body}</p> : null}
                    </div>
                    {a.linkUrl ? <Cta url={a.linkUrl} label={a.linkLabel || 'Learn more'} /> : null}
                </AnnouncementShell>
            ))}
        </div>
    );
}
