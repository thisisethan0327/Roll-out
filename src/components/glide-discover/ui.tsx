/**
 * Discover-lane pieces built on the Glide kit (src/components/glide): the
 * view toggle, filter chips, meet rows, stars, avatars and product tiles used
 * by /meets, /meets/map, /shops, /u/[handle], /post/[id] and /book/[handle].
 *
 * Server-safe (no hooks), so client components such as the meets split can
 * render the same rows. Styles: ./discover.css (gd- classes).
 */
import './discover.css';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight, Clock, List, Lock, Map as MapIcon, Star, Users } from 'lucide-react';
import { Chip, DateRoundel } from '@/components/glide/primitives';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';
import { resolveCover, coverFocus } from '@/lib/event-covers';
import { formatMoney, type MedusaProduct } from '@/lib/medusa-types';

export function cx(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/** List / Map toggle (G5 directory `.tog`), as links. */
export function ViewToggle({ current, listHref, mapHref }: { current: 'list' | 'map'; listHref: string; mapHref: string }) {
    return (
        <nav className="gd-tog g-fp" aria-label="View">
            <Link href={listHref} aria-current={current === 'list' ? 'page' : undefined}>
                <List size={17} strokeWidth={2} aria-hidden="true" />
                List
            </Link>
            <Link href={mapHref} aria-current={current === 'map' ? 'page' : undefined}>
                <MapIcon size={17} strokeWidth={2} aria-hidden="true" />
                Map
            </Link>
        </nav>
    );
}

/** Type filter chips as links; the current one is the navy roundel colour. */
export function FilterChips({
    items,
    label,
    float,
    className,
}: {
    items: { href: string; label: string; current: boolean }[];
    label: string;
    float?: boolean;
    className?: string;
}) {
    return (
        <nav className={cx('gd-fchips', float && 'gd-fchips--float', className)} aria-label={label}>
            {items.map((it) => (
                <Link key={it.href} href={it.href} className="gd-fchip" aria-current={it.current ? 'page' : undefined}>
                    {it.label}
                </Link>
            ))}
        </nav>
    );
}

/** Five stars, filled to the rounded rating; labelled for screen readers. */
export function StarRow({ rating, size = 15 }: { rating: number; size?: number }) {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return (
        <span className="gd-stars" role="img" aria-label={`${r} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
                <Star
                    key={i}
                    size={size}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    className={i < r ? undefined : 'is-off'}
                    fill={i < r ? 'currentColor' : 'none'}
                />
            ))}
        </span>
    );
}

export function initials(name: string | null | undefined, handle?: string | null): string {
    const src = (name?.trim() || handle || '·').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Round avatar: the photo, or initials on the navy roundel. */
export function Avatar({ src, name, handle, small, className }: { src?: string | null; name?: string | null; handle?: string | null; small?: boolean; className?: string }) {
    return (
        <span className={cx('gd-av', small && 'gd-av--sm', className)} aria-hidden="true">
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" loading="lazy" />
            ) : (
                initials(name, handle)
            )}
        </span>
    );
}

/* ── Meet rows ─────────────────────────────────────────────────────────── */

export type MeetRowData = {
    id: string;
    type: string | null;
    title: string | null;
    location_name: string | null;
    hero_image_url: string | null;
    start_at: string | null;
    time_zone: string | null;
    attending_count: number | null;
    spots_left?: number | null;
    capacity?: number | null;
    is_official?: boolean | null;
    host_handle?: string | null;
    privacy?: string | null;
};

export type LockedRowData = {
    id: string;
    title: string | null;
    start_at: string | null;
    time_zone: string | null;
    visibility: string;
    general_area: string | null;
    host_handle: string | null;
    viewer_can_view: boolean;
};

type RowLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'>;

/**
 * One meet as a Glide row: cover with the date roundel, title, place · type,
 * then real chips only (time, going, spots, official, private).
 */
export function MeetRow({
    m,
    past,
    active,
    hasUpdate,
    chevron = true,
    linkProps,
}: {
    m: MeetRowData;
    past?: boolean;
    active?: boolean;
    hasUpdate?: boolean;
    chevron?: boolean;
    linkProps?: RowLinkProps & { 'data-meet'?: string };
}) {
    const when = eventDateParts(m.start_at, m.time_zone);
    const place = placeName(m.location_name);
    const going = m.attending_count ?? 0;
    return (
        <Link href={`/event/${m.id}`} className={cx('gd-meet', active && 'is-active')} {...linkProps}>
            <span
                className="gd-meet-im"
                style={{
                    backgroundImage: `url(${resolveCover(m.hero_image_url, m.type, m.id)})`,
                    backgroundPosition: coverFocus(m.hero_image_url),
                }}
            >
                {when && !past ? <DateRoundel top={when.dow} day={when.day} rings={false} /> : null}
            </span>
            <span className="gd-meet-t">
                <b>
                    {m.title ?? 'Untitled meet'}
                    {hasUpdate ? (
                        <span className="gd-upd">
                            <i aria-hidden="true" />
                            Update
                        </span>
                    ) : null}
                </b>
                <small>{[place, eventTypeLabel(m.type)].filter(Boolean).join(' · ')}</small>
                <span className="g-chips">
                    {when ? (
                        <Chip icon={<Clock size={14} strokeWidth={2} aria-hidden="true" />}>
                            {past ? `Ended ${when.mon} ${when.day}` : `${when.dayLabel} · ${when.clock}`}
                        </Chip>
                    ) : null}
                    {going > 0 ? (
                        <Chip icon={<Users size={14} strokeWidth={2} aria-hidden="true" />}>
                            <span className="g-w">{going}</span> going
                        </Chip>
                    ) : null}
                    {!past && m.spots_left != null ? (
                        <Chip>
                            <span className="g-w">{m.spots_left}</span> {m.spots_left === 1 ? 'spot' : 'spots'} left
                        </Chip>
                    ) : null}
                    {m.is_official ? <Chip tint>Official</Chip> : null}
                    {m.privacy ? (
                        <Chip tint icon={<Lock size={13} strokeWidth={2} aria-hidden="true" />}>
                            {m.privacy === 'followers' ? 'Followers' : 'Private'}
                        </Chip>
                    ) : null}
                </span>
            </span>
            {chevron ? (
                <span className="gd-go" aria-hidden="true">
                    <ChevronRight size={20} strokeWidth={2} />
                </span>
            ) : null}
        </Link>
    );
}

/**
 * A private / followers-only meet the viewer may not open: date, title, the
 * badge, general area and host only. No photo, no venue, no attendee count.
 */
export function LockedMeetRow({
    m,
    badge,
    area,
    active,
    linkProps,
}: {
    m: LockedRowData;
    badge: string;
    area: string;
    active?: boolean;
    linkProps?: RowLinkProps & { 'data-meet'?: string };
}) {
    const when = eventDateParts(m.start_at, m.time_zone);
    return (
        <Link href={`/event/${m.id}`} className={cx('gd-meet', active && 'is-active')} {...linkProps}>
            <span className="gd-meet-im gd-meet-im--lock">
                <Lock size={26} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="gd-meet-t">
                <b>{m.title ?? 'Private event'}</b>
                <small>{[area, m.host_handle ? `@${m.host_handle}` : null].filter(Boolean).join(' · ')}</small>
                <span className="g-chips">
                    <Chip tint icon={<Lock size={13} strokeWidth={2} aria-hidden="true" />}>
                        {badge}
                    </Chip>
                    {when ? (
                        <Chip icon={<Clock size={14} strokeWidth={2} aria-hidden="true" />}>
                            {when.dayLabel} · {when.clock}
                        </Chip>
                    ) : null}
                    {m.viewer_can_view ? <Chip>You&apos;re invited</Chip> : null}
                </span>
            </span>
            <span className="gd-go" aria-hidden="true">
                <ChevronRight size={20} strokeWidth={2} />
            </span>
        </Link>
    );
}

/* ── Products ──────────────────────────────────────────────────────────── */

/**
 * A store product tile. Same rules as components/ProductCard: a paused product
 * stays linkable but says Coming soon; a dealer-only price is never shown here.
 */
export function ProductTile({ product: p }: { product: MedusaProduct }) {
    const price = p.dealerOnly ? 'Dealer pricing' : formatMoney(p.price, p.currency);
    return (
        <Link href={`/store/p/${p.handle}`} className="gd-pc">
            <span className={cx('gd-pc-im', p.paused && 'is-paused')}>
                {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" loading="lazy" />
                ) : null}
                {p.paused ? <Chip>Coming soon</Chip> : null}
            </span>
            <b>{p.title}</b>
            <span className="gd-pc-pr">
                {p.dealerOnly ? <small>{price}</small> : <span className="g-w">{price}</span>}
            </span>
        </Link>
    );
}

/** A heading row inside a card: title, optional sub and a trailing link. */
export function CardHead({ id, title, sub, action }: { id?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
    return (
        <div className="gd-card-hd">
            <div>
                <h2 id={id}>{title}</h2>
                {sub ? <small>{sub}</small> : null}
            </div>
            {action}
        </div>
    );
}
