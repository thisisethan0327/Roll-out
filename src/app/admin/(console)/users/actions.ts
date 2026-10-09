'use server';
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PERMANENT_BAN_UNTIL, describeBanEnd, isBanSchemaMissing } from '@/lib/ban';
import { processBanRefunds } from '@/lib/ban-refunds';
import { sendPlatformNotification } from '@/lib/platform-notify';

export async function setVerified(profileId: string, verified: boolean) {
    const { profile: me } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', profileId);
    if (error) throw new Error(error.message);
    await logAdminAction(me, verified ? 'user.verify' : 'user.unverify', 'profile', profileId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/shops');
}

export async function grantPlatformAdmin(profileId: string, grantedBy: string) {
    const { profile: me } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('platform_admins')
        .insert({ profile_id: profileId, granted_by: grantedBy, notes: 'granted via admin console' });
    if (error && error.code !== '23505') throw new Error(error.message);
    if (!error) await logAdminAction(me, 'admin.grant', 'profile', profileId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function revokePlatformAdmin(profileId: string) {
    const { profile: me } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('platform_admins')
        .delete()
        .eq('profile_id', profileId);
    if (error) throw new Error(error.message);
    await logAdminAction(me, 'admin.revoke', 'profile', profileId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function grantMeetCoordinator(profileId: string, grantedBy: string) {
    const { profile: me } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('meet_coordinators')
        .insert({ profile_id: profileId, granted_by: grantedBy, notes: 'granted via admin console' });
    if (error && error.code !== '23505') throw new Error(error.message);
    if (!error) await logAdminAction(me, 'coordinator.grant', 'profile', profileId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
    revalidatePath('/admin/overview');
}

export async function revokeMeetCoordinator(profileId: string) {
    const { profile: me } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('meet_coordinators')
        .delete()
        .eq('profile_id', profileId);
    if (error) throw new Error(error.message);
    await logAdminAction(me, 'coordinator.revoke', 'profile', profileId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/permissions');
}

// ── Rollout ban (migration 091) ─────────────────────────────────────────────
// A Rollout-only suspension: profiles.banned_until + a rollout.user_bans history
// row, both written by the service-role-only RPCs set_profile_ban /
// clear_profile_ban. It never touches auth.users (the same login serves
// EMWRAPS, NeferStock and UNITY). The account-wide auth lock is a later feature.

export type BanRefundOutcome = {
    refunded: number;
    failed: number;
    withheld: number;
    dryRun: boolean;
    /** Why the job could not run (e.g. migration 093 not applied). */
    note?: string;
};

export type BanActionResult =
    | {
          ok: true;
          /** Permanent ban only: what the refund job did. Absent for a temporary ban or before 093. */
          refunds?: BanRefundOutcome;
      }
    | { ok: false; error: string; needsMigration?: boolean };

/** The member-facing site (links in emails). */
const SITE = 'https://rollout.club';

const NEEDS_091 = 'Needs migration 091';
const BAN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON = 1000;
const MAX_PUBLIC_NOTE = 300;
const MAX_WITHHOLD_REASON = 1000;

function revalidateBanViews(profileId: string, handle?: string | null) {
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${profileId}`);
    revalidatePath('/admin/verifications');
    if (handle) revalidatePath(`/u/${handle}`);
    revalidatePath('/u/[handle]', 'page');
}

/** Shared target checks: exists, is a member (not a shop page), is not the admin, is not a platform admin. */
async function loadBanTarget(
    profileId: string,
    adminProfileId: string,
): Promise<{ ok: true; handle: string | null } | { ok: false; error: string }> {
    if (!BAN_UUID_RE.test(profileId)) return { ok: false, error: 'Invalid profile.' };
    if (profileId === adminProfileId) return { ok: false, error: "You can't ban yourself." };
    const admin = getSupabaseAdmin();
    const [{ data: target, error }, { data: padmin }] = await Promise.all([
        admin.from('profiles').select('id, handle, kind').eq('id', profileId).maybeSingle(),
        admin.from('platform_admins').select('profile_id').eq('profile_id', profileId).maybeSingle(),
    ]);
    if (error) return { ok: false, error: error.message };
    if (!target) return { ok: false, error: 'Profile not found.' };
    if ((target as any).kind !== 'user') return { ok: false, error: "Shop pages can't be banned." };
    if (padmin) return { ok: false, error: "Platform admins can't be banned." };
    return { ok: true, handle: (target as any).handle ?? null };
}

/**
 * Ban a member from Rollout. `until` is an ISO timestamp (must be in the
 * future) or 'permanent'. `reason` is internal (stored in user_bans, shown only
 * in the admin console); `publicNote` is what the member sees on /suspended.
 */
export async function banUser(
    profileId: string,
    input: {
        reason: string;
        until: string;
        publicNote?: string;
        /**
         * Permanent bans only: 'auto' (default) cancels and refunds upcoming paid
         * tickets; 'withhold' keeps the money with a required written reason
         * (fraud, chargebacks, abuse at an event). Ignored for a temporary ban,
         * where the member can request a refund instead.
         */
        refundMode?: 'auto' | 'withhold';
        refundWithheldReason?: string;
    },
): Promise<BanActionResult> {
    const { profile: me } = await requirePlatformAdmin();

    const reason = (input.reason ?? '').trim();
    if (!reason) return { ok: false, error: 'A reason is required.' };
    if (reason.length > MAX_REASON) return { ok: false, error: `Reason is over ${MAX_REASON} characters.` };
    const publicNote = (input.publicNote ?? '').trim();
    if (publicNote.length > MAX_PUBLIC_NOTE) return { ok: false, error: `Note to the member is over ${MAX_PUBLIC_NOTE} characters.` };

    let untilIso: string;
    if (input.until === 'permanent') {
        untilIso = PERMANENT_BAN_UNTIL;
    } else {
        const t = new Date(input.until);
        if (!Number.isFinite(t.getTime())) return { ok: false, error: 'Pick a valid end date.' };
        if (t.getTime() <= Date.now() + 60_000) return { ok: false, error: 'The end date must be in the future.' };
        if (t.getUTCFullYear() >= 9999) return { ok: false, error: 'Use PERMANENT for a ban with no end.' };
        untilIso = t.toISOString();
    }

    const permanent = input.until === 'permanent';
    const refundMode: 'auto' | 'withhold' | null = permanent
        ? input.refundMode === 'withhold'
            ? 'withhold'
            : 'auto'
        : null;
    const withheldReason = (input.refundWithheldReason ?? '').trim();
    if (refundMode === 'withhold') {
        if (!withheldReason) return { ok: false, error: 'A written reason is required to withhold refunds.' };
        if (withheldReason.length > MAX_WITHHOLD_REASON) {
            return { ok: false, error: `Withhold reason is over ${MAX_WITHHOLD_REASON} characters.` };
        }
    }

    const target = await loadBanTarget(profileId, me.profileId);
    if (!target.ok) return target;

    const admin = getSupabaseAdmin();
    // Migration 093 widens set_profile_ban to 7 args and returns the new ban row
    // id. Before 093 only the 5-arg form exists (PGRST202 on the 7-arg call), so
    // retry with it: the ban still lands, there is just no refund policy to store.
    const base = {
        p_profile: profileId,
        p_until: untilIso,
        p_reason: reason,
        p_public_note: publicNote || null,
        p_actor: me.profileId,
    };
    let { data: banData, error } = await admin.rpc('set_profile_ban', {
        ...base,
        p_refund_mode: refundMode,
        p_refund_withheld_reason: refundMode === 'withhold' ? withheldReason : null,
    });
    let legacy = false;
    if (error && error.code === 'PGRST202') {
        legacy = true;
        ({ data: banData, error } = await admin.rpc('set_profile_ban', base));
    }
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: NEEDS_091, needsMigration: true };
        return { ok: false, error: error.message };
    }

    // The ban row id: the RPC's return value (093), else the latest ban row.
    let banId: string | null = typeof banData === 'string' && BAN_UUID_RE.test(banData) ? banData : null;
    if (!banId) {
        const { data: latest } = await admin
            .from('user_bans')
            .select('id')
            .eq('profile_id', profileId)
            .eq('action', 'ban')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
        banId = ((latest as any)?.id as string | undefined) ?? null;
    }

    // Mirrors the user_bans history row (reason is internal; this log is admin-only).
    await logAdminAction(me, 'user.ban', 'profile', profileId, {
        until: untilIso,
        permanent,
        reason,
        has_public_note: Boolean(publicNote),
        ...(refundMode ? { refund_mode: refundMode } : {}),
        ...(refundMode === 'withhold' ? { refund_withheld_reason: withheldReason } : {}),
        ...(banId ? { ban_id: banId } : {}),
    });

    // Best-effort email (never blocks the ban). The member sees the same facts on /suspended.
    const refundLine = permanent
        ? refundMode === 'withhold'
            ? 'Refunds for your upcoming paid tickets are being reviewed. Reply to this email with any questions.'
            : 'Your upcoming paid tickets are being cancelled and refunded to your original payment method.'
        : 'Your tickets are kept. You can request a refund from the suspended screen.';
    await sendPlatformNotification({
        template: 'platform_account_suspended',
        toProfileId: profileId,
        vars: {
            handle: target.handle,
            until_text: describeBanEnd(untilIso),
            public_note: publicNote || null,
            refund_line: refundLine,
            appeal_url: `${SITE}/suspended`,
            support_email: 'support@rollout.club',
        },
    });

    // Permanent ban: cancel + refund upcoming paid tickets (or record them as withheld).
    let refunds: BanRefundOutcome | undefined;
    if (permanent && banId && !legacy) {
        const res = await processBanRefunds(banId, { actor: me });
        if (res.ok) {
            refunds = { refunded: res.refunded, failed: res.failed, withheld: res.withheld, dryRun: res.dryRun };
        } else {
            console.error('[admin/users] ban refund job did not run:', res.error);
            refunds = { refunded: 0, failed: 0, withheld: 0, dryRun: false, note: res.error };
        }
    }

    revalidateBanViews(profileId, target.handle);
    return refunds ? { ok: true, refunds } : { ok: true };
}

/** Lift a member's ban (history keeps both rows). `note` is optional and internal. */
export async function unbanUser(profileId: string, note?: string): Promise<BanActionResult> {
    const { profile: me } = await requirePlatformAdmin();
    if (!BAN_UUID_RE.test(profileId)) return { ok: false, error: 'Invalid profile.' };

    const trimmed = (note ?? '').trim();
    if (trimmed.length > MAX_REASON) return { ok: false, error: `Note is over ${MAX_REASON} characters.` };

    const admin = getSupabaseAdmin();
    const { data: target } = await admin.from('profiles').select('handle').eq('id', profileId).maybeSingle();

    const { error } = await admin.rpc('clear_profile_ban', {
        p_profile: profileId,
        p_note: trimmed || null,
        p_actor: me.profileId,
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: NEEDS_091, needsMigration: true };
        return { ok: false, error: error.message };
    }
    await logAdminAction(me, 'user.unban', 'profile', profileId, trimmed ? { note: trimmed } : {});

    // A lifted ban must not leave refunds queued: a later RUN would refund an
    // unbanned member's tickets. Void anything not yet started (fails soft
    // before migration 093, where the ledger does not exist).
    const voided = await admin
        .from('ban_refunds')
        .update({ status: 'declined', note: 'ban lifted', updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .in('status', ['pending', 'requested', 'skipped']);
    if (voided.error && !isBanSchemaMissing(voided.error)) {
        console.error('[admin/users] voiding queued ban refunds failed:', voided.error.message);
    }

    await sendPlatformNotification({
        template: 'platform_account_reinstated',
        toProfileId: profileId,
        vars: { handle: (target as any)?.handle ?? null, support_email: 'support@rollout.club' },
    });
    revalidateBanViews(profileId, (target as any)?.handle ?? null);
    return { ok: true };
}
