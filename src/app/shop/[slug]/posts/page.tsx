import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PostActions } from './PostActions';
import { Eye, Globe, Heart, Lock, MessageCircle, Newspaper, Search, Trash2, Users } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, CountStrip, FilterLink, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const metadata = { title: 'Posts' };

const TYPE_TABS = ['ALL', 'BUILD', 'MEET', 'EDU', 'TRADE'] as const;
type TypeTab = (typeof TYPE_TABS)[number];

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    if (error) console.error('[shop/posts] fetchShopPageProfileId failed:', error.message);
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

    const { data, error } = await q;
    if (error) console.error('[shop/posts] loadPosts failed:', error.message);

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
            <BizPage slug={slug}>
                <ConsoleHead title="Posts" sub={shop.name} />
                <section className="g-card">
                    <CardEmpty
                        icon={<Newspaper size={22} strokeWidth={1.75} />}
                        title="No shop page profile found"
                        blocker="Posts come from the shop’s page profile. Contact support to set one up."
                    />
                </section>
            </BizPage>
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
    const label = (t: string) => (t === 'EDU' ? 'Edu' : t.charAt(0) + t.slice(1).toLowerCase());

    return (
        <BizPage slug={slug}>
            <ConsoleHead
                title="Posts"
                sub={`${shop.name} · ${data.rows.length} shown${showDeleted ? ' · deleted' : ''}`}
                actions={
                    <Link href={buildHref(null, !showDeleted)} className={cx(bz.act, bz.actInk)}>
                        {showDeleted ? <Eye size={16} strokeWidth={2} aria-hidden="true" /> : <Trash2 size={16} strokeWidth={2} aria-hidden="true" />}
                        {showDeleted ? 'Show active' : 'Show deleted'}
                    </Link>
                }
            />

            {/* Drafts are not counted: the schema has no drafts yet, so it was always 0. */}
            <CountStrip
                label="Post totals"
                items={[
                    { label: 'Published', value: data.published },
                    { label: 'Total likes', value: data.totalLikes },
                    { label: 'Total comments', value: data.totalComments },
                ]}
            />

            <div className={bz.bar}>
                <nav className={bz.chips} aria-label="Post type">
                    {TYPE_TABS.map((t) => (
                        <FilterLink key={t} href={buildHref(t)} on={t === type}>
                            {label(t)}
                        </FilterLink>
                    ))}
                </nav>
                <form className={bz.search} action={baseHref} role="search">
                    {type !== 'ALL' && <input type="hidden" name="type" value={type.toLowerCase()} />}
                    {showDeleted && <input type="hidden" name="deleted" value="1" />}
                    <Search size={18} strokeWidth={2} aria-hidden="true" />
                    <input name="q" defaultValue={q ?? ''} placeholder="Search post text" aria-label="Search posts" />
                    <button type="submit">Search</button>
                </form>
            </div>

            <section className="g-card" aria-label="Posts">
                {data.rows.length === 0 ? (
                    <CardEmpty
                        icon={<Newspaper size={22} strokeWidth={1.75} />}
                        title={showDeleted ? 'No deleted posts' : type === 'ALL' ? 'No posts' : `No ${label(type).toLowerCase()} posts`}
                        search={q || undefined}
                    />
                ) : (
                    <div className={cs.tblWrap}>
                        <table className={cs.tbl}>
                            <thead>
                                <tr>
                                    <th scope="col">Post</th>
                                    <th scope="col">Type</th>
                                    <th scope="col" className={cs.mHide}>
                                        Stats
                                    </th>
                                    <th scope="col">Visibility</th>
                                    <th scope="col">
                                        <span className="g-sr">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map((p: any) => (
                                    <tr key={p.id}>
                                        <td>
                                            <span className={bz.clip} style={{ fontWeight: 500 }}>
                                                {truncate(p.body, 80)}
                                            </span>
                                            <small>
                                                <span className={bz.mono}>
                                                    {new Date(p.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                                </span>
                                            </small>
                                        </td>
                                        <td>
                                            <span className="g-chip">{label(String(p.type))}</span>
                                        </td>
                                        <td className={cs.mHide}>
                                            <span className={bz.stats}>
                                                <span className={bz.stat}>
                                                    <Heart size={14} strokeWidth={2} aria-hidden="true" />
                                                    {p.like_count ?? 0}
                                                    <span className="g-sr"> likes</span>
                                                </span>
                                                <span className={bz.stat}>
                                                    <MessageCircle size={14} strokeWidth={2} aria-hidden="true" />
                                                    {p.comment_count ?? 0}
                                                    <span className="g-sr"> comments</span>
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            <div className="g-chips">
                                                <VisChip v={String(p.visibility)} />
                                                {p.deleted_at && (
                                                    <span className="g-chip" style={{ color: 'var(--ink-2)' }}>
                                                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                                                        Deleted
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={bz.tdActs}>
                                            <PostActions
                                                postId={p.id}
                                                shopId={shop.shopId}
                                                deleted={!!p.deleted_at}
                                                callerRole={role}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </BizPage>
    );
}

function VisChip({ v }: { v: string }) {
    const ic = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;
    const text = v.charAt(0).toUpperCase() + v.slice(1);
    if (v === 'public') {
        return (
            <span className="g-chip g-chip--tint">
                <Globe {...ic} />
                {text}
            </span>
        );
    }
    if (v === 'private') {
        return (
            <span className="g-chip">
                <Lock {...ic} />
                {text}
            </span>
        );
    }
    return (
        <span className="g-chip">
            <Users {...ic} />
            {text}
        </span>
    );
}
