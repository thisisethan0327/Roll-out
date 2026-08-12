/**
 * Shop messaging — thread list, two tabs:
 *
 *   DIRECT    — the unified shop DM inbox (P2 §3.4). chat_threads where
 *               kind='shop' AND shop_id = this shop. The customer is the thread's
 *               only member (customer_profile_id); staff read/reply via shop
 *               membership, not thread membership (mirrors can_access_thread).
 *   SHOP PAGE — legacy: chat_threads (direct/group) the synthetic shop_page
 *               profile is a member of. Kept so pre-P2 threads stay reachable.
 *
 * Gated by the MESSAGES module (in every tier incl. T1), so a storefront-only
 * shop like NeferStock still receives customer DMs. See report note on gating.
 *
 * We can't reuse rollout.chat_thread_cards (it filters by auth.uid() and neither
 * the shop_page nor the absent staff-membership matches), so we flat-query in JS
 * via the service role. Capped at 50 threads per tab. Realtime is scoped to the
 * open thread view; this list refreshes on navigation.
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { NewMessageDialog } from './NewMessageDialog';

export const metadata = { title: 'Messages' };

const THREAD_CAP = 50;
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const EPOCH = '1970-01-01T00:00:00.000Z';

type Tab = 'direct' | 'shop-page';

type ThreadRow = {
    id: string;
    name: string | null;
    created_at: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    /** true when the most recent message came from the shop side (staff or the
     *  shop_page), i.e. an outbound "YOU:" line. */
    lastIsOutbound: boolean;
    otherProfile: {
        handle: string | null;
        displayName: string | null;
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

/** SHOP PAGE tab: threads the shop_page profile is a member of. Unread = messages
 *  newer than the shop_page's last_read_at (its own outgoing excluded). */
async function loadShopPageThreads(shopPageId: string): Promise<ThreadRow[]> {
    const admin = getSupabaseAdmin();

    const { data: memberships } = await admin
        .from('chat_thread_members')
        .select(
            `thread_id, last_read_at,
             chat_threads!inner(id, kind, name, created_at)`,
        )
        .eq('profile_id', shopPageId);

    const rows = ((memberships as any[]) ?? []).map((m) => ({
        threadId: m.thread_id as string,
        thread: m.chat_threads,
        shopPageLastReadAt: (m.last_read_at as string | null) ?? null,
    }));
    if (rows.length === 0) return [];

    const enriched = await Promise.all(
        rows.map(async (row) => {
            const { data: lastMsg } = await admin
                .from('chat_messages')
                .select('body, created_at, sender_id')
                .eq('thread_id', row.threadId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            let otherProfile: ThreadRow['otherProfile'] = null;
            if (row.thread?.kind === 'direct') {
                const { data: members } = await admin
                    .from('chat_thread_members')
                    .select('profile_id, profiles(handle, display_name)')
                    .eq('thread_id', row.threadId);
                const other = ((members as any[]) ?? []).find((m) => m.profile_id !== shopPageId);
                if (other?.profiles) {
                    otherProfile = {
                        handle: other.profiles.handle,
                        displayName: other.profiles.display_name,
                    };
                }
            }

            const cutoff = row.shopPageLastReadAt ?? EPOCH;
            const { count: unreadCount } = await admin
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('thread_id', row.threadId)
                .is('deleted_at', null)
                .gt('created_at', cutoff)
                .neq('sender_id', shopPageId);

            const t: ThreadRow = {
                id: row.threadId,
                name: row.thread?.name ?? null,
                created_at: row.thread?.created_at ?? '',
                lastMessage: (lastMsg as any)?.body ?? null,
                lastMessageAt: (lastMsg as any)?.created_at ?? null,
                lastIsOutbound: (lastMsg as any)?.sender_id === shopPageId,
                otherProfile,
                unreadCount: unreadCount ?? 0,
            };
            return t;
        }),
    );

    return sortAndCap(enriched);
}

/** DIRECT tab: kind='shop' threads for this shop. Because staff have no per-user
 *  read state on these threads (they aren't members), "unread" = customer
 *  messages arrived since the shop last replied — an awaiting-reply signal. */
async function loadShopThreads(shopId: number): Promise<ThreadRow[]> {
    const admin = getSupabaseAdmin();

    const { data: threadRows } = await admin
        .from('chat_threads')
        .select('id, name, created_at, customer_profile_id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop');

    const threads = (threadRows as any[]) ?? [];
    if (threads.length === 0) return [];

    // Batch-resolve customer profiles.
    const customerIds = [...new Set(threads.map((t) => t.customer_profile_id).filter(Boolean))];
    const customerMap = new Map<string, { handle: string | null; display_name: string | null }>();
    if (customerIds.length > 0) {
        const { data: profs } = await admin
            .from('profiles')
            .select('id, handle, display_name')
            .in('id', customerIds);
        for (const p of (profs as any[]) ?? []) {
            customerMap.set(p.id, { handle: p.handle, display_name: p.display_name });
        }
    }

    const enriched = await Promise.all(
        threads.map(async (t) => {
            const customerId: string | null = t.customer_profile_id ?? null;

            const { data: lastMsg } = await admin
                .from('chat_messages')
                .select('body, created_at, sender_id')
                .eq('thread_id', t.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Timestamp of the last shop-side (non-customer) message.
            let lastShopAt = EPOCH;
            if (customerId) {
                const { data: lastShop } = await admin
                    .from('chat_messages')
                    .select('created_at')
                    .eq('thread_id', t.id)
                    .is('deleted_at', null)
                    .neq('sender_id', customerId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                lastShopAt = (lastShop as any)?.created_at ?? EPOCH;
            }

            // Unread = customer messages newer than the last shop reply.
            let unreadCount = 0;
            if (customerId) {
                const { count } = await admin
                    .from('chat_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('thread_id', t.id)
                    .is('deleted_at', null)
                    .eq('sender_id', customerId)
                    .gt('created_at', lastShopAt);
                unreadCount = count ?? 0;
            }

            const lastSenderId = (lastMsg as any)?.sender_id ?? null;
            const row: ThreadRow = {
                id: t.id,
                name: t.name ?? null,
                created_at: t.created_at ?? '',
                lastMessage: (lastMsg as any)?.body ?? null,
                lastMessageAt: (lastMsg as any)?.created_at ?? null,
                lastIsOutbound: lastSenderId != null && lastSenderId !== customerId,
                otherProfile: customerId
                    ? {
                          handle: customerMap.get(customerId)?.handle ?? null,
                          displayName: customerMap.get(customerId)?.display_name ?? null,
                      }
                    : null,
                unreadCount,
            };
            return row;
        }),
    );

    return sortAndCap(enriched);
}

function sortAndCap(rows: ThreadRow[]): ThreadRow[] {
    rows.sort((a, b) => {
        const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : Date.parse(a.created_at);
        const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : Date.parse(b.created_at);
        return tb - ta;
    });
    return rows.slice(0, THREAD_CAP);
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
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
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
    searchParams: Promise<{ q?: string; tab?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { q, tab: rawTab } = await searchParams;

    const tab: Tab = rawTab === 'shop-page' ? 'shop-page' : 'direct';

    let allThreads: ThreadRow[] = [];
    let shopPageMissing = false;
    if (tab === 'direct') {
        allThreads = await loadShopThreads(shop.shopId);
    } else {
        const shopPageId = await fetchShopPageProfileId(shop.shopId);
        if (!shopPageId) shopPageMissing = true;
        else allThreads = await loadShopPageThreads(shopPageId);
    }

    // Client-side search filter on customer handle/name + thread name.
    const needle = (q ?? '').trim().toLowerCase().replace(/^@/, '');
    const threads = needle
        ? allThreads.filter((t) => {
              const haystack = [t.otherProfile?.handle, t.otherProfile?.displayName, t.name]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
              return haystack.includes(needle);
          })
        : allThreads;

    const unreadTotal = allThreads.reduce((acc, t) => acc + t.unreadCount, 0);
    const isManager = MANAGER_ROLES.has(role);

    const tabHref = (t: Tab) => {
        const p = new URLSearchParams();
        if (t !== 'direct') p.set('tab', t);
        const qs = p.toString();
        return `/shop/${slug}/messages${qs ? `?${qs}` : ''}`;
    };

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
                {tab === 'shop-page' && isManager && <NewMessageDialog shopId={shop.shopId} />}
            </div>

            {/* Tab switcher — console pill convention (see inbox status pills). */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' }}>
                <Link
                    href={tabHref('direct')}
                    className={`admin-action-btn ${tab === 'direct' ? '' : 'muted'}`}
                    style={{ textDecoration: 'none' }}
                >
                    DIRECT
                </Link>
                <Link
                    href={tabHref('shop-page')}
                    className={`admin-action-btn ${tab === 'shop-page' ? '' : 'muted'}`}
                    style={{ textDecoration: 'none' }}
                >
                    SHOP PAGE
                </Link>
            </div>

            <form className="admin-search" action={`/shop/${slug}/messages`}>
                {tab !== 'direct' && <input type="hidden" name="tab" value={tab} />}
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

            {shopPageMissing ? (
                <div className="admin-empty">NO SHOP PAGE PROFILE FOUND — CONTACT SUPPORT.</div>
            ) : (
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
                                                : tab === 'direct'
                                                  ? 'NO DIRECT MESSAGES YET. CUSTOMERS WHO DM YOUR SHOP WILL APPEAR HERE.'
                                                  : 'NO SHOP-PAGE THREADS.'}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                threads.map((t) => {
                                    const href = `/shop/${slug}/messages/${t.id}`;
                                    const displayName =
                                        t.otherProfile?.displayName ?? t.name ?? 'DIRECT THREAD';
                                    const handle = t.otherProfile?.handle;
                                    const prefix = t.lastIsOutbound ? 'YOU: ' : '';
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
                                                {handle && <div className="admin-handle">@{handle}</div>}
                                            </td>
                                            <td style={{ maxWidth: 360 }}>
                                                <Link
                                                    href={href}
                                                    style={{ color: 'var(--text-2)', textDecoration: 'none' }}
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
                                                    <span className="admin-pill gold">{t.unreadCount}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-2)', fontSize: 11 }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
