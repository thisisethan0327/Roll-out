/**
 * Admin activity log table (server component). ADMIN CONSOLE ONLY: the rows come
 * from lib/admin-audit.ts, which is readable by platform admins and nobody else.
 * Never render this in the shop console or on a member page.
 *
 * Used by /admin/audit, /admin/events/[id] and /admin/users/[id]. Handles the
 * pre-092 state (`missing`) by saying so quietly instead of erroring.
 */
import Link from 'next/link';
import { auditSubjectHref, type AuditResult, type AuditRow } from '@/lib/admin-audit';
import { ChevronRight } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

function stamp(iso: string): string {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** meta -> "k=v · k=v", minus bookkeeping, capped so one row stays one line or two. */
function summarize(meta: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(meta)) {
        if (k === 'source' || v == null || v === '') continue;
        const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        parts.push(`${k}=${text.length > 60 ? text.slice(0, 57) + '…' : text}`);
    }
    const out = parts.join(' · ');
    return out.length > 220 ? out.slice(0, 217) + '…' : out;
}

function shortId(id: string): string {
    return id.length > 13 ? `${id.slice(0, 8)}…` : id;
}

export function AdminAuditTable({
    result,
    emptyText = 'No activity yet.',
    showSubject = true,
    showActor = true,
}: {
    result: AuditResult;
    emptyText?: string;
    showSubject?: boolean;
    showActor?: boolean;
}) {
    if (result.error) {
        return <div className="admin-empty">Could not load the activity log.</div>;
    }
    if (result.rows.length === 0) {
        return <div className="admin-empty">{emptyText}</div>;
    }
    return (
        <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>When (UTC)</th>
                        {showActor && <th>Admin</th>}
                        <th>Action</th>
                        {showSubject && <th>Subject</th>}
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    {result.rows.map((r) => (
                        <Row key={r.id} r={r} showActor={showActor} showSubject={showSubject} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Row({ r, showActor, showSubject }: { r: AuditRow; showActor: boolean; showSubject: boolean }) {
    const href = auditSubjectHref(r);
    return (
        <tr>
            <td className={a.time}>{stamp(r.createdAt)}</td>
            {showActor && (
                <td>
                    {r.actor ? (
                        <Link href={`/admin/users/${r.actor.id}`} className="text-link">
                            @{r.actor.handle}
                        </Link>
                    ) : (
                        <span className="admin-handle">{r.actorProfileId ? shortId(r.actorProfileId) : 'System'}</span>
                    )}
                </td>
            )}
            <td>
                <span className="admin-pill gold">{r.action}</span>
            </td>
            {showSubject && (
                <td>
                    <div className="admin-handle">{r.subjectType}</div>
                    {href ? (
                        <Link href={href} className="text-link">
                            {shortId(r.subjectId)} <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                        </Link>
                    ) : (
                        <span>{shortId(r.subjectId)}</span>
                    )}
                </td>
            )}
            <td className={a.small} style={{ wordBreak: 'break-word' }}>{summarize(r.meta) || '—'}</td>
        </tr>
    );
}
