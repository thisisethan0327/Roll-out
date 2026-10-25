/**
 * /admin/reports — moderation queue for rollout.content_reports (App Store
 * guideline 1.2: UGC apps must act on reports, 24h SLA). Reports are written by
 * the mobile app (reporter_auth_id = auth user id; target_type
 * post|comment|profile|message; status pending|reviewing|actioned|dismissed).
 *
 * Authorization: requirePlatformAdmin() here AND in the console layout and every
 * action. All reads are service-role; previews are fetched in one batch per
 * target type (no per-card queries).
 */
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { relativeTime } from '@/lib/admin-user-facts';
import { ReportActions } from './ReportActions';
import type { ReportStatus } from './actions';
import { ChevronRight } from 'lucide-react';
import { AdminHead, Tabs, adminStyles as a, sentence } from '@/components/glide-admin/parts';
import { InfoTip } from '@/components/glide/InfoTip';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const TABS = ['pending', 'reviewing', 'actioned', 'dismissed', 'all'] as const;
type Tab = (typeof TABS)[number];
const LIMIT = 200;

const STATUS_PILL: Record<string, string> = {
    pending: 'admin-pill warn',
    reviewing: 'admin-pill gold',
    actioned: 'admin-pill neon',
    dismissed: 'admin-pill',
};

type Prof = { id: string; handle: string; display_name: string | null };
type Preview = {
    live: boolean; // false = deleted or missing, so nothing left to take down
    body?: string | null;
    images?: string[];
    author?: Prof | null;
    profile?: Prof | null;
    postId?: string | null;
};

const dim: React.CSSProperties = { color: 'var(--ink-2)' };

function uniq(xs: (string | null | undefined)[]): string[] {
    return [...new Set(xs.filter((x): x is string => !!x))];
}

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function loadProfiles(ids: string[], col: 'id' | 'auth_user_id'): Promise<Map<string, Prof>> {
    const out = new Map<string, Prof>();
    if (ids.length === 0) return out;
    const { data, error } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, auth_user_id, handle, display_name')
        .in(col, ids);
    if (error) console.error('[admin/reports] profiles load failed:', error.message);
    for (const p of (data as any[]) ?? []) out.set(p[col], p);
    return out;
}

async function loadReports(tab: Tab) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('content_reports')
        .select(
            'id, reporter_auth_id, target_type, target_id, reason, details, status, reviewed_by, reviewed_at, action_taken, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(LIMIT);
    if (tab !== 'all') q = q.eq('status', tab);
    const { data, error } = await q;
    if (error) console.error('[admin/reports] load failed:', error.message);
    const reports = (data as any[]) ?? [];

    const idsOf = (t: string) => uniq(reports.filter((r) => r.target_type === t).map((r) => r.target_id));
    const [postsRes, commentsRes, messagesRes] = await Promise.all([
        idsOf('post').length
            ? admin
                  .from('posts')
                  .select('id, body, hero_image_url, media_urls, author_id, deleted_at')
                  .in('id', idsOf('post'))
            : Promise.resolve({ data: [] as any[] }),
        idsOf('comment').length
            ? admin
                  .from('post_comments')
                  .select('id, body, post_id, author_id, deleted_at')
                  .in('id', idsOf('comment'))
            : Promise.resolve({ data: [] as any[] }),
        idsOf('message').length
            ? admin
                  .from('chat_messages')
                  .select('id, body, media_urls, sender_id, deleted_at')
                  .in('id', idsOf('message'))
            : Promise.resolve({ data: [] as any[] }),
    ]);
    const posts = new Map<string, any>(((postsRes.data as any[]) ?? []).map((r) => [r.id, r]));
    const comments = new Map<string, any>(((commentsRes.data as any[]) ?? []).map((r) => [r.id, r]));
    const messages = new Map<string, any>(((messagesRes.data as any[]) ?? []).map((r) => [r.id, r]));

    // One profiles lookup for everyone we need to name: reporters (by auth id),
    // content authors, profile targets, reviewers (by profile id).
    const profileIds = uniq([
        ...[...posts.values()].map((p) => p.author_id),
        ...[...comments.values()].map((c) => c.author_id),
        ...[...messages.values()].map((m) => m.sender_id),
        ...idsOf('profile'),
        ...reports.map((r) => r.reviewed_by),
    ]);
    const [byId, byAuth] = await Promise.all([
        loadProfiles(profileIds, 'id'),
        loadProfiles(uniq(reports.map((r) => r.reporter_auth_id)), 'auth_user_id'),
    ]);

    const previews = new Map<string, Preview>();
    for (const r of reports) {
        const key = r.id as string;
        if (r.target_type === 'post') {
            const p = posts.get(r.target_id);
            previews.set(key, {
                live: !!p && !p.deleted_at,
                body: p?.body ?? null,
                images: uniq([p?.hero_image_url, ...((p?.media_urls as string[] | null) ?? [])]).slice(0, 4),
                author: p ? (byId.get(p.author_id) ?? null) : null,
            });
        } else if (r.target_type === 'comment') {
            const c = comments.get(r.target_id);
            previews.set(key, {
                live: !!c && !c.deleted_at,
                body: c?.body ?? null,
                author: c ? (byId.get(c.author_id) ?? null) : null,
                postId: c?.post_id ?? null,
            });
        } else if (r.target_type === 'message') {
            const m = messages.get(r.target_id);
            previews.set(key, {
                live: !!m && !m.deleted_at,
                body: m?.body ?? null,
                images: uniq((m?.media_urls as string[] | null) ?? []).slice(0, 4),
                author: m ? (byId.get(m.sender_id) ?? null) : null,
            });
        } else if (r.target_type === 'profile') {
            previews.set(key, { live: byId.has(r.target_id), profile: byId.get(r.target_id) ?? null });
        } else {
            previews.set(key, { live: true });
        }
    }

    return { reports, previews, byId, byAuth };
}

async function loadCounts(): Promise<Record<Tab, number>> {
    const admin = getSupabaseAdmin();
    const statuses = ['pending', 'reviewing', 'actioned', 'dismissed'] as const;
    const counts = await Promise.all(
        statuses.map(async (s) => {
            const { count } = await admin
                .from('content_reports')
                .select('*', { count: 'exact', head: true })
                .eq('status', s);
            return count ?? 0;
        }),
    );
    return {
        pending: counts[0],
        reviewing: counts[1],
        actioned: counts[2],
        dismissed: counts[3],
        all: counts.reduce((a, b) => a + b, 0),
    };
}

function UserLink({ p, fallbackId }: { p: Prof | null | undefined; fallbackId?: string }) {
    if (!p) return <span style={dim}>unknown user{fallbackId ? ` (${fallbackId.slice(0, 8)})` : ''}</span>;
    return (
        <Link href={`/admin/users/${p.id}`} className="text-link">
            @{p.handle}
        </Link>
    );
}

function Target({ type, targetId, pv }: { type: string; targetId: string; pv: Preview }) {
    const quote: React.CSSProperties = {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxHeight: 140,
        overflow: 'auto',
        color: 'var(--ink)',
        fontSize: 14.5,
        lineHeight: 1.5,
    };
    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div className={a.chipRow} style={{ fontSize: 14 }}>
                <span className="admin-pill">{sentence(type)}</span>
                {!pv.live && type !== 'profile' && <span className="admin-pill warn">Removed or gone</span>}
                {type === 'profile' && !pv.live && <span className="admin-pill warn">Profile not found</span>}
                {pv.author && (
                    <span>
                        by <UserLink p={pv.author} />
                    </span>
                )}
                {type === 'profile' && pv.profile && (
                    <span>
                        <UserLink p={pv.profile} />
                        {pv.profile.display_name ? <span style={dim}> · {pv.profile.display_name}</span> : null}
                    </span>
                )}
                {type === 'event' && (
                    <Link href={`/admin/events/${targetId}`} className="text-link">
                        Open event <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                    </Link>
                )}
            </div>
            {pv.body ? <div style={quote}>{pv.body}</div> : null}
            {!pv.body && (type === 'post' || type === 'comment' || type === 'message') && (
                <div style={dim}>{pv.live ? '(no text)' : '(content no longer available)'}</div>
            )}
            {pv.images && pv.images.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {pv.images.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={u}
                                alt=""
                                width={72}
                                height={72}
                                loading="lazy"
                                style={{ objectFit: 'cover', borderRadius: 12, display: 'block' }}
                            />
                        </a>
                    ))}
                </div>
            )}
            <div className={a.mono}>ID {targetId}</div>
        </div>
    );
}

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    await requirePlatformAdmin();
    const { status } = await searchParams;
    const tab: Tab = (TABS as readonly string[]).includes(status ?? '') ? (status as Tab) : 'pending';

    const [{ reports, previews, byId, byAuth }, counts] = await Promise.all([
        loadReports(tab),
        loadCounts(),
    ]);

    return (
        <>
            <AdminHead
                title="Reports"
                sub={
                    <>
                        {`${reports.length} shown${reports.length >= LIMIT ? ` · newest ${LIMIT}` : ''}`}
                        <InfoTip label="About reports" text="User-submitted content reports. Response target: 24 hours." />
                    </>
                }
            />

            <Tabs
                label="Filter by status"
                items={TABS.map((t) => ({
                    href: t === 'pending' ? '/admin/reports' : `/admin/reports?status=${t}`,
                    label: sentence(t),
                    count: counts[t],
                    current: t === tab,
                }))}
            />
            {reports.length === 0 ? (
                <div className="admin-empty">
                    {tab === 'pending' ? 'No pending reports. All clear.' : `No ${tab === 'all' ? '' : `${tab} `}reports.`}
                </div>
            ) : (
                <div className={a.stack}>
                    {reports.map((r: any) => {
                        const pv = previews.get(r.id) ?? { live: true };
                        const reporter = byAuth.get(r.reporter_auth_id) ?? null;
                        const reviewer = r.reviewed_by ? (byId.get(r.reviewed_by) ?? null) : null;
                        return (
                            <article key={r.id} className={`${a.card} ${a.cardPad} ${a.stack}`} aria-label={`Report: ${r.reason}`}>
                                <div className={a.chipRow}>
                                    <span className={STATUS_PILL[r.status] ?? 'admin-pill'}>{sentence(r.status)}</span>
                                    <span className={a.meta}>
                                        <span>{relativeTime(r.created_at)}</span>
                                        <span>{stamp(r.created_at)} UTC</span>
                                    </span>
                                </div>

                                <div className={a.facts}>
                                    <div>
                                        <span style={dim}>Reported by </span>
                                        {reporter ? (
                                            <UserLink p={reporter} />
                                        ) : (
                                            <span style={dim}>
                                                {r.reporter_auth_id ? 'deleted account' : 'unknown'}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <span style={dim}>Reason </span>
                                        <b>{r.reason}</b>
                                    </div>
                                    {r.details ? (
                                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                            <span style={dim}>Details </span>
                                            {r.details}
                                        </div>
                                    ) : null}
                                </div>

                                <div className={a.quote} style={{ whiteSpace: 'normal' }}>
                                    <Target type={r.target_type} targetId={r.target_id} pv={pv} />
                                </div>

                                {(r.reviewed_at || r.action_taken) && (
                                    <div className={a.small}>
                                        {r.reviewed_at ? `Reviewed ${stamp(r.reviewed_at)} UTC` : 'Reviewed'}
                                        {reviewer ? ` by @${reviewer.handle}` : ''}
                                        {r.action_taken ? ` · ${r.action_taken}` : ''}
                                    </div>
                                )}

                                <ReportActions
                                    reportId={r.id}
                                    status={r.status as ReportStatus}
                                    targetType={r.target_type}
                                    targetLive={pv.live}
                                />
                            </article>
                        );
                    })}
                </div>
            )}
        </>
    );
}
