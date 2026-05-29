/**
 * Shop messaging — single thread view + composer. Server-rendered messages
 * list. Composer is a client component; realtime client component subscribes
 * to inserts.
 *
 * On load we bump the shop_page's membership.last_read_at = now() so the
 * unread badge on the list resets.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { RealtimeRefresh } from './RealtimeRefresh';
import { MessageComposer } from './MessageComposer';
import { markThreadRead } from '../actions';

export const metadata = { title: 'Thread' };

const MESSAGE_LIMIT = 100;
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

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

function initialsOf(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || '??').slice(0, 2).toUpperCase();
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

export default async function ShopThreadPage({
    params,
}: {
    params: Promise<{ slug: string; threadId: string }>;
}) {
    const { slug, threadId } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const admin = getSupabaseAdmin();
    const shopPageId = await fetchShopPageProfileId(shop.shopId);

    if (!shopPageId) {
        notFound();
    }

    // Verify thread exists, belongs to this shop, and shop_page is a member.
    const { data: thread } = await admin
        .from('chat_threads')
        .select('id, shop_id, kind, name')
        .eq('id', threadId)
        .maybeSingle();
    if (!thread || (thread as any).shop_id !== shop.shopId) {
        notFound();
    }

    const { data: shopMembership } = await admin
        .from('chat_thread_members')
        .select('profile_id')
        .eq('thread_id', threadId)
        .eq('profile_id', shopPageId)
        .maybeSingle();
    if (!shopMembership) {
        notFound();
    }

    // Fetch all members so we can identify the "other" participant.
    const { data: members } = await admin
        .from('chat_thread_members')
        .select('profile_id, profiles(id, handle, display_name, avatar_url, kind)')
        .eq('thread_id', threadId);

    const memberRows = (members as any[]) ?? [];
    const others = memberRows.filter((m) => m.profile_id !== shopPageId);
    const otherProfile = others[0]?.profiles ?? null;

    // Last 100 messages, oldest first for rendering top→bottom.
    const { data: messages } = await admin
        .from('chat_messages')
        .select('id, sender_id, body, created_at, sender:profiles(display_name)')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);
    const msgs = ((messages as any[]) ?? []).slice().reverse();

    // Mark this thread read for the shop_page. Fire-and-forget; we don't want
    // to block the render on it. Errors are swallowed inside the action.
    await markThreadRead(threadId, shop.shopId);

    const displayName = otherProfile?.display_name ?? (thread as any).name ?? 'DIRECT THREAD';
    const handle = otherProfile?.handle ?? null;
    const canSend = MANAGER_ROLES.has(role);

    return (
        <>
            <RealtimeRefresh threadId={threadId} />
            <div className="admin-page-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            border: '1px solid var(--line-mid)',
                            background: 'var(--bg-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontSize: 14,
                            letterSpacing: 1,
                            color: 'var(--gold)',
                        }}
                    >
                        {initialsOf(displayName)}
                    </div>
                    <div>
                        <div className="admin-page-title">{displayName.toUpperCase()}</div>
                        <div className="admin-page-sub">
                            {handle ? `@${handle} · ` : ''}CUSTOMER
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {handle && (
                        <Link
                            href={`/admin/users?q=${encodeURIComponent(handle)}`}
                            className="admin-action-btn muted"
                            style={{ textDecoration: 'none' }}
                        >
                            VIEW USER ›
                        </Link>
                    )}
                    <Link
                        href={`/shop/${slug}/messages`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        ‹ BACK
                    </Link>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    marginTop: 16,
                }}
            >
                <div
                    style={{
                        border: '1px solid var(--line-mid)',
                        background: 'var(--bg-0)',
                        padding: 16,
                        minHeight: 420,
                        maxHeight: '60vh',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {msgs.length === 0 ? (
                        <div className="admin-empty" style={{ margin: 'auto' }}>
                            NO MESSAGES YET. SEND ONE BELOW.
                        </div>
                    ) : (
                        msgs.map((m: any) => {
                            const isShop = m.sender_id === shopPageId;
                            const senderName = isShop
                                ? 'SHOP'
                                : m.sender?.display_name ?? '?';
                            return (
                                <div
                                    key={m.id}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: isShop ? 'flex-end' : 'flex-start',
                                        gap: 2,
                                    }}
                                >
                                    {!isShop && (
                                        <div
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--text-2)',
                                                fontFamily: 'var(--font-display)',
                                                letterSpacing: 'var(--track-wider)',
                                                marginBottom: 2,
                                            }}
                                        >
                                            {senderName.toUpperCase()}
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            maxWidth: '70%',
                                            padding: '8px 12px',
                                            background: isShop
                                                ? 'var(--gold)'
                                                : 'var(--bg-2)',
                                            color: isShop ? '#1a1a1a' : 'var(--text)',
                                            border: isShop
                                                ? '1px solid var(--gold)'
                                                : '1px solid var(--line-mid)',
                                            fontSize: 14,
                                            lineHeight: 1.4,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {m.body ?? ''}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: 'var(--text-2)',
                                            fontFamily: 'var(--font-display)',
                                            letterSpacing: 'var(--track-wider)',
                                            marginTop: 2,
                                        }}
                                    >
                                        {fmtTime(m.created_at)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <MessageComposer
                    threadId={threadId}
                    shopId={shop.shopId}
                    canSend={canSend}
                />
            </div>
        </>
    );
}
