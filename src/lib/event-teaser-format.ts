/**
 * Pure formatting for "visible but locked" events (private / followers-only),
 * shared by the locked /event/[id] page, the /meets list and the meets map.
 * No I/O and no server-only imports, so client components can use it and the
 * rules can be unit checked with node directly.
 *
 * Everything here is fed from rollout.event_teasers (migration 088/089) —
 * the view that deliberately carries only a title, date, host, a GENERAL area
 * and a FUZZED pin. Nothing in this file may ever take a location_name,
 * location_detail, exact lat/lng, description or attendee list: a locked
 * event must not leak where it actually is.
 */

export type TeaserVisibility = 'private' | 'followers';

/** One row of rollout.event_teasers, as the web reads it. */
export type EventTeaser = {
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    start_at: string | null;
    time_zone: string | null;
    visibility: TeaserVisibility;
    host_handle: string | null;
    host_name: string | null;
    host_kind: string | null;
    host_is_verified: boolean;
    shop_name: string | null;
    shop_slug: string | null;
    general_area: string | null;
    /** Fuzzed on the server — never the real venue. May be null. */
    approx_lat: number | null;
    approx_lng: number | null;
    /** Only meaningful when read with the VIEWER's session client. */
    viewer_can_view: boolean;
};

/** A locked teaser as the /meets list renders it (list + split view). */
export type LockedMeet = {
    locked: true;
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    start_at: string | null;
    time_zone: string | null;
    visibility: TeaserVisibility;
    general_area: string | null;
    host_handle: string | null;
    /** The viewer may open it (invited / host / follower …) — link, don't lock. */
    viewer_can_view: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Anything that is not explicitly 'followers' is treated as the stricter 'private'. */
export function teaserVisibility(v: unknown): TeaserVisibility {
    return v === 'followers' ? 'followers' : 'private';
}

/** Normalise a raw event_teasers row (loosely typed PostgREST data). */
export function parseTeaserRow(r: any): EventTeaser | null {
    if (!r || typeof r.id !== 'string') return null;
    return {
        id: r.id,
        code: str(r.code),
        type: str(r.type),
        title: str(r.title),
        start_at: str(r.start_at),
        time_zone: str(r.time_zone),
        visibility: teaserVisibility(r.visibility),
        host_handle: str(r.host_handle),
        host_name: str(r.host_name),
        host_kind: str(r.host_kind),
        host_is_verified: r.host_is_verified === true,
        shop_name: str(r.shop_name),
        shop_slug: str(r.shop_slug),
        general_area: str(r.general_area),
        approx_lat: num(r.approx_lat),
        approx_lng: num(r.approx_lng),
        viewer_can_view: r.viewer_can_view === true,
    };
}

export function toLockedMeet(t: EventTeaser): LockedMeet {
    return {
        locked: true,
        id: t.id,
        code: t.code,
        type: t.type,
        title: t.title,
        start_at: t.start_at,
        time_zone: t.time_zone,
        visibility: t.visibility,
        general_area: t.general_area,
        host_handle: t.host_handle,
        viewer_can_view: t.viewer_can_view,
    };
}

/** Hero badge on the locked event page. */
export function teaserBadge(v: TeaserVisibility): string {
    return v === 'followers' ? '🔒 FOLLOWERS ONLY' : '🔒 PRIVATE EVENT · INVITE ONLY';
}

/** Short badge for list cards. */
export function teaserShortBadge(v: TeaserVisibility): string {
    return v === 'followers' ? 'Followers only' : 'Private · Invite only';
}

/** The general area, or the neutral placeholder when the host gave none. */
export function teaserAreaLabel(area: string | null | undefined): string {
    return str(area) ?? 'Location shared with invitees';
}

/** Explanatory copy under the locked page's facts. */
export function teaserLockedCopy(v: TeaserVisibility, hostHandle: string | null | undefined): string {
    if (v === 'followers') {
        const who = str(hostHandle) ? `@${str(hostHandle)}'s` : "the host's";
        return `Only ${who} followers can see the details and RSVP. Follow them to join.`;
    }
    return 'This event is invite-only. If you were invited, sign in with the email your invite went to, or open the link in your invite email.';
}

/**
 * Map popup line: "🔒 <title> · Invite only · <general_area> · <date>".
 * Plain text — the map escapes it before it becomes HTML.
 */
export function teaserPopupLine(
    title: string | null | undefined,
    v: TeaserVisibility,
    area: string | null | undefined,
    dateLabel: string,
): string {
    const lock = v === 'followers' ? 'Followers only' : 'Invite only';
    return [`🔒 ${str(title) ?? 'Private event'}`, lock, teaserAreaLabel(area), dateLabel].join(' · ');
}

/** A well-formed invite token (uuid), or null. */
export function safeInviteToken(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const t = raw.trim();
    return UUID_RE.test(t) ? t : null;
}

/** /event/<id>, carrying ?invite when present, so a claim can run after sign-in. */
export function eventPathWithInvite(eventId: string, inviteToken: string | null | undefined): string {
    return inviteToken ? `/event/${eventId}?invite=${encodeURIComponent(inviteToken)}` : `/event/${eventId}`;
}

/** SIGN IN link for a locked event page. */
export function lockedSignInHref(eventId: string, inviteToken: string | null | undefined): string {
    return `/login?next=${encodeURIComponent(eventPathWithInvite(eventId, inviteToken))}`;
}

/**
 * Stable merge of two lists by start_at ascending (null dates last). Used to
 * drop teasers into the same date ordering as the public meets.
 */
export function mergeByStartAt<A extends { start_at: string | null }, B extends { start_at: string | null }>(
    a: A[],
    b: B[],
): Array<A | B> {
    const key = (s: string | null) => {
        if (!s) return Number.POSITIVE_INFINITY;
        const t = new Date(s).getTime();
        return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };
    return [...a, ...b]
        .map((item, idx) => ({ item, idx }))
        .sort((x, y) => key(x.item.start_at) - key(y.item.start_at) || x.idx - y.idx)
        .map((x) => x.item);
}
