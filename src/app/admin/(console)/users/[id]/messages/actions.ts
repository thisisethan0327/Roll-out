'use server';
/**
 * Admin read of a member's private DMs (Part 2, Ethan 2026-10-09: "for
 * disputes", each read needs a reason and is logged BEFORE any data returns).
 *
 * Authorization is requirePlatformAdmin() (server-side) AND the RPCs' own
 * is_platform_admin() check. The RPCs run on the ADMIN'S OWN session
 * (getRolloutMemberClient), never the service role, so the DB records the real
 * admin as the actor in admin_audit ('dm.list_threads' / 'dm.read_thread') in
 * the same transaction, before returning rows: "logged, else no read".
 *
 * The reason travels only as an argument of these actions (a POST body), never
 * in a URL, a cookie or a prop. This module does not log anything itself: the
 * RPC owns the audit row, so there is no double entry and no way for the web to
 * skip it.
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getRolloutMemberClient } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isBanSchemaMissing } from '@/lib/ban';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DM_REASON_MIN = 10;
const DM_REASON_MAX = 500;
const PAGE = 200;

export type DmMember = { profile_id: string; handle: string | null; display_name: string | null };
export type DmThread = {
    id: string;
    kind: string | null;
    name: string | null;
    shop_id: number | null;
    state: string | null;
    members: DmMember[];
    message_count: number;
    last_message_at: string | null;
};
export type DmMessage = {
    id: string;
    sender_id: string | null;
    sender_handle: string | null;
    body: string | null;
    media_urls: string[] | null;
    reply_to_id: string | null;
    edited_at: string | null;
    deleted_at: string | null;
    created_at: string;
};
export type DmAuditRow = { at: string; actor: string | null; action: string; reason: string | null };

export type ListThreadsResult = { ok: true; threads: DmThread[] } | { ok: false; error: string };
export type ReadThreadResult =
    | {
          ok: true;
          thread: Omit<DmThread, 'message_count' | 'last_message_at' | 'state'> & Record<string, unknown>;
          messages: DmMessage[];
          /** More (older) messages exist beyond this window. */
          hasMore: boolean;
          audit: DmAuditRow[];
      }
    | { ok: false; error: string };

function checkReason(reason: string): { ok: true; reason: string } | { ok: false; error: string } {
    const r = (reason ?? '').trim();
    if (r.length < DM_REASON_MIN) return { ok: false, error: `Give a reason of at least ${DM_REASON_MIN} characters.` };
    if (r.length > DM_REASON_MAX) return { ok: false, error: `Reason is over ${DM_REASON_MAX} characters.` };
    return { ok: true, reason: r };
}

function failure(error: { code?: string; message?: string }): { ok: false; error: string } {
    if (isBanSchemaMissing(error)) return { ok: false, error: 'Needs migration 093' };
    if (error.code === '42501') return { ok: false, error: 'Only platform admins can read direct messages.' };
    // The RPC's own reason validation messages are safe to show.
    return { ok: false, error: error.message || 'Could not load.' };
}

/** List the threads a member is in. Logged as dm.list_threads before returning. */
export async function adminListThreadsAction(profileId: string, reason: string): Promise<ListThreadsResult> {
    await requirePlatformAdmin();
    if (!UUID_RE.test(profileId)) return { ok: false, error: 'Bad member id.' };
    const r = checkReason(reason);
    if (!r.ok) return r;

    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('admin_list_threads', { p_profile: profileId, p_reason: r.reason });
    if (error) return failure(error);
    return { ok: true, threads: Array.isArray(data) ? (data as DmThread[]) : [] };
}

/** Read one thread (oldest-first window). Logged as dm.read_thread before returning. */
export async function adminReadThreadAction(
    threadId: string,
    reason: string,
    before?: string | null,
): Promise<ReadThreadResult> {
    await requirePlatformAdmin();
    if (!UUID_RE.test(threadId)) return { ok: false, error: 'Bad thread id.' };
    const r = checkReason(reason);
    if (!r.ok) return r;
    if (before && !Number.isFinite(new Date(before).getTime())) return { ok: false, error: 'Bad cursor.' };

    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('admin_read_thread', {
        p_thread: threadId,
        p_reason: r.reason,
        p_limit: PAGE,
        ...(before ? { p_before: before } : {}),
    });
    if (error) return failure(error);

    const payload = (data ?? {}) as { thread?: any; messages?: DmMessage[] };
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    // The last 10 admin views of this thread, for the "this view is logged" strip.
    let audit: DmAuditRow[] = [];
    try {
        const admin = getSupabaseAdmin();
        const { data: rows } = await admin
            .from('admin_audit')
            .select('actor_profile_id, action, meta, created_at')
            .eq('subject_type', 'chat_thread')
            .eq('subject_id', threadId)
            .order('created_at', { ascending: false })
            .limit(10);
        const list = (rows as any[]) ?? [];
        const ids = [...new Set(list.map((x) => x.actor_profile_id).filter(Boolean))] as string[];
        const handles = new Map<string, string>();
        if (ids.length) {
            const { data: ps } = await admin.from('profiles').select('id, handle').in('id', ids);
            for (const p of (ps as any[]) ?? []) handles.set(p.id, p.handle);
        }
        audit = list.map((x) => ({
            at: x.created_at,
            actor: x.actor_profile_id ? (handles.get(x.actor_profile_id) ?? null) : null,
            action: x.action,
            reason: typeof x.meta?.reason === 'string' ? x.meta.reason : null,
        }));
    } catch {
        audit = [];
    }

    return {
        ok: true,
        thread: payload.thread ?? { id: threadId, kind: null, name: null, shop_id: null, members: [] },
        messages,
        hasMore: messages.length >= PAGE,
        audit,
    };
}
