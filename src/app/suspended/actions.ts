'use server';
/**
 * Server actions behind /suspended (Part 2). A banned member may do exactly two
 * things besides sign out: file ONE appeal per ban, and (temporary bans only)
 * request a refund for a ticket. Both go through SECURITY DEFINER RPCs on the
 * member's OWN session, because current_profile_id() is NULL for a banned caller
 * and the RPCs resolve the caller via auth.uid() (migration 093). Before 093 the
 * RPCs do not exist; the actions say so instead of failing.
 */
import { revalidatePath } from 'next/cache';
import { getConsumerProfile, getRolloutMemberClient } from '@/lib/consumer';
import { isProfileBanned, isBanSchemaMissing, APPEAL_MAX, APPEAL_MIN, SUPPORT_EMAIL } from '@/lib/ban';
import { sendPlatformNotification } from '@/lib/platform-notify';

export type AppealResult = { ok: boolean; error?: string; message?: string };

const SOON = `Appeals open soon — email ${SUPPORT_EMAIL}`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One appeal per ban. The text and optional contact email come from the form only. */
export async function submitBanAppealAction(_prev: AppealResult | null, formData: FormData): Promise<AppealResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Sign in again.' };
    if (!isProfileBanned(me)) return { ok: false, error: 'Your account is not suspended.' };

    const text = (formData.get('text')?.toString() ?? '').trim();
    if (text.length < APPEAL_MIN) return { ok: false, error: `Please write at least ${APPEAL_MIN} characters.` };
    if (text.length > APPEAL_MAX) return { ok: false, error: `Please keep it under ${APPEAL_MAX} characters.` };
    const contact = (formData.get('contact')?.toString() ?? '').trim();
    if (contact && (contact.length > 254 || !EMAIL_RE.test(contact))) {
        return { ok: false, error: 'That contact email does not look right.' };
    }

    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('submit_ban_appeal', {
        p_text: text,
        p_contact_email: contact || null,
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: SOON };
        console.error('[suspended] submit_ban_appeal failed:', error.code, error.message);
        return { ok: false, error: `Could not send your appeal. Try again, or email ${SUPPORT_EMAIL}.` };
    }

    const state = (data as any)?.state as string | undefined;
    if (state === 'submitted') {
        // Best-effort acknowledgement; the appeal is already stored.
        await sendPlatformNotification({
            template: 'platform_appeal_received',
            toProfileId: me.profileId,
            to: contact || undefined,
            vars: {
                handle: me.handle,
                submitted_at: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }),
                target_text: 'within 5 business days',
                appeal_url: 'https://rollout.club/suspended',
                support_email: SUPPORT_EMAIL,
            },
        });
        revalidatePath('/suspended');
        return { ok: true, message: 'Appeal received.' };
    }
    if (state === 'already') {
        revalidatePath('/suspended');
        return { ok: true, message: 'You already appealed this suspension.' };
    }
    if (state === 'invalid') {
        return { ok: false, error: 'Please check your appeal text and contact email.' };
    }
    if (state === 'not_banned') return { ok: false, error: 'Your account is not suspended.' };
    return { ok: false, error: 'Could not send your appeal.' };
}

/** Temporary bans: ask for a refund for one ticket. An admin decides. */
export async function requestBanRefundAction(target: {
    orderId?: string | null;
    ticketId?: string | null;
}): Promise<AppealResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Sign in again.' };
    if (!isProfileBanned(me)) return { ok: false, error: 'Your account is not suspended.' };

    const orderId = target.orderId?.trim() || null;
    const ticketId = target.ticketId?.trim() || null;
    if ((!orderId && !ticketId) || (orderId && ticketId)) return { ok: false, error: 'Pick one ticket.' };
    if (ticketId && !UUID_RE.test(ticketId)) return { ok: false, error: 'Pick one ticket.' };
    if (orderId && orderId.length > 200) return { ok: false, error: 'Pick one ticket.' };

    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('request_ban_refund', {
        ...(orderId ? { p_order_id: orderId } : {}),
        ...(ticketId ? { p_ticket_id: ticketId } : {}),
    });
    if (error) {
        if (isBanSchemaMissing(error)) return { ok: false, error: `Refund requests open soon — email ${SUPPORT_EMAIL}` };
        console.error('[suspended] request_ban_refund failed:', error.code, error.message);
        return { ok: false, error: `That ticket can't be refunded this way. Email ${SUPPORT_EMAIL}.` };
    }
    const state = (data as any)?.state as string | undefined;
    revalidatePath('/suspended');
    if (state === 'requested') return { ok: true, message: 'Refund requested.' };
    if (state === 'already') return { ok: true, message: 'You already asked for this refund.' };
    return { ok: false, error: `That ticket can't be refunded this way. Email ${SUPPORT_EMAIL}.` };
}
