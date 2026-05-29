/**
 * Shop messaging — thread list. Lists every chat_thread that the shop_page
 * profile is a member of, sorted by last_message_at desc.
 *
 * We can't reuse the rollout.chat_thread_cards view here because the view is
 * filtered by auth.uid() — and the shop_page profile has no auth user. So we
 * do a flat query in JS: list memberships → join threads → fetch each
 * thread's latest message + other member in parallel. Capped at 50 threads.
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { NewMessageDialog } from './NewMessageDialog';

export const metadata = { title: 'Messages' };

const THREAD_CAP = 50;
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type ThreadRow = {
    id: string;
    kind: 'direct' | 'group';
    name: string | null;
    avatar_url: string | null;
    created_at: string;
    shopPageLastReadAt: string | null;
    lastMessage: string | null;
    lastMessageAt: string | null;
    lastSenderId: string | null;
    lastSenderName: string | null;
    otherProfile: {
        id: string;
        handle: string;
        displayName: string;
        avatarUrl: string | null;
    } | null;
    unreadCount: number;
};

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

async function loadThreads(shopPageId: string): Promise<ThreadRow[]> {
    const admin = getSupabaseAdmin();

    // Pull every thread the shop_page is a member of, with thread metadata
    // co-fetched via inner join.
    const { data: memberships } = await admin
        .from('chat_thread_members')
        .select(
            `thread_id, last_read_at,
             chat_threads!inner(id, kind, name, avatar_url, created_at)`,
        )
        .eq('profile_id', shopPageId);

    const rows = ((memberships as any[]) ?? []).map((m) => ({
        threadId: m.thread_id as string,
        thread: m.chat_threads,
        shopPageLastReadAt: (m.last_read_at as string | null) ?? null,
    }));

    if (rows.length === 0) return [];

    // Per-thread sub-fetches in parallel: latest message + other member info.
    const enriched = await Promise.all(
        rows.map(async (row) => {
            // Latest message
            const { data: lastMsg } = await admin
                .from('chat_messages')
                .select('body, created_at, sender_id, sender:profiles(display_name)')
                .eq('thread_id', row.threadId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // "Other" member — only meaningful for direct threads where the
            // shop_page is one of two members. For groups we leave it null.
            let otherProfile: ThreadRow['otherProfile'] = null;
            if (row.thread?.kind === 'direct') {
                const { data: members } = await admin
                    .from('chat_thread_members')
                    .select('profile_id, profiles(id, handle, display_name, avatar_url)')
                    .eq('thread_id', row.threadId);
                const others = ((members as any[]) ?? []).filter(
                    (m) => m.profile_id !== shopPageId,
                );
                const o = others[0];
                if (o?.profiles) {
                    otherProfile = {
                        id: o.profiles.id,
                        handle: o.profiles.handle,
                        displayName: o.profiles.display_name,
                        avatarUrl: o.profiles.avatar_url ?? null,
                    };
                }
            }

            // Unread = count of messages newer than shop_page's last_read_at.
            // last_read_at = null means "all unread" (treat epoch as cutoff).
            const cutoff = row.shopPageLastReadAt ?? '1970-01-01T00:00:00.000Z';
            const { count: unreadCount } = await admin
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('thread_id', row.threadId)
                .is('deleted_at', null)
                .gt('created_at', cutoff)
                // Don't count the shop's own outgoing messages as unread
                .neq('sender_id', shopPageId);

            const t: ThreadRow = {
                id: row.threadId,
                kind: row.thread?.kind ?? 'direct',
                name: row.thread?.name ?? null,
                avatar_url: row.thread?.avatar_url ?? null,
                created_at: row.thread?.created_at ?? '',
                shopPageLastReadAt: row.shopPageLastReadAt,
                lastMessage: (lastMsg as any)?.body ?? null,
                lastMessageAt: (lastMsg as any)?.created_at ?? null,
                lastSenderId: (lastMsg as any)?.sender_id ?? null,
                lastSenderName: (lastMsg as any)?.sender?.display_name ?? null,
                otherProfile,
                unreadCount: unreadCount ?? 0,
            };
            return t;
        }),
    );

    enriched.sort((a, b) => {
        const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : Date.parse(a.created_at);
        const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : Date.parse(b.created_at);
        return tb - ta;
    });

    return enriched.slice(0, THREAD_CAP);
}

function initialsOf(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || '??').slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'NOW';
    if (diffMin < 60) return `${diffMin}M`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}H`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}D`;
    return d.toISOString().slice(0, 10);
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '(NO MESSAGES YET)';
    if (s.length <= n) return s;
    return s.slice(0, n).trimEnd() + '…';
}

export default async function ShopMessagesPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ q?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { q } = await searchParams;

    const shopPageId = await fetchShopPageProfileId(shop.shopId);

    if (!shopPageId) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">MESSAGES</div>
                        <div className="admin-page-sub">{shop.name.toUpperCase()}</div>
                    </div>
                </div>
                <div className="admin-empty">
                    NO SHOP PAGE PROFILE FOUND — CONTACT SUPPORT.
                </div>
            </>
        );
    }

    const allThreads = await loadThreads(shopPageId);

    // Client-side search filter on display_name + handle + last_sender_name + name.
    const needle = (q ?? '').trim().toLowerCase().replace(/^@/, '');
    const threads = needle
        ? allThreads.filter((t) => {
              const haystack = [
                  t.otherProfile?.handle,
                  t.otherProfile?.displayName,
                  t.lastSenderName,
                  t.name,
              ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
              return haystack.includes(needle);
          })
        : allThreads;

    const unreadTotal = allThreads.reduce((acc, t) => acc + t.unreadCount, 0);
    const isManager = MANAGER_ROLES.has(role);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">MESSAGES</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {allThreads.length} THREADS
                        {unreadTotal > 0 ? ` · ${unreadTotal} UNREAD` : ''}
                    </div>
                </div>
                {isManager && <NewMessageDialog shopId={shop.shopId} />}
            </div>

            <form className="admin-search" action={`/shop/${slug}/messages`}>
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH HANDLE OR NAME"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th style={{ width: 40 }}></th>
                            <th>CUSTOMER</th>
                            <th>LAST MESSAGE</th>
                            <th style={{ width: 90 }}>WHEN</th>
                            <th style={{ width: 80, textAlign: 'right' }}>UNREAD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {threads.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">
                                        {needle
                                            ? 'NO THREADS MATCH YOUR SEARCH.'
                                            : 'NO MESSAGES YET. CUSTOMERS WHO DM YOUR SHOP WILL APPEAR HERE.'}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            threads.map((t) => {
                                const href = `/shop/${slug}/messages/${t.id}`;
                                const displayName =
                                    t.otherProfile?.displayName ??
                                    t.name ??
                                    'DIRECT THREAD';
                                const handle = t.otherProfile?.handle;
                                const isShopSend = t.lastSenderId === shopPageId;
                                const prefix = isShopSend ? 'YOU: ' : '';
                                return (
                                    <tr key={t.id}>
                                        <td>
                                            <div
                                                style={{
                                                    width: 32,
                                                    height: 32,
                                                    border: '1px solid var(--line-mid)',
                                                    background: 'var(--bg-2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 11,
                                                    letterSpacing: 1,
                                                    color: 'var(--gold)',
                                                }}
                                            >
                                                {initialsOf(displayName)}
                                            </div>
                                        </td>
                                        <td>
                                            <Link href={href} className="text-link">
                                                {displayName}
                                            </Link>
                                            {handle && (
                                                <div className="admin-handle">@{handle}</div>
                                            )}
                                        </td>
                                        <td style={{ maxWidth: 360 }}>
                                            <Link
                                                href={href}
                                                style={{
                                                    color: 'var(--text-2)',
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                {prefix}
                                                {truncate(t.lastMessage, 80)}
                                            </Link>
                                        </td>
                                        <td>
                                            <span className="admin-handle">
                                                {relativeTime(t.lastMessageAt ?? t.created_at)}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {t.unreadCount > 0 ? (
                                                <span className="admin-pill gold">
                                                    {t.unreadCount}
                                                </span>
                                            ) : (
                                                <span
                                                    style={{
                                                        color: 'var(--text-2)',
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
