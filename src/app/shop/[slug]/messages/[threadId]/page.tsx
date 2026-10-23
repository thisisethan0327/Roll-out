/**
 * Shop messaging — single thread view + composer. Server-rendered message list;
 * the composer + RealtimeRefresh are client components.
 *
 * Two thread models are handled:
 *   kind='shop'         — unified shop DM (P2 §3.4). The customer is the only
 *                         member; staff read/reply via shop membership. Replies
 *                         post as the STAFF member's own profile
 *                         (sendShopThreadMessage). No shop-side read state, so
 *                         nothing to mark-read here.
 *   kind='direct'/group — legacy shop_page threads. The synthetic shop_page is a
 *                         member; staff post AS the shop (sendMessageAsShop) and
 *                         we bump the shop_page's last_read_at on open.
 *
 * Access is already gated by requireShopMemberBySlug; we additionally verify the
 * thread belongs to this shop.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { RealtimeRefresh } from './RealtimeRefresh';
import { MessageComposer } from './MessageComposer';
import { ShopThreadComposer } from './ShopThreadComposer';
import { markThreadRead } from '../actions';
import { MessagesSquare, UserRound } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { cx, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Thread' };

const MESSAGE_LIMIT = 100;
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const INSTALLER_ROLES = new Set(['owner', 'admin', 'manager', 'installer']);

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    if (error) console.error('[shop/messages/[threadId]] fetchShopPageProfileId failed:', error.message);
    return (data as any)?.id ?? null;
}

function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (sameDay) return hhmm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

type MessageBubble = {
    id: string;
    body: string | null;
    created_at: string | null;
    isOutbound: boolean;
    senderName: string;
};

export default async function ShopThreadPage({
    params,
}: {
    params: Promise<{ slug: string; threadId: string }>;
}) {
    const { slug, threadId } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const admin = getSupabaseAdmin();

    // Verify thread exists and belongs to this shop.
    const { data: thread, error: threadError } = await admin
        .from('chat_threads')
        .select('id, shop_id, kind, name, customer_profile_id')
        .eq('id', threadId)
        .maybeSingle();
    if (threadError) console.error('[shop/messages/[threadId]] thread load failed:', threadError.message);
    if (!thread || (thread as any).shop_id !== shop.shopId) {
        notFound();
    }

    const kind = (thread as any).kind as string;
    const isShopThread = kind === 'shop';

    let displayName = (thread as any).name ?? 'Direct thread';
    let handle: string | null = null;
    let bubbles: MessageBubble[] = [];
    let canSend = false;

    if (isShopThread) {
        // Unified shop DM. Resolve the customer; staff reply as themselves.
        const customerId: string | null = (thread as any).customer_profile_id ?? null;
        if (customerId) {
            const { data: customer } = await admin
                .from('profiles')
                .select('handle, display_name')
                .eq('id', customerId)
                .maybeSingle();
            displayName = (customer as any)?.display_name ?? displayName;
            handle = (customer as any)?.handle ?? null;
        }

        const { data: messages, error: messagesError } = await admin
            .from('chat_messages')
            .select('id, sender_id, body, created_at, sender:profiles(display_name)')
            .eq('thread_id', threadId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(MESSAGE_LIMIT);
        if (messagesError)
            console.error('[shop/messages/[threadId]] messages load failed:', messagesError.message);

        bubbles = ((messages as any[]) ?? [])
            .slice()
            .reverse()
            .map((m) => {
                const outbound = m.sender_id !== customerId; // shop-side (staff)
                return {
                    id: m.id,
                    body: m.body ?? '',
                    created_at: m.created_at,
                    isOutbound: outbound,
                    senderName: outbound ? m.sender?.display_name ?? 'Staff' : m.sender?.display_name ?? '?',
                };
            });

        canSend = INSTALLER_ROLES.has(role);
    } else {
        // Legacy shop_page thread.
        const shopPageId = await fetchShopPageProfileId(shop.shopId);
        if (!shopPageId) notFound();

        const { data: shopMembership } = await admin
            .from('chat_thread_members')
            .select('profile_id')
            .eq('thread_id', threadId)
            .eq('profile_id', shopPageId)
            .maybeSingle();
        if (!shopMembership) notFound();

        const { data: members } = await admin
            .from('chat_thread_members')
            .select('profile_id, profiles(handle, display_name)')
            .eq('thread_id', threadId);
        const other = ((members as any[]) ?? []).find((m) => m.profile_id !== shopPageId);
        if (other?.profiles) {
            displayName = other.profiles.display_name ?? displayName;
            handle = other.profiles.handle ?? null;
        }

        const { data: messages, error: messagesError } = await admin
            .from('chat_messages')
            .select('id, sender_id, body, created_at, sender:profiles(display_name)')
            .eq('thread_id', threadId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(MESSAGE_LIMIT);
        if (messagesError)
            console.error('[shop/messages/[threadId]] messages load failed:', messagesError.message);

        bubbles = ((messages as any[]) ?? [])
            .slice()
            .reverse()
            .map((m) => {
                const outbound = m.sender_id === shopPageId;
                return {
                    id: m.id,
                    body: m.body ?? '',
                    created_at: m.created_at,
                    isOutbound: outbound,
                    senderName: outbound ? 'SHOP' : m.sender?.display_name ?? '?',
                };
            });

        // Bump the shop_page's last_read_at so the unread badge resets.
        await markThreadRead(threadId, shop.shopId);

        canSend = MANAGER_ROLES.has(role);
    }

    return (
        <div className={sh.stack}>
            <RealtimeRefresh threadId={threadId} />
            <ConsoleHead
                back={{ href: `/shop/${slug}/messages${isShopThread ? '' : '?tab=shop-page'}`, label: 'Messages' }}
                title={displayName}
                sub={`${handle ? `@${handle} · ` : ''}${isShopThread ? 'Direct message' : 'Shop page thread'}`}
                actions={
                    handle ? (
                        <Link href={`/admin/users?q=${encodeURIComponent(handle)}`} className={cx('g-sec g-sec--ink', sh.secSm)}>
                            <UserRound size={17} strokeWidth={2} aria-hidden="true" />
                            View user
                        </Link>
                    ) : null
                }
            />

            <section className="g-card" aria-label={`Conversation with ${displayName}`}>
                <div className={sh.chat} style={{ minHeight: 380, maxHeight: '62vh', overflowY: 'auto' }}>
                    {bubbles.length === 0 ? (
                        <div className={sh.tblEmpty} style={{ margin: 'auto' }}>
                            <span className="g-ic g-ic--sm" aria-hidden="true">
                                <MessagesSquare size={18} strokeWidth={2} />
                            </span>
                            <span>
                                <b>No messages yet</b>
                                {canSend ? <small>Send the first one below.</small> : null}
                            </span>
                        </div>
                    ) : (
                        bubbles.map((m) => (
                            <div key={m.id} className={cx(sh.msg, m.isOutbound ? sh.msgOut : sh.msgIn)}>
                                {!m.isOutbound || isShopThread ? (
                                    <span className={sh.msgMeta}>
                                        <b>{m.senderName === 'SHOP' ? 'Shop' : m.senderName}</b>
                                    </span>
                                ) : null}
                                <div className={sh.bubble}>{m.body ?? ''}</div>
                                <span className={sh.msgMeta}>{fmtTime(m.created_at)}</span>
                            </div>
                        ))
                    )}
                </div>
                <div style={{ padding: '4px 16px 16px' }}>
                    {isShopThread ? (
                        <ShopThreadComposer threadId={threadId} shopId={shop.shopId} canSend={canSend} />
                    ) : (
                        <MessageComposer threadId={threadId} shopId={shop.shopId} canSend={canSend} />
                    )}
                </div>
            </section>
        </div>
    );
}
