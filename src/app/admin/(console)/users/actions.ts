'use server';
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PERMANENT_BAN_UNTIL, isBanSchemaMissing } from '@/lib/ban';

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

export type BanActionResult = { ok: true } | { ok: false; error: string; needsMigration?: boolean };

const NEEDS_091 = 'Needs migration 091';
const BAN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON = 1000;
const MAX_PUBLIC_NOTE = 300;

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
    input: { reason: string; until: string; publicNote?: string },
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

    const target = await loadBanTarget(profileId, me.profileId);
    if (!target.ok) return target;

    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc('set_profile_ban', {
        p_profile: profileId,
        p_until: untilIso,
        p_reason: reason,
        p_public_note: publicNote || null,
        p_actor: me.profileId,
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: NEEDS_091, needsMigration: true };
        return { ok: false, error: error.message };
    }
    // Mirrors the user_bans history row (reason is internal; this log is admin-only).
    await logAdminAction(me, 'user.ban', 'profile', profileId, {
        until: untilIso,
        permanent: input.until === 'permanent',
        reason,
        has_public_note: Boolean(publicNote),
    });
    revalidateBanViews(profileId, target.handle);
    return { ok: true };
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
    revalidateBanViews(profileId, (target as any)?.handle ?? null);
    return { ok: true };
}
