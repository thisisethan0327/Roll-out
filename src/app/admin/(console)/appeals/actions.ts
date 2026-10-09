'use server';

/**
 * Platform-admin handling of rollout.user_ban_appeals (Part 2, migration 093).
 *
 * Every write re-checks requirePlatformAdmin() and calls a SERVICE-ROLE-ONLY RPC
 * with the admin's profile id as the explicit actor. The RPCs write their own
 * admin_audit rows ('appeal.review', 'appeal.uphold', 'appeal.overturn', with
 * {same_admin} in meta), so these actions do NOT call logAdminAction (that would
 * double-log). Appeals are decided by a human, ideally not the admin who issued
 * the ban: the RPC refuses the issuing admin unless p_same_admin_override is
 * true, and the UI then offers an explicit "decide anyway (logged)" checkbox.
 */
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { describeBanEnd, isBanSchemaMissing, SUPPORT_EMAIL } from '@/lib/ban';
import { sendPlatformNotification } from '@/lib/platform-notify';

export type AppealActionResult = { ok: boolean; error?: string; needsOverride?: boolean; needsMigration?: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_093 = 'Needs migration 093';
const MAX_NOTE = 1000;
const MAX_PUBLIC_NOTE = 600;

function refresh(profileId?: string | null) {
    revalidatePath('/admin/appeals');
    revalidatePath('/admin/users');
    if (profileId) revalidatePath(`/admin/users/${profileId}`);
    revalidatePath('/admin/overview');
}

/** submitted -> in_review, recording this admin as the reviewer. */
export async function takeAppeal(appealId: string): Promise<AppealActionResult> {
    const { profile } = await requirePlatformAdmin();
    if (!UUID_RE.test(appealId)) return { ok: false, error: 'Bad appeal id.' };
    const { data, error } = await getSupabaseAdmin().rpc('review_ban_appeal', {
        p_appeal: appealId,
        p_actor: profile.profileId,
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: NEEDS_093, needsMigration: true };
        return { ok: false, error: error.message };
    }
    const state = (data as any)?.state as string | undefined;
    if (state === 'not_found') return { ok: false, error: 'Appeal not found.' };
    refresh();
    // 'already' = someone else took it first; the queue refresh shows the reviewer.
    return { ok: true };
}

/**
 * Decide an appeal. 'overturned' lifts the ban inside the same DB transaction
 * (no separate unban, so no separate "reinstated" email: the decision email says
 * it). 'upheld' keeps the ban.
 */
export async function decideAppeal(input: {
    appealId: string;
    decision: 'upheld' | 'overturned';
    note?: string;
    publicNote?: string;
    sameAdminOverride?: boolean;
}): Promise<AppealActionResult> {
    const { profile } = await requirePlatformAdmin();
    if (!UUID_RE.test(input.appealId)) return { ok: false, error: 'Bad appeal id.' };
    if (input.decision !== 'upheld' && input.decision !== 'overturned') return { ok: false, error: 'Bad decision.' };
    const note = (input.note ?? '').trim();
    const publicNote = (input.publicNote ?? '').trim();
    if (note.length > MAX_NOTE) return { ok: false, error: `Internal note is over ${MAX_NOTE} characters.` };
    if (publicNote.length > MAX_PUBLIC_NOTE) {
        return { ok: false, error: `Note to the member is over ${MAX_PUBLIC_NOTE} characters.` };
    }

    const svc = getSupabaseAdmin();
    const { data, error } = await svc.rpc('decide_ban_appeal', {
        p_appeal: input.appealId,
        p_decision: input.decision,
        p_note: note || null,
        p_public_note: publicNote || null,
        p_actor: profile.profileId,
        p_same_admin_override: input.sameAdminOverride === true,
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: NEEDS_093, needsMigration: true };
        if (/issuing admin cannot decide/i.test(error.message ?? '')) {
            return {
                ok: false,
                needsOverride: true,
                error: 'You issued this ban. Another admin should decide it.',
            };
        }
        return { ok: false, error: error.message };
    }

    const state = (data as any)?.state as string | undefined;
    if (state === 'not_found') return { ok: false, error: 'Appeal not found.' };
    if (state === 'already_decided') {
        refresh();
        return { ok: false, error: 'This appeal was already decided.' };
    }

    // Best-effort decision email. Prefer the contact address the member gave.
    const toProfile = ((data as any)?.profile_id as string | undefined) ?? null;
    const contactEmail = ((data as any)?.contact_email as string | null | undefined) ?? null;
    if (toProfile) {
        const { data: who } = await svc.from('profiles').select('handle, banned_until').eq('id', toProfile).maybeSingle();
        const overturned = input.decision === 'overturned';
        await sendPlatformNotification({
            template: 'platform_appeal_decided',
            toProfileId: toProfile,
            to: contactEmail || undefined,
            vars: {
                handle: (who as any)?.handle ?? null,
                decision: input.decision,
                public_note: publicNote || null,
                until_text: overturned ? null : describeBanEnd((who as any)?.banned_until ?? null) || null,
                refund_note: overturned
                    ? 'Tickets that were already refunded are not restored. You can buy again if spots are open.'
                    : null,
                support_email: SUPPORT_EMAIL,
            },
        });
    }
    refresh(toProfile);
    return { ok: true };
}
