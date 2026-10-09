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
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ACTIVITY LOG</div>
                    <div className="admin-page-sub">
                        {result.missing
                            ? 'NOT SET UP YET'
                            : `ROLLOUT ADMIN ACTIONS · NEWEST FIRST · ${result.rows.length} SHOWN${pageNum > 0 ? ` · PAGE ${pageNum + 1}` : ''}`}
                        {' · VISIBLE TO ROLLOUT ADMINS ONLY'}
                    </div>
                </div>
            </div>

            {result.missing ? (
                <div className="admin-empty">
                    NO ACTIVITY YET · THE LOG STARTS RECORDING ONCE MIGRATION 092 IS APPLIED
                </div>
            ) : (
                <>
                    <form className="admin-search" action="/admin/audit" style={{ flexWrap: 'wrap' }}>
                        <select name="action" defaultValue={action} className="admin-form-input" aria-label="Action">
                            <option value="">ALL ACTIONS</option>
                            {action && !result.actions.includes(action) && <option value={action}>{action}</option>}
                            {result.actions.map((a) => (
                                <option key={a} value={a}>
                                    {a}
                                </option>
                            ))}
                        </select>
                        <select name="type" defaultValue={type} className="admin-form-input" aria-label="Subject type">
                            <option value="">ALL SUBJECTS</option>
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
                            placeholder="ADMIN @HANDLE"
                            aria-label="Admin handle"
                        />
                        <button type="submit" className="admin-action-btn">
                            FILTER ›
                        </button>
                        {filtered && (
                            <Link href="/admin/audit" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                                CLEAR
                            </Link>
                        )}
                    </form>

                    {result.actorNotFound ? (
                        <div className="admin-empty">NO MEMBER WITH THE HANDLE @{actor.replace(/^@/, '').toUpperCase()}</div>
                    ) : (
                        <AdminAuditTable
                            result={result}
                            emptyText={filtered ? 'NO MATCHING ACTIVITY' : 'NO ACTIVITY YET'}
                        />
                    )}

                    {(pageNum > 0 || result.hasMore) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            {pageNum > 0 && (
                                <Link href={qs(pageNum - 1)} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                                    ‹ NEWER
                                </Link>
                            )}
                            {result.hasMore && (
                                <Link href={qs(pageNum + 1)} className="admin-action-btn" style={{ textDecoration: 'none' }}>
                                    OLDER › ({AUDIT_PAGE_SIZE} PER PAGE)
                                </Link>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
}
