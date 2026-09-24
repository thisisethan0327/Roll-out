/**
 * Pure decision helper for /event/[id]: may THIS viewer see a non-public
 * event? Split out from page.tsx so the rule itself (no I/O) can be unit
 * checked directly — see scripts/check-event-visibility.mjs during dev.
 *
 * `public` events are always visible (this function is only consulted for
 * everything else — followers/private/legacy-null visibility) to an
 * anonymous OR unrelated signed-in viewer; a signed-in viewer who is the
 * event's host, a manager+ of the hosting shop, a platform admin, or who
 * already holds an RSVP row (any status — invited-and-declined still counts
 * as "was let in") can still open it. This does NOT decide who may RSVP —
 * that stays enforced by the RSVP RPCs regardless of what this returns.
 */
export type EventVisibility = string | null;

export type EventViewer = { profileId: string } | null;

export type CanViewEventInput = {
    visibility: EventVisibility;
    /** The signed-in viewer, or null when signed out. */
    viewer: EventViewer;
    /** The event's host_id column. */
    hostId: string | null;
    /** The viewer's role on the event's hosting shop, or null if none/no-shop event. */
    shopRole: string | null;
    /** Is the viewer a platform admin? */
    isAdmin: boolean;
    /** Does the viewer already have an event_rsvps row for this event (any status)? */
    hasRsvp: boolean;
};

const SHOP_MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function canViewEvent({
    visibility,
    viewer,
    hostId,
    shopRole,
    isAdmin,
    hasRsvp,
}: CanViewEventInput): boolean {
    if (visibility === 'public') return true;
    if (!viewer) return false;
    if (isAdmin) return true;
    if (hostId != null && viewer.profileId === hostId) return true;
    if (shopRole != null && SHOP_MANAGER_ROLES.has(shopRole)) return true;
    if (hasRsvp) return true;
    return false;
}
