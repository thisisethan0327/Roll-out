import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PostActions } from './PostActions';

export const metadata = { title: 'Posts' };

const TYPE_TABS = ['ALL', 'BUILD', 'MEET', 'EDU', 'TRADE'] as const;
type TypeTab = (typeof TYPE_TABS)[number];

const TYPE_PILL: Record<string, string> = {
    BUILD: 'admin-pill gold',
    MEET: 'admin-pill neon',
    EDU: 'admin-pill',
    TRADE: 'admin-pill warn',
};

const VIS_PILL: Record<string, string> = {
    public: 'admin-pill neon',
    followers: 'admin-pill',
    private: 'admin-pill warn',
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

async function loadPosts(
    authorId: string,
    type: TypeTab,
    query: string | undefined,
    showDeleted: boolean,
) {
    const admin = getSupabaseAdmin();

    const [publishedC, likesAgg, commentsAgg] = await Promise.all([
        admin
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', authorId)
            .is('deleted_at', null),
        admin
            .from('posts')
            .select('like_count')
            .eq('author_id', authorId)
            .is('deleted_at', null),
        admin
            .from('posts')
            .select('comment_count')
            .eq('author_id', authorId)
            .is('deleted_at', null),
    ]);

    const totalLikes = (likesAgg.data ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.like_count) || 0),
        0,
    );
    const totalComments = (commentsAgg.data ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.comment_count) || 0),
        0,
    );

    let q = admin
        .from('posts')
        .select(
            `id, type, body, hero_image_url, visibility, like_count, comment_count,
             created_at, deleted_at, sector_code, tags`,
        )
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .limit(200);

    if (showDeleted) {
        q = q.not('deleted_at', 'is', null);
    } else {
        q = q.is('deleted_at', null);
    }

    if (type !== 'ALL') {
        q = q.eq('type', type);
    }

    if (query) {
        const safe = query.replace(/[%_]/g, ' ');
        q = q.ilike('body', `%${safe}%`);
    }

    const { data } = await q;

    return {
        published: publishedC.count ?? 0,
        drafts: 0, // no drafts in schema yet
        totalLikes,
        totalComments,
        rows: (data as any[]) ?? [],
    };
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '—';
    if (s.length <= n) return s;
    return s.slice(0, n).trimEnd() + '…';
}

export default async function ShopPostsPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ q?: string; type?: string; deleted?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { q, type: rawType, deleted: rawDeleted } = await searchParams;

    const typeUpper = (rawType ?? 'ALL').toUpperCase();
    const type: TypeTab = (TYPE_TABS as readonly string[]).includes(typeUpper)
        ? (typeUpper as TypeTab)
        : 'ALL';
    const showDeleted = rawDeleted === '1';

    const authorId = await fetchShopPageProfileId(shop.shopId);

    if (!authorId) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">POSTS</div>
                        <div className="admin-page-sub">{shop.name.toUpperCase()}</div>
                    </div>
                </div>
                <div className="admin-empty">
                    NO SHOP PAGE PROFILE FOUND — CONTACT SUPPORT.
                </div>
            </>
        );
    }

    const data = await loadPosts(authorId, type, q, showDeleted);

    const baseHref = `/shop/${slug}/posts`;
    const buildHref = (
        nextType: TypeTab | null,
        nextDeleted?: boolean,
    ): string => {
        const sp = new URLSearchParams();
        if ((nextType ?? type) !== 'ALL') sp.set('type', (nextType ?? type).toLowerCase());
        if (q) sp.set('q', q);
        const d = nextDeleted ?? showDeleted;
        if (d) sp.set('deleted', '1');
        const qs = sp.toString();
        return qs ? `${baseHref}?${qs}` : baseHref;
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">POSTS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {data.rows.length} SHOWN
                        {showDeleted ? ' · DELETED' : ''}
                    </div>
                </div>
                <Link
                    href={buildHref(null, !showDeleted)}
                    className={`admin-action-btn ${showDeleted ? '' : 'muted'}`}
                    style={{ textDecoration: 'none' }}
                >
                    {showDeleted ? 'SHOW ACTIVE' : 'SHOW DELETED'}
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="PUBLISHED" value={data.published} />
                <Stat label="DRAFTS" value={data.drafts} />
                <Stat label="TOTAL LIKES" value={data.totalLikes} />
                <Stat label="TOTAL COMMENTS" value={data.totalComments} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
                {TYPE_TABS.map((t) => {
                    const isActive = t === type;
                    return (
                        <Link
                            key={t}
                            href={buildHref(t)}
                            className={`admin-action-btn ${isActive ? '' : 'muted'}`}
                            style={{ textDecoration: 'none' }}
                        >
                            {t}
                        </Link>
                    );
                })}
            </div>

            <form className="admin-search" action={baseHref}>
                {type !== 'ALL' && <input type="hidden" name="type" value={type.toLowerCase()} />}
                {showDeleted && <input type="hidden" name="deleted" value="1" />}
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH POST BODY"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>TYPE</th>
                            <th>BODY</th>
                            <th>STATS</th>
                            <th>VISIBILITY</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">
                                        NO {showDeleted ? 'DELETED' : type} POSTS.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.rows.map((p: any) => (
                                <tr key={p.id}>
                                    <td>
                                        {new Date(p.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        <span className={TYPE_PILL[p.type] ?? 'admin-pill'}>
                                            {p.type}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: 360 }}>
                                        {truncate(p.body, 80)}
                                    </td>
                                    <td>
                                        <span className="admin-handle">
                                            ♥ {p.like_count ?? 0} · ◉ {p.comment_count ?? 0}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            <span className={VIS_PILL[p.visibility] ?? 'admin-pill'}>
                                                {String(p.visibility).toUpperCase()}
                                            </span>
                                            {p.deleted_at && (
                                                <span className="admin-pill warn">DELETED</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <PostActions
                                            postId={p.id}
                                            shopId={shop.shopId}
                                            deleted={!!p.deleted_at}
                                            callerRole={role}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className={`admin-stat-num ${accent ?? ''}`}>{value}</div>
        </div>
    );
}
