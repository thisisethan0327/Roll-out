/**
 * Announcements — pure types + helpers shared by server reads, server actions
 * and the (client) manager form. No server-only imports here on purpose.
 */
export type AnnouncementLevel = 'info' | 'warning' | 'critical';
export type AnnouncementScope = 'site' | 'event';

export type Announcement = {
    id: string;
    scope: AnnouncementScope;
    eventId: string | null;
    shopId: number | null;
    level: AnnouncementLevel;
    title: string;
    body: string | null;
    linkUrl: string | null;
    linkLabel: string | null;
    published: boolean;
    startsAt: string;
    endsAt: string | null;
    pinned: boolean;
    createdBy: string | null;
    createdAt: string;
};

/** Writable subset, as the forms submit it (ISO strings for the dates). */
export type AnnouncementInput = {
    title: string;
    body?: string | null;
    level: AnnouncementLevel;
    linkUrl?: string | null;
    linkLabel?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    pinned?: boolean;
};

export const ANNOUNCEMENT_COLUMNS =
    'id, scope, event_id, shop_id, level, title, body, link_url, link_label, published, starts_at, ends_at, pinned, created_by, created_at';

export function rowToAnnouncement(r: any): Announcement {
    return {
        id: r.id,
        scope: r.scope,
        eventId: r.event_id ?? null,
        shopId: r.shop_id ?? null,
        level: r.level,
        title: r.title,
        body: r.body ?? null,
        linkUrl: r.link_url ?? null,
        linkLabel: r.link_label ?? null,
        published: !!r.published,
        startsAt: r.starts_at,
        endsAt: r.ends_at ?? null,
        pinned: !!r.pinned,
        createdBy: r.created_by ?? null,
        createdAt: r.created_at,
    };
}

export type AnnouncementState = 'live' | 'scheduled' | 'expired' | 'unpublished';

export function announcementState(
    a: Pick<Announcement, 'published' | 'startsAt' | 'endsAt'>,
    now = Date.now(),
): AnnouncementState {
    if (!a.published) return 'unpublished';
    if (new Date(a.startsAt).getTime() > now) return 'scheduled';
    if (a.endsAt && new Date(a.endsAt).getTime() <= now) return 'expired';
    return 'live';
}

export function isLive(a: Pick<Announcement, 'published' | 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
    return announcementState(a, now) === 'live';
}

const LEVEL_RANK: Record<AnnouncementLevel, number> = { critical: 3, warning: 2, info: 1 };

/** Pinned first, then most severe, then newest. */
export function sortAnnouncements<T extends Pick<Announcement, 'pinned' | 'level' | 'startsAt'>>(list: T[]): T[] {
    return [...list].sort(
        (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
}

/** Same-origin absolute path ("/x", not "//host" or "/\host") or an https URL. */
export function isSafeLink(url: string): boolean {
    if (url.length > 500 || /\s/.test(url)) return false;
    if (url === '/' || /^\/[^/\\]/.test(url)) return true;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && !!u.hostname;
    } catch {
        return false;
    }
}

export type ValidInput = {
    title: string;
    body: string | null;
    level: AnnouncementLevel;
    link_url: string | null;
    link_label: string | null;
    starts_at: string;
    ends_at: string | null;
    pinned: boolean;
};

/** Validates + normalises form input. `now` is injectable for tests. */
export function validateAnnouncementInput(
    input: AnnouncementInput,
    now = new Date(),
): { ok: true; value: ValidInput } | { ok: false; error: string } {
    const title = String(input.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return { ok: false, error: 'Title must be 1-120 characters.' };
    const bodyRaw = String(input.body ?? '').replace(/\r\n/g, '\n').trim();
    if (bodyRaw.length > 2000) return { ok: false, error: 'Body must be 2000 characters or fewer.' };
    if (!['info', 'warning', 'critical'].includes(input.level)) return { ok: false, error: 'Pick a level.' };

    const linkUrl = String(input.linkUrl ?? '').trim();
    const linkLabel = String(input.linkLabel ?? '').trim();
    if (linkUrl && !isSafeLink(linkUrl)) {
        return { ok: false, error: 'Link must be a path on this site (starting with /) or an https:// URL.' };
    }
    if (linkLabel.length > 40) return { ok: false, error: 'Link label must be 40 characters or fewer.' };

    const startsAt = input.startsAt ? new Date(input.startsAt) : now;
    if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'Start time is not a valid date.' };
    let endsAt: Date | null = null;
    if (input.endsAt) {
        endsAt = new Date(input.endsAt);
        if (Number.isNaN(endsAt.getTime())) return { ok: false, error: 'End time is not a valid date.' };
        if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: 'End time must be after the start time.' };
    }

    return {
        ok: true,
        value: {
            title,
            body: bodyRaw || null,
            level: input.level,
            link_url: linkUrl || null,
            link_label: linkUrl ? linkLabel || null : null,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt ? endsAt.toISOString() : null,
            pinned: !!input.pinned,
        },
    };
}
