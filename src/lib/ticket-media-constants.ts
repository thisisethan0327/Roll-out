/**
 * Client-safe constants for the `ticket-media` bucket. Kept separate from
 * ticket-media.ts (which is `server-only`) so Client Components can import the
 * bucket name + cache header for direct-to-Storage signed uploads.
 */
export const TICKET_BUCKET = 'ticket-media';
export const TICKET_CACHE_CONTROL = '31536000';
