import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PostActions } from './PostActions';

export const metadata = { title: 'Posts' };

async function loadPosts(showDeleted: boolean) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('posts')
        .select(
            `id, type, body, created_at, deleted_at, like_count, comment_count, visibility,
             author:profiles!posts_author_id_fkey(id, handle, display_name, kind),
             shop:shops(id, slug, name)`,
        )
        .order('created_at', { ascending: false })
        .limit(200);
    if (!showDeleted) q = q.is('deleted_at', null);
    const { data } = await q;
    return data ?? [];
}

export default async function PostsPage({
    searchParams,
}: {
    searchParams: Promise<{ deleted?: string }>;
}) {
    const { deleted } = await searchParams;
    const showDeleted = deleted === '1';
    const items = await loadPosts(showDeleted);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">POSTS</div>
                    <div className="admin-page-sub">
                        {items.length} SHOWN · {showDeleted ? 'INCLUDING DELETED' : 'LIVE ONLY'}
                    </div>
                </div>
                <a
                    href={`/admin/posts${showDeleted ? '' : '?deleted=1'}`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    {showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}
                </a>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>TYPE</th>
                            <th>AUTHOR</th>
                            <th>BODY</th>
                            <th>STATS</th>
                            <th>FLAGS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NO POSTS</div>
                                </td>
                            </tr>
                        ) : (
                            items.map((p: any) => (
                                <tr key={p.id}>
                                    <td>
                                        {new Date(p.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        <span className="admin-pill">{p.type}</span>
                                    </td>
                                    <td>
                                        {p.author && (
                                            <>
                                                <a href={`/admin/users?q=${p.author.handle}`} className="text-link">
                                                    @{p.author.handle}
                                                </a>
                                                {p.author.kind === 'shop_page' && (
                                                    <span className="admin-pill gold" style={{ marginLeft: 6 }}>
                                                        SHOP
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </td>
                                    <td style={{ maxWidth: 360 }}>
                                        <div
                                            style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                color: 'var(--text)',
                                            }}
                                        >
                                            {p.body}
                                        </div>
                                    </td>
                                    <td>
                                        ♥ {p.like_count} · ◉ {p.comment_count}
                                    </td>
                                    <td>
                                        {p.deleted_at && <span className="admin-pill warn">DELETED</span>}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {!p.deleted_at && <PostActions postId={p.id} />}
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
