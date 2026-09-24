/**
 * Multi-ticket packages (feature-gated) — the CLIENT-SAFE constants/types
 * shared between the server module (event-tickets.ts, which carries `import
 * 'server-only'`) and client components (TicketAttendeesForm.tsx). Splitting
 * these out exists for exactly one reason: `server-only` poisons the WHOLE
 * module graph for client bundling — a client component importing even a
 * pure constant from event-tickets.ts fails the build ("You're importing a
 * component that needs server-only"). Nothing here talks to Supabase/Medusa;
 * event-tickets.ts re-exports all of it so server callers keep one import
 * path.
 */
export const MAX_TICKETS_PER_ORDER = 5;
export const SWEATER_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type SweaterSize = (typeof SWEATER_SIZES)[number];

export type TicketAttendeeInput = {
    name: string;
    email: string;
    size: SweaterSize;
};

export function sizeLabel(size: string | null | undefined): string {
    return size ? size.toUpperCase() : '—';
}

/** cents → "$160.00" (USD-only, matching the rest of the event checkout surface). */
export function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}
