'use server';
/**
 * Server actions for the shop messaging surface.
 *
 * Concept: the shop_page profile (rollout.profiles where kind='shop_page')
 * is a synthetic participant in chat_threads. Customers DM "the shop" via
 * the shop_page profile's id. Staff (manager+) can post on behalf of the
 * shop — these actions insert chat_messages with sender_id = shop_page id
 * via the service role, since chat_messages RLS only allows
 * sender_id = current_profile_id() and the shop_page has no auth_user_id.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const INSTALLER_ROLES = new Set(['owner', 'admin', 'manager', 'installer']);

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) {
        throw new Error('Manager role required.');
    }
    return { profile, role };
}

async function requireInstaller(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!INSTALLER_ROLES.has(role)) {
        throw new Error('Installer role required.');
    }
    return { profile, role };
}

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    return (data as any)?.id ?? null;
}

async function assertShopPageIsMember(threadId: string, shopPageId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('chat_thread_members')
        .select('profile_id')
        .eq('thread_id', threadId)
        .eq('profile_id', shopPageId)
        .maybeSingle();
    return !!data;
}

/**
 * Post a chat_messages row as the shop_page profile. Requires manager+.
 * Bypasses chat_messages RLS via the service-role admin client.
 */
export async function sendMessageAsShop(
    threadId: string,
    shopId: number,
    body: string,
): Promise<void> {
    await requireManager(shopId);
    const trimmed = body.trim();
    if (!trimmed) throw new Error('Empty message.');

    const admin = getSupabaseAdmin();

    // Defense in depth: the thread must belong to this shop, and the
    // shop_page profile must already be a member of the thread.
    const { data: thread, error: threadErr } = await admin
        .from('chat_threads')
        .select('id, shop_id')
        .eq('id', threadId)
        .maybeSingle();
    if (threadErr || !thread) throw new Error('Thread not found.');
    if ((thread as any).shop_id !== shopId) {
        throw new Error('Thread belongs to a different shop.');
    }

    const shopPageId = await fetchShopPageProfileId(shopId);
    if (!shopPageId) throw new Error('Shop page profile missing.');

    const isMember = await assertShopPageIsMember(threadId, shopPageId);
    if (!isMember) throw new Error('Shop is not a participant of this thread.');

    const { error: insertErr } = await admin.from('chat_messages').insert({
        thread_id: threadId,
        sender_id: shopPageId,
        body: trimmed,
    });
    if (insertErr) throw new Error(`message insert failed: ${insertErr.message}`);

    const slug = await fetchSlug(shopId);
    if (slug) {
        revalidatePath(`/shop/${slug}/messages`, 'page');
        revalidatePath(`/shop/${slug}/messages/${threadId}`, 'page');
    }
}

/**
 * Look up a customer by @handle (case-insensitive) and either return an
 * existing direct thread between the shop_page and that customer, or create
 * one. Manager+ only. Redirects to the thread page on success.
 *
 * We can't call rollout.find_or_create_direct_thread() RPC because that
 * pulls the caller's profile from auth.uid(), and the shop_page has no
 * authenticated session. Instead we manually insert chat_threads +
 * chat_thread_members via the service role.
 */
export async function createDirectThreadWithCustomer(
    shopId: number,
    customerHandle: string,
): Promise<void> {
    await requireManager(shopId);

    const handle = (customerHandle ?? '').trim().replace(/^@/, '');
    if (!handle) throw new Error('Handle required.');

    const admin = getSupabaseAdmin();

    const shopPageId = await fetchShopPageProfileId(shopId);
    if (!shopPageId) throw new Error('Shop page profile missing.');

    // Resolve the customer's profile by handle.
    const { data: customer, error: custErr } = await admin
        .from('profiles')
        .select('id, kind')
        .eq('handle', handle)
        .maybeSingle();
    if (custErr) throw new Error(`profile lookup failed: ${custErr.message}`);
    if (!customer) throw new Error(`No profile @${handle}.`);
    if ((customer as any).id === shopPageId) {
        throw new Error('Cannot DM the shop itself.');
    }

    // Try to find an existing direct thread where exactly the shop_page and
    // this customer are the two members. We do this with a two-step lookup:
    //   1. List direct threads in this shop where the customer is a member.
    //   2. For each, check the shop_page is also a member and member_count = 2.
    const { data: candidateMemberships } = await admin
        .from('chat_thread_members')
        .select('thread_id, chat_threads!inner(id, shop_id, kind)')
        .eq('profile_id', (customer as any).id);

    const candidates = ((candidateMemberships as any[]) ?? []).filter(
        (m) =>
            m.chat_threads?.shop_id === shopId &&
            m.chat_threads?.kind === 'direct',
    );

    let foundThreadId: string | null = null;
    for (const cand of candidates) {
        const threadId = cand.thread_id;
        const { data: members } = await admin
            .from('chat_thread_members')
            .select('profile_id')
            .eq('thread_id', threadId);
        const ids = ((members as any[]) ?? []).map((r) => r.profile_id);
        if (ids.length === 2 && ids.includes(shopPageId) && ids.includes((customer as any).id)) {
            foundThreadId = threadId;
            break;
        }
    }

    let threadId = foundThreadId;
    if (!threadId) {
        // Create a fresh direct thread.
        const { data: newThread, error: threadErr } = await admin
            .from('chat_threads')
            .insert({
                shop_id: shopId,
                kind: 'direct',
                created_by: shopPageId,
            })
            .select('id')
            .single();
        if (threadErr || !newThread) {
            throw new Error(`thread insert failed: ${threadErr?.message ?? 'unknown'}`);
        }
        threadId = (newThread as any).id;

        const { error: membersErr } = await admin.from('chat_thread_members').insert([
            { thread_id: threadId, profile_id: shopPageId, role: 'admin' },
            { thread_id: threadId, profile_id: (customer as any).id, role: 'member' },
        ]);
        if (membersErr) {
            throw new Error(`member insert failed: ${membersErr.message}`);
        }
    }

    const slug = await fetchSlug(shopId);
    revalidatePath(`/shop/${slug}/messages`, 'page');
    redirect(`/shop/${slug}/messages/${threadId}`);
}

/**
 * Bump the shop_page's membership last_read_at = now() so the unread badge
 * for this thread on the list resets. Installer+ allowed.
 */
export async function markThreadRead(threadId: string, shopId: number): Promise<void> {
    await requireInstaller(shopId);
    const admin = getSupabaseAdmin();

    const shopPageId = await fetchShopPageProfileId(shopId);
    if (!shopPageId) return;

    // Verify thread belongs to this shop before touching membership.
    const { data: thread } = await admin
        .from('chat_threads')
        .select('id, shop_id')
        .eq('id', threadId)
        .maybeSingle();
    if (!thread || (thread as any).shop_id !== shopId) return;

    await admin
        .from('chat_thread_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('profile_id', shopPageId);
}
