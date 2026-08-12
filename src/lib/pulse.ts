/**
 * PULSE — cross-ecosystem KPI aggregator for the god console (/admin/overview).
 *
 * Server-only. Gathers every KPI source in parallel and TOLERATES ANY SINGLE
 * SOURCE FAILING: each field carries its own `{ error }` so a dead Medusa or a
 * stale RPC renders one "—" tile with a note, never a broken page. Cached in
 * memory for 5 min so god-mode refreshes don't hammer Medusa / Stripe / the DB.
 *
 * Definitions are matched to the systems of record so the console never
 * disagrees with them:
 *   • EMWRAPS revenue → public.get_finance_overview() (the SAME RPC FinancePage
 *     prefers; reads mv_finance_summary). outstanding = total − net collected;
 *     thisMonthPaid = SUM(amount_paid) FILTER paid_at >= month start, status≠void.
 *   • Store revenue → SUM(order.item_subtotal) (items only; never Medusa
 *     `subtotal`, which folds shipping in). See medusa-admin.getMedusaPulse.
 *   • Tickets / signups / events → rollout.pulse_* SECURITY DEFINER functions
 *     (migration 049), seed-excluded, counts only.
 */
import 'server-only';
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';
import { getMedusaPulse, type MedusaPulse } from './medusa-admin';
import { getGa4Overview, type Ga4Overview } from './ga4';

export type EmwrapsRevenue = {
    thisMonthCollected: number;
    outstanding: number;
    totalInvoiced: number;
    collectedAllTime: number;
    error: string | null;
};

export type SignupCohort = { d7: number; d30: number };
export type Signups = {
    portal: SignupCohort;
    staff: SignupCohort;
    rollout: SignupCohort;
    error: string | null;
};

export type TicketStatuses = {
    quote: number;
    estimate: number;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    /** pending + in-progress — jobs actually live in the shop. */
    active: number;
    error: string | null;
};

export type EventStats = {
    upcomingEvents: number;
    upcomingRsvps: number;
    totalRsvps: number;
    error: string | null;
};

export type Pulse = {
    revenue: EmwrapsRevenue;
    store: MedusaPulse;
    tickets: TicketStatuses;
    signups: Signups;
    events: EventStats;
    ga4: Ga4Overview;
};

const ZERO_COHORT: SignupCohort = { d7: 0, d30: 0 };

async function getEmwrapsRevenue(): Promise<EmwrapsRevenue> {
    try {
        // get_finance_overview lives in the public schema (SECURITY DEFINER over
        // mv_finance_summary). Use the public-pinned admin client so the rpc name
        // resolves in `public`.
        const { data, error } = await getSupabasePublicAdmin().rpc('get_finance_overview');
        if (error) throw error;
        const s = (data as any)?.summary ?? {};
        return {
            thisMonthCollected: Number(s.thisMonthPaid ?? 0),
            outstanding: Number(s.outstanding ?? 0),
            totalInvoiced: Number(s.total ?? 0),
            collectedAllTime: Number(s.collected ?? 0),
            error: null,
        };
    } catch (e: any) {
        return {
            thisMonthCollected: 0,
            outstanding: 0,
            totalInvoiced: 0,
            collectedAllTime: 0,
            error: e?.message ?? 'Finance overview unavailable.',
        };
    }
}

async function getSignups(): Promise<Signups> {
    try {
        const { data, error } = await getSupabaseAdmin().rpc('pulse_signups');
        if (error) throw error;
        const d = (data as any) ?? {};
        return {
            portal: { ...ZERO_COHORT, ...(d.portal ?? {}) },
            staff: { ...ZERO_COHORT, ...(d.staff ?? {}) },
            rollout: { ...ZERO_COHORT, ...(d.rollout ?? {}) },
            error: null,
        };
    } catch (e: any) {
        return { portal: ZERO_COHORT, staff: ZERO_COHORT, rollout: ZERO_COHORT, error: e?.message ?? 'Signup counts unavailable.' };
    }
}

async function getTickets(): Promise<TicketStatuses> {
    try {
        const { data, error } = await getSupabaseAdmin().rpc('pulse_tickets');
        if (error) throw error;
        const d = (data as any) ?? {};
        const pending = Number(d.pending ?? 0);
        const inProgress = Number(d.in_progress ?? 0);
        return {
            quote: Number(d.quote ?? 0),
            estimate: Number(d.estimate ?? 0),
            pending,
            in_progress: inProgress,
            completed: Number(d.completed ?? 0),
            total: Number(d.total ?? 0),
            active: pending + inProgress,
            error: null,
        };
    } catch (e: any) {
        return {
            quote: 0, estimate: 0, pending: 0, in_progress: 0, completed: 0, total: 0, active: 0,
            error: e?.message ?? 'Ticket counts unavailable.',
        };
    }
}

async function getEvents(): Promise<EventStats> {
    try {
        const { data, error } = await getSupabaseAdmin().rpc('pulse_events');
        if (error) throw error;
        const d = (data as any) ?? {};
        return {
            upcomingEvents: Number(d.upcoming_events ?? 0),
            upcomingRsvps: Number(d.upcoming_rsvps ?? 0),
            totalRsvps: Number(d.total_rsvps ?? 0),
            error: null,
        };
    } catch (e: any) {
        return { upcomingEvents: 0, upcomingRsvps: 0, totalRsvps: 0, error: e?.message ?? 'Event counts unavailable.' };
    }
}

let cache: { at: number; data: Pulse } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getPulse(): Promise<Pulse> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

    const [revenue, store, tickets, signups, events, ga4] = await Promise.all([
        getEmwrapsRevenue(),
        getMedusaPulse(),
        getTickets(),
        getSignups(),
        getEvents(),
        getGa4Overview(),
    ]);

    const data: Pulse = { revenue, store, tickets, signups, events, ga4 };
    cache = { at: Date.now(), data };
    return data;
}
