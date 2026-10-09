import 'server-only';
/**
 * Ban refund job (Part 2, Ethan 2026-10-09).
 *
 * PERMANENT ban  : upcoming paid tickets are cancelled and refunded to the
 *                  original payment method, the host is told, and free upcoming
 *                  RSVPs are released. An admin may WITHHOLD the auto refund
 *                  (with a written reason) at ban time.
 * TEMPORARY ban  : tickets are kept; the member can REQUEST a refund from
 *                  /suspended (rpc request_ban_refund -> a 'requested' row) and
 *                  an admin approves or declines.
 *
 * LEDGER. rollout.ban_refunds (migration 093) has one row per (ban, order) or
 * (ban, ticket), enforced by partial unique indexes, so every step is
 * idempotent and a retry only touches rows that still need work:
 *
 *   pending    seeded, waiting to run (permanent + auto)
 *   requested  the member asked (temporary ban, on_request); admin decides
 *   refunding  claimed by a runner right now (atomic claim: a second runner
 *              updating the same row from pending/requested/failed gets 0 rows)
 *   refunded   money back and order/ticket cancelled
 *   failed     last attempt failed; `error` says why; RETRY re-runs it
 *   withheld   admin withheld the refund at ban time; RELEASE sends it to pending
 *   declined   admin declined a member's request
 *   skipped    DRY RUN: nothing was sent to Medusa (a later real run picks it up)
 *
 * MONEY SAFETY. Dry-run mode: env BAN_REFUND_DRY_RUN=1 forces it, or pass
 * {dryRun: true}. In dry-run the job still SEEDS the ledger so the plan is
 * visible, then marks every runnable row 'skipped' (note 'dry-run') WITHOUT
 * calling Medusa, the refund RPCs, admin_cancel_rsvp, or the host notifier.
 * The env var can only turn dry-run ON; an opts flag can never turn it off.
 *
 * Authorization is the caller's job (every entry point is an admin-only server
 * action that has run requirePlatformAdmin()).
 */
import { logAdminAction, type AuditActor } from './auth-guard';
import { getSupabaseAdmin } from './supabase/admin';
import { isBanSchemaMissing, isBannedUntil, isPermanentBan, RELEASE_FREE_RSVPS_ON_PERMANENT_BAN } from './ban';
import { refundAndCancelEventOrder } from './medusa-admin';
import { refundSeatShareAsPlatform } from './admin-ticket-refund';
import { sendPlatformNotification } from './platform-notify';

export { RELEASE_FREE_RSVPS_ON_PERMANENT_BAN };

/** Stale 'refunding' claims older than this may be retried by an admin. */
export const REFUNDING_STALE_MS = 10 * 60 * 1000;

export type BanRefundRow = {
    id: string;
    ban_id: string;
    profile_id: string;
    kind: 'order' | 'seat';
    order_id: string | null;
    ticket_id: string | null;
    event_id: string | null;
    amount_cents: number | null;
    status: string;
    refund_ref: string | null;
    error: string | null;
    attempts: number;
    last_attempt_at: string | null;
    requested_at: string | null;
    decided_by: string | null;
    note: string | null;
    created_at: string;
    updated_at: string | null;
};

export type BanRefundSummary =
    | {
          ok: true;
          dryRun: boolean;
          seeded: number;
          refunded: number;
          failed: number;
          withheld: number;
          skipped: number;
          releasedRsvps: number;
      }
    | { ok: false; error: string; needsMigration?: boolean };

export type ProcessBanRefundsOpts = {
    /** The admin running it; recorded in the activity log. */
    actor: AuditActor;
    /** Force a dry run (the env var BAN_REFUND_DRY_RUN=1 forces one too). */
    dryRun?: boolean;
    /** Process exactly these ledger rows (any of pending/requested/failed/skipped). Default: all 'pending' (and dry-run 'skipped') rows. */
    rowIds?: string[];
    /** Skip seeding (row-level admin controls). Default: seed on a permanent ban. */
    noSeed?: boolean;
};

export function isBanRefundDryRun(opts?: { dryRun?: boolean }): boolean {
    return process.env.BAN_REFUND_DRY_RUN === '1' || opts?.dryRun === true;
}

function clip(s: unknown, n = 500): string {
    return String((s as any)?.message ?? s ?? '').slice(0, n);
}

type BanHead = { id: string; profile_id: string; action: string; banned_until: string | null; refund_mode: string | null };

async function loadBan(banId: string): Promise<{ ban: BanHead } | { error: string; needsMigration?: boolean }> {
    const svc = getSupabaseAdmin();
    const { data, error } = await svc
        .from('user_bans')
        .select('id, profile_id, action, banned_until, refund_mode')
        .eq('id', banId)
        .maybeSingle();
    if (error) {
        if (isBanSchemaMissing(error)) return { error: 'Needs migration 093', needsMigration: true };
        return { error: error.message };
    }
    if (!data) return { error: 'Ban not found.' };
    return { ban: data as BanHead };
}

/** Insert ledger rows for a ban's refundable tickets; existing rows are left alone. */
async function seedLedger(ban: BanHead): Promise<{ seeded: number } | { error: string; needsMigration?: boolean }> {
    const svc = getSupabaseAdmin();
    const { data: tickets, error } = await svc.rpc('ban_refundable_tickets', { p_profile: ban.profile_id });
    if (error) {
        if (isBanSchemaMissing(error)) return { error: 'Needs migration 093', needsMigration: true };
        return { error: error.message };
    }
    const wanted = ((tickets as any[]) ?? []) as any[];
    if (wanted.length === 0) return { seeded: 0 };

    const { data: existing, error: exErr } = await svc
        .from('ban_refunds')
        .select('order_id, ticket_id')
        .eq('ban_id', ban.id);
    if (exErr) return { error: exErr.message };
    const have = new Set(((existing as any[]) ?? []).map((r) => `${r.order_id ?? ''}|${r.ticket_id ?? ''}`));

    const withheld = ban.refund_mode === 'withhold';
    let seeded = 0;
    for (const t of wanted) {
        const orderId = t.kind === 'order' ? (t.order_id ?? null) : null;
        const ticketId = t.kind === 'seat' ? (t.ticket_id ?? null) : null;
        if (have.has(`${orderId ?? ''}|${ticketId ?? ''}`)) continue;
        const row: Record<string, unknown> = {
            ban_id: ban.id,
            profile_id: ban.profile_id,
            kind: t.kind,
            order_id: orderId,
            ticket_id: ticketId,
            event_id: t.event_id ?? null,
            amount_cents: t.amount_cents != null ? Number(t.amount_cents) : null,
            status: withheld ? 'withheld' : 'pending',
            note: withheld ? 'withheld by admin at ban time' : null,
        };
        const ins = await svc.from('ban_refunds').insert(row);
        // 23505 = another runner seeded the same row first: fine, idempotent.
        if (ins.error && ins.error.code !== '23505') return { error: ins.error.message };
        if (!ins.error) seeded++;
    }
    return { seeded };
}

/** Atomic claim: pending/requested/failed/skipped (dry-run leftover) -> refunding. Null when someone else holds it or it is not runnable. */
async function claimRow(row: BanRefundRow): Promise<BanRefundRow | null> {
    const svc = getSupabaseAdmin();
    const { data, error } = await svc
        .from('ban_refunds')
        .update({
            status: 'refunding',
            attempts: (row.attempts ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
            error: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', row.status)
        .in('status', ['pending', 'requested', 'failed', 'skipped'])
        .select('*')
        .maybeSingle();
    if (error) {
        console.error('[ban-refunds] claim failed:', error.message);
        return null;
    }
    return (data as BanRefundRow | null) ?? null;
}

async function setRow(id: string, patch: Record<string, unknown>) {
    const { error } = await getSupabaseAdmin()
        .from('ban_refunds')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) console.error('[ban-refunds] ledger update failed:', id, error.message);
}

/** Tell the host a ticket was cancelled+refunded (in-app notification + best-effort email). No reason is shared. */
async function notifyHost(row: BanRefundRow): Promise<void> {
    if (!row.event_id) return;
    try {
        const svc = getSupabaseAdmin();
        const { data: ev } = await svc.from('events').select('id, title, host_id').eq('id', row.event_id).maybeSingle();
        const hostId = (ev as any)?.host_id as string | null | undefined;
        if (!hostId || hostId === row.profile_id) return;
        const title = ((ev as any)?.title as string | null) ?? 'your event';
        const { error } = await svc.from('notifications').insert({
            recipient_id: hostId,
            actor_id: null,
            type: 'system',
            preview: `A ticket for ${title} was cancelled and refunded. The attendee's account was removed from Rollout.`,
            linked_event_id: row.event_id,
        });
        if (error) console.error('[ban-refunds] host notification failed:', error.message);
        await sendPlatformNotification({
            template: 'platform_ticket_cancelled_host',
            toProfileId: hostId,
            linkedEventId: row.event_id,
            vars: { event_title: title },
        });
    } catch (e) {
        console.error('[ban-refunds] host notify threw:', clip(e));
    }
}

/** Run one claimed row. Never throws. Returns the new status. */
async function runClaimed(row: BanRefundRow): Promise<'refunded' | 'failed'> {
    try {
        if (row.kind === 'order') {
            if (!row.order_id) {
                await setRow(row.id, { status: 'failed', error: 'No order id on this row.' });
                return 'failed';
            }
            const res = await refundAndCancelEventOrder(row.order_id, {
                eventId: row.event_id,
                eventProfileId: row.profile_id,
            });
            if (!res.ok) {
                await setRow(row.id, { status: 'failed', error: clip(res.error ?? 'Refund failed.') });
                return 'failed';
            }
            await setRow(row.id, {
                status: 'refunded',
                refund_ref: row.order_id,
                error: null,
                note: res.skipped ? `already settled (${res.skipped})` : row.note,
            });
            // Idempotent: the Medusa order.canceled subscriber normally frees the
            // RSVP already; this makes sure, and is a no-op if it did.
            if (row.event_id) {
                const { error } = await getSupabaseAdmin().rpc('admin_cancel_rsvp', {
                    p_event: row.event_id,
                    p_profile: row.profile_id,
                });
                if (error) console.error('[ban-refunds] admin_cancel_rsvp after refund:', error.message);
            }
        } else {
            if (!row.ticket_id || !row.event_id) {
                await setRow(row.id, { status: 'failed', error: 'No ticket id on this row.' });
                return 'failed';
            }
            const res = await refundSeatShareAsPlatform(row.ticket_id, row.event_id);
            if (!res.ok) {
                // confirm_failed keeps its "Needs manual check" text and the ticket stays locked.
                await setRow(row.id, { status: 'failed', error: clip(res.error) });
                return 'failed';
            }
            await setRow(row.id, { status: 'refunded', refund_ref: res.refundRef, error: null });
        }
        await notifyHost(row);
        return 'refunded';
    } catch (e) {
        await setRow(row.id, { status: 'failed', error: clip(e) });
        return 'failed';
    }
}

/**
 * Free upcoming RSVPs of a permanently banned member (payment_ref null) are
 * released via admin_cancel_rsvp. A CONFIRMED row on a paid/tiered event with no
 * payment_ref is the documented anomaly: never released here, never guessed at.
 */
async function releaseFreeRsvps(profileId: string, dryRun: boolean): Promise<number> {
    const svc = getSupabaseAdmin();
    const { data, error } = await svc
        .from('event_rsvps')
        .select('event_id, status, hold_state, payment_ref, event:events!inner(id, start_at, cancelled_at, rsvp_mode)')
        .eq('profile_id', profileId)
        .in('status', ['going', 'waitlist', 'maybe'])
        .is('payment_ref', null);
    if (error) {
        console.error('[ban-refunds] free RSVP lookup failed:', error.message);
        return 0;
    }
    const now = Date.now();
    const rows = ((data as any[]) ?? []).filter((r) => {
        const ev = r.event;
        if (!ev || ev.cancelled_at) return false;
        if (!ev.start_at || new Date(ev.start_at).getTime() <= now) return false;
        const paidMode = ev.rsvp_mode && ev.rsvp_mode !== 'free';
        if (paidMode && r.hold_state === 'confirmed') return false; // anomaly: leave for a human
        return true;
    });
    if (dryRun) return rows.length;
    let released = 0;
    for (const r of rows) {
        const { error: e } = await svc.rpc('admin_cancel_rsvp', { p_event: r.event_id, p_profile: profileId });
        if (e) console.error('[ban-refunds] free RSVP release failed:', e.message);
        else released++;
    }
    return released;
}

export async function processBanRefunds(banId: string, opts: ProcessBanRefundsOpts): Promise<BanRefundSummary> {
    const dryRun = isBanRefundDryRun(opts);
    const loaded = await loadBan(banId);
    if ('error' in loaded) return { ok: false, error: loaded.error, needsMigration: loaded.needsMigration };
    const { ban } = loaded;
    if (ban.action !== 'ban') return { ok: false, error: 'That history row is not a ban.' };

    const permanent = isPermanentBan(ban.banned_until);
    const svc = getSupabaseAdmin();

    // The job only runs for a member who is banned RIGHT NOW (a lifted or
    // overturned ban must never refund anything).
    const { data: prof } = await svc.from('profiles').select('banned_until').eq('id', ban.profile_id).maybeSingle();
    if (!isBannedUntil((prof as any)?.banned_until ?? null)) {
        return { ok: false, error: 'This member is not banned any more, so nothing was refunded.' };
    }

    // 1. Seed. Only a permanent ban seeds; on_request (temporary) rows come from the member.
    let seeded = 0;
    if (!opts.noSeed && permanent && (ban.refund_mode ?? 'on_request') !== 'on_request') {
        const s = await seedLedger(ban);
        if ('error' in s) return { ok: false, error: s.error, needsMigration: s.needsMigration };
        seeded = s.seeded;
    }

    // 2. Pick the rows to run.
    let q = svc.from('ban_refunds').select('*').eq('ban_id', banId);
    if (opts.rowIds && opts.rowIds.length > 0) q = q.in('id', opts.rowIds).in('status', ['pending', 'requested', 'failed', 'skipped']);
    else q = q.in('status', ['pending', 'skipped']);
    const { data: runnable, error: runErr } = await q.order('created_at', { ascending: true });
    if (runErr) {
        if (isBanSchemaMissing(runErr)) return { ok: false, error: 'Needs migration 093', needsMigration: true };
        return { ok: false, error: runErr.message };
    }

    let refunded = 0;
    let failed = 0;
    let skipped = 0;
    for (const raw of (runnable as BanRefundRow[]) ?? []) {
        if (dryRun) {
            // No claim, no Medusa, no RPC: the ledger just records that it would have run.
            await setRow(raw.id, {
                status: 'skipped',
                note: 'dry-run',
                last_attempt_at: new Date().toISOString(),
            });
            skipped++;
            continue;
        }
        const row = await claimRow(raw);
        if (!row) continue; // someone else has it, or it changed state
        const outcome = await runClaimed(row);
        if (outcome === 'refunded') refunded++;
        else failed++;
    }

    // 3. Withheld count for the summary (rows an admin held back).
    const { count: withheldCount } = await svc
        .from('ban_refunds')
        .select('id', { count: 'exact', head: true })
        .eq('ban_id', banId)
        .eq('status', 'withheld');

    // 4. Free RSVPs on a permanent ban (a single constant switches this off).
    let releasedRsvps = 0;
    if (permanent && RELEASE_FREE_RSVPS_ON_PERMANENT_BAN && !opts.noSeed) {
        releasedRsvps = await releaseFreeRsvps(ban.profile_id, dryRun);
    }

    const summary = {
        ok: true as const,
        dryRun,
        seeded,
        refunded,
        failed,
        withheld: withheldCount ?? 0,
        skipped,
        releasedRsvps,
    };

    await logAdminAction(opts.actor, 'user.ban_refund', 'profile', ban.profile_id, {
        ban_id: banId,
        refunded,
        failed,
        withheld: summary.withheld,
        skipped,
        released_rsvps: releasedRsvps,
        dry_run: dryRun,
    });
    return summary;
}
