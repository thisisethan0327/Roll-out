/**
 * Platform (Rollout-branded) transactional email dispatch.
 *
 * Thin server-only wrapper over the `send-platform-notification` Edge Function
 * (deployed in the mobile repo). Invoked from server actions via the
 * service-role admin client — the function's auth gate is service-role-only, so
 * the admin client's key authorizes it. Every call is best-effort: a failed
 * send NEVER blocks the underlying action (application create / decision) — we
 * log and move on. The email_log audit row is written inside the function.
 */
import 'server-only';
import { getSupabaseAdmin } from './supabase/admin';

export type PlatformTemplate =
    | 'platform_application_received'
    | 'platform_application_approved'
    | 'platform_application_rejected'
    | 'platform_host_invite';

export interface PlatformNotifyInput {
    template: PlatformTemplate;
    to?: string;
    toProfileId?: string;
    /** Audit only; null for host lifecycle (no shop). */
    shopId?: number | null;
    subjectOverride?: string;
    vars?: Record<string, unknown>;
    linkedEventId?: string;
}

/**
 * Fire a platform notification. Returns `{ ok }` plus the raw response for
 * callers that want to surface a result (host invites). Never throws.
 */
export async function sendPlatformNotification(
    input: PlatformNotifyInput,
): Promise<{ ok: boolean; skipped?: string; error?: string; resend_id?: string }> {
    if (!input.to && !input.toProfileId) {
        return { ok: false, error: 'missing_recipient' };
    }
    try {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.functions.invoke('send-platform-notification', {
            body: {
                template: input.template,
                to: input.to,
                to_profile_id: input.toProfileId,
                shop_id: input.shopId ?? null,
                subject_override: input.subjectOverride,
                vars: input.vars ?? {},
                linked_event_id: input.linkedEventId,
            },
        });
        const respErr = (data as any)?.error;
        if (error || respErr) {
            console.error('[platform-notify] send failed', respErr ?? error?.message);
            return { ok: false, error: respErr ?? error?.message ?? 'send_failed' };
        }
        if ((data as any)?.skipped) {
            return { ok: false, skipped: String((data as any).skipped) };
        }
        return { ok: true, resend_id: (data as any)?.resend_id };
    } catch (e: any) {
        console.error('[platform-notify] threw', e?.message ?? e);
        return { ok: false, error: String(e?.message ?? e) };
    }
}
