/**
 * Event-invitation template module — shared types.
 *
 * This module is ISOMORPHIC on purpose: the exact same renderer produces
 * (a) the live srcdoc preview in the shop dashboard and (b) the HTML that gets
 * emailed, so the preview is byte-identical to what the recipient receives.
 * Keep it free of `server-only`, Node built-ins, and React.
 */

export type InviteStyleKey = 'hud' | 'minimal' | 'poster' | 'classic';

/** Shop identity pulled from rollout.shop_email_branding(). */
export interface InviteBranding {
    shopName: string;
    /** Display name for the From header — coalesce(from_name, name). */
    fromName: string;
    logoUrl: string | null;
    /** Hex, e.g. "#e8a845". */
    primaryColor: string;
    secondaryColor: string;
    supportEmail: string | null;
    /** Shop-page handle for the /u/<handle> link (may be null). */
    pageHandle: string | null;
}

/** The event being invited to. */
export interface InviteEvent {
    id: string;
    title: string;
    /** Human label, e.g. "NIGHT RUN". */
    typeLabel: string;
    /** ISO timestamp (rollout.events.start_at). */
    startAtISO: string;
    locationName: string;
    locationDetail: string | null;
    code: string | null;
    description: string | null;
}

export interface InviteRenderInput {
    style: InviteStyleKey;
    branding: InviteBranding;
    event: InviteEvent;
    invitedName?: string | null;
    personalNote?: string | null;
    /**
     * All hosting shops shown in the "hosted by" line — the originating host
     * plus any ACCEPTED co-hosts, in display order. Defaults to
     * [branding.fromName] when omitted. The email SENDER stays `branding`
     * (the shop that sent this invite); the body credits every host.
     */
    hostNames?: string[];
    /** Per-invite token → RSVP attribution link. Use a placeholder for preview. */
    token: string;
    /** Origin, default https://rollout.club. */
    baseUrl?: string;
}

export interface RenderedInvite {
    subject: string;
    html: string;
}

/** Picker metadata surfaced in the dashboard UI. */
export interface InviteStyleMeta {
    key: InviteStyleKey;
    name: string;
    blurb: string;
}
