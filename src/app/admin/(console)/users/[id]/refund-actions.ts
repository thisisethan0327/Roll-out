'use server';
/**
 * Admin controls over the ban refund ledger (rollout.ban_refunds, migration
 * 093): RUN a row (RETRY a failed one / REFUND a requested one), RELEASE a
 * withheld one, DECLINE a requested one, RUN PENDING for a ban.
 *
 * Every action re-checks requirePlatformAdmin(), takes only ids from the
 * client, and re-reads the row server-side. Money only moves inside
 * processBanRefunds (lib/ban-refunds.ts), which refuses a member who is no
 * longer banned, claims each row atomically, and honours BAN_REFUND_DRY_RUN=1.
 */
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isBanSchemaMissing } from '@/lib/ban';
import { REFUNDING_STALE_MS, processBanRefunds, type BanRefundSummary } from '@/lib/ban-refunds';

export type RefundActionResult = {
    ok: boolean;
    error?: string;
    /** One-line outcome for the toast ("1 refunded · 0 failed"). */
    message?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadRow(rowId: string): Promise<{ row: any } | { error: string }> {
    if (!UUID_RE.test(rowId)) return { error: 'Bad row id.' };
    const { data, error } = await getSupabaseAdmin().from('ban_refunds').select('*').eq('id', rowId).maybeSingle();
    if (error) return { error: isBanSchemaMissing(error) ? 'Needs migration 093' : error.message };
    if (!data) return { error: 'Row not found.' };
    return { row: data };
}

function summarize(res: BanRefundSummary): RefundActionResult {
    if (!res.ok) return { ok: false, error: res.error };
    return {
        ok: true,
        message: `${res.dryRun ? 'DRY RUN: ' : ''}${res.refunded} refunded · ${res.failed} failed · ${res.skipped} skipped`,
    };
}

function refresh(profileId: string) {
    revalidatePath(`/admin/users/${profileId}`);
    revalidatePath('/admin/users');
}

/** RETRY (failed) or REFUND (requested / skipped / pending): run exactly this row. */
export async function runBanRefundRow(rowId: string): Promise<RefundActionResult> {
    const { profile } = await requirePlatformAdmin();
    const loaded = await loadRow(rowId);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const { row } = loaded;

    // A claim left in 'refunding' by a crashed run may be retried once it is stale.
    if (row.status === 'refunding') {
        const age = Date.now() - new Date(row.last_attempt_at ?? row.updated_at ?? 0).getTime();
        if (age < REFUNDING_STALE_MS) return { ok: false, error: 'This refund is running right now. Wait a few minutes.' };
        await getSupabaseAdmin()
            .from('ban_refunds')
            .update({ status: 'failed', error: 'Stale claim reset by admin', updated_at: new Date().toISOString() })
            .eq('id', rowId)
            .eq('status', 'refunding');
    } else if (!['pending', 'requested', 'failed', 'skipped'].includes(row.status)) {
        return { ok: false, error: `A ${row.status} row cannot be run.` };
    }

    const res = await processBanRefunds(row.ban_id, { actor: profile, rowIds: [rowId], noSeed: true });
    refresh(row.profile_id);
    return summarize(res);
}

/** Withheld -> pending, then run it. Logged: this undoes an admin's own withhold decision. */
export async function releaseBanRefundRow(rowId: string): Promise<RefundActionResult> {
    const { profile } = await requirePlatformAdmin();
    const loaded = await loadRow(rowId);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const { row } = loaded;
    if (row.status !== 'withheld') return { ok: false, error: 'Only a withheld row can be released.' };

    const { error } = await getSupabaseAdmin()
        .from('ban_refunds')
        .update({
            status: 'pending',
            note: 'released by admin',
            decided_by: profile.profileId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', rowId)
        .eq('status', 'withheld');
    if (error) return { ok: false, error: error.message };

    await logAdminAction(profile, 'user.ban_refund_release', 'profile', row.profile_id, {
        ban_id: row.ban_id,
        row_id: rowId,
        order_id: row.order_id,
        ticket_id: row.ticket_id,
        event_id: row.event_id,
    });
    const res = await processBanRefunds(row.ban_id, { actor: profile, rowIds: [rowId], noSeed: true });
    refresh(row.profile_id);
    return summarize(res);
}

/** Requested (or pending/withheld) -> declined, with a note the admin writes. */
export async function declineBanRefundRow(rowId: string, note: string): Promise<RefundActionResult> {
    const { profile } = await requirePlatformAdmin();
    const trimmed = (note ?? '').trim();
    if (!trimmed) return { ok: false, error: 'A note is required to decline.' };
    if (trimmed.length > 1000) return { ok: false, error: 'Note is over 1000 characters.' };
    const loaded = await loadRow(rowId);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const { row } = loaded;
    if (!['requested', 'pending', 'withheld', 'failed', 'skipped'].includes(row.status)) {
        return { ok: false, error: `A ${row.status} row cannot be declined.` };
    }

    const { error } = await getSupabaseAdmin()
        .from('ban_refunds')
        .update({
            status: 'declined',
            note: trimmed,
            decided_by: profile.profileId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', rowId)
        .eq('status', row.status);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(profile, 'user.ban_refund_decline', 'profile', row.profile_id, {
        ban_id: row.ban_id,
        row_id: rowId,
        order_id: row.order_id,
        ticket_id: row.ticket_id,
        event_id: row.event_id,
        note: trimmed,
    });
    refresh(row.profile_id);
    return { ok: true, message: 'Declined.' };
}

/** RUN PENDING REFUNDS for a ban: seeds anything missing and runs every pending row. */
export async function runPendingBanRefunds(banId: string): Promise<RefundActionResult> {
    const { profile } = await requirePlatformAdmin();
    if (!UUID_RE.test(banId)) return { ok: false, error: 'Bad ban id.' };
    const res = await processBanRefunds(banId, { actor: profile });
    const { data } = await getSupabaseAdmin().from('user_bans').select('profile_id').eq('id', banId).maybeSingle();
    if ((data as any)?.profile_id) refresh((data as any).profile_id);
    return summarize(res);
}
