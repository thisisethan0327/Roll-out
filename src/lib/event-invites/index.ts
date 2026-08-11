/**
 * Event-invitation template module — public surface.
 *
 * One skeleton, four art directions (hud / minimal / poster / classic). The
 * same renderer feeds the dashboard's live srcdoc preview and the emailed HTML,
 * so what a host sees is exactly what the recipient gets.
 */
export type {
    InviteStyleKey,
    InviteStyleMeta,
    InviteBranding,
    InviteEvent,
    InviteRenderInput,
    RenderedInvite,
} from './types';

export {
    INVITE_STYLES,
    renderInvite,
    renderInvitePreview,
    renderCoHostInvite,
    formatEventDateTime,
    buildRsvpUrl,
    buildIcsUrl,
    escapeHtml,
} from './render';

export type { CoHostInviteInput } from './render';
