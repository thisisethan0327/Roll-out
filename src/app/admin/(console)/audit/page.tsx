/**
 * /admin/audit — the admin activity log (rollout.admin_audit, migration 092):
 * every override a Rollout platform admin makes (door check-ins, acting as a
 * shop, event/user moderation, ban/unban, ...), newest first, filterable by
 * action, admin and subject type.
 *
 * VISIBLE TO PLATFORM ADMINS ONLY (Ethan 2026-10-08: "only rollout admin can
 * see the log. No one else can"). requirePlatformAdmin() here, again in the
 * console layout, and again inside every loader in lib/admin-audit.ts. It is
 * read with the service role and is never rendered in the shop console or on a
 * member page. Before 092 the table is missing and the page says so.
 */
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { AUDIT_PAGE_SIZE, loadAuditPage } from '@/lib/admin-audit';
import { AdminAuditTable } from '@/components/AdminAuditTable';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { AdminHead } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export const metadata = { title: 'Activity Log' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
    return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 80) ?? '';
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
    await requirePlatformAdmin();
    const sp = await searchParams;
    const action = one(sp.action);
    const actor = one(sp.actor);
    const type = one(sp.type);
    const pageNum = Math.max(0, Number.parseInt(one(sp.page), 10) || 0);

    const result = await loadAuditPage({ action, actor, subjectType: type, page: pageNum });

    const qs = (page: number) => {
        const p = new URLSearchParams();
        if (action) p.set('action', action);
        if (actor) p.set('actor', actor);
        if (type) p.set('type', type);
        if (page > 0) p.set('page', String(page));
        const s = p.toString();
        return `/admin/audit${s ? `?${s}` : ''}`;
    };
    const filtered = Boolean(action || actor || type);

    return (
        <>
            <AdminHead
                title="Activity log"
                sub={
                    result.missing
                        ? 'Not set up yet. Visible to Rollout admins only.'
                        : `Rollout admin actions, newest first. ${result.rows.length} shown${pageNum > 0 ? `, page ${pageNum + 1}` : ''}. Visible to Rollout admins only.`
                }
            />
            {result.missing ? (
                <div className="admin-empty">
                    No activity yet. The log starts recording once migration 092 is applied.
                </div>
            ) : (
                <>
                    <form className="admin-search" action="/admin/audit" aria-label="Filter the activity log">
                        <select name="action" defaultValue={action} className="admin-form-input" aria-label="Action">
                            <option value="">All actions</option>
                            {action && !result.actions.includes(action) && <option value={action}>{action}</option>}
                            {result.actions.map((a) => (
                                <option key={a} value={a}>
                                    {a}
                                </option>
                            ))}
                        </select>
                        <select name="type" defaultValue={type} className="admin-form-input" aria-label="Subject type">
                            <option value="">All subjects</option>
                            {type && !result.subjectTypes.includes(type) && <option value={type}>{type}</option>}
                            {result.subjectTypes.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <input
                            name="actor"
                            defaultValue={actor}
                            className="admin-search-input"
                            placeholder="Admin @handle"
                            aria-label="Admin handle"
                        />
                        <button type="submit" className="admin-action-btn">
                            <Filter {...ic} /> Filter
                        </button>
                        {filtered && (
                            <Link href="/admin/audit" className="admin-action-btn muted">
                                Clear
                            </Link>
                        )}
                    </form>

                    {result.actorNotFound ? (
                        <div className="admin-empty">No member has the handle @{actor.replace(/^@/, '')}.</div>
                    ) : (
                        <AdminAuditTable
                            result={result}
                            emptyText={filtered ? 'No activity matches these filters.' : 'No activity yet.'}
                        />
                    )}

                    {(pageNum > 0 || result.hasMore) && (
                        <nav className="admin-search" aria-label="Pages">
                            {pageNum > 0 && (
                                <Link href={qs(pageNum - 1)} className="admin-action-btn muted">
                                    <ChevronLeft {...ic} /> Newer
                                </Link>
                            )}
                            {result.hasMore && (
                                <Link href={qs(pageNum + 1)} className="admin-action-btn">
                                    Older ({AUDIT_PAGE_SIZE} per page) <ChevronRight {...ic} />
                                </Link>
                            )}
                        </nav>
                    )}
                </>
            )}
        </>
    );
}
