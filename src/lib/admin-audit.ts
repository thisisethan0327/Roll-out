import 'server-only';
/**
 * READ side of the admin activity log (rollout.admin_audit, migration 092).
 *
 * The log is visible ONLY to Rollout platform admins (Ethan 2026-10-08: "only
 * rollout admin can see the log. No one else can"). Every loader here calls
 * requirePlatformAdmin() itself, so a caller that forgot the gate (or a future
 * import from the shop console) is redirected to /admin/login instead of
 * reading anything; reads then go through the service role. Never render these
 * rows in the shop console or on member pages.
 *
 * Before 092 the table does not exist: every loader reports `missing: true`
 * (42P01 / PGRST205) and the callers show "No activity yet" or hide the section.
 * The write side is logAdminAction in auth-guard.ts.
 */
import { isAuditTableMissing, requirePlatformAdmin } from './auth-guard';
import { getSupabaseAdmin } from './supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = 'id, actor_profile_id, action, subject_type, subject_id, meta, created_at';

export const AUDIT_PAGE_SIZE = 50;

export type AuditActorLite = { id: string; handle: string; display_name: string | null };

export type AuditRow = {
    id: string;
    actorProfileId: string | null;
    actor: AuditActorLite | null;
    action: string;
    subjectType: string;
    subjectId: string;
    meta: Record<string, unknown>;
    createdAt: string;
};

export type AuditResult = {
    rows: AuditRow[];
    /** The table (migration 092) is not applied yet. */
    missing: boolean;
    error?: string;
    /** Paged loaders only: a further page exists. */
    hasMore?: boolean;
};

const EMPTY_MISSING: AuditResult = { rows: [], missing: true };

async function hydrate(raw: any[]): Promise<AuditRow[]> {
    const ids = [...new Set(raw.map((r) => r.actor_profile_id).filter((x): x is string => !!x))];
    const byId = new Map<string, AuditActorLite>();
    if (ids.length > 0) {
        const { data, error } = await getSupabaseAdmin()
            .from('profiles')
            .select('id, handle, display_name')
            .in('id', ids);
        if (error) console.error('[admin-audit] actor load failed:', error.message);
        for (const p of (data as any[]) ?? []) byId.set(p.id, p);
    }
    return raw.map((r) => ({
        id: r.id,
        actorProfileId: r.actor_profile_id ?? null,
        actor: r.actor_profile_id ? (byId.get(r.actor_profile_id) ?? null) : null,
        action: r.action,
        subjectType: r.subject_type,
        subjectId: r.subject_id,
        meta: (r.meta ?? {}) as Record<string, unknown>,
        createdAt: r.created_at,
    }));
}

async function finish(res: { data: any; error: any }, limit: number): Promise<AuditResult> {
    if (res.error) {
        if (isAuditTableMissing(res.error)) return EMPTY_MISSING;
        console.error('[admin-audit] read failed:', res.error.code, res.error.message);
        return { rows: [], missing: false, error: res.error.message };
    }
    const raw = (res.data as any[]) ?? [];
    const rows = await hydrate(raw.slice(0, limit));
    return { rows, missing: false, hasMore: raw.length > limit };
}

/** Rows about one event: its own subject rows plus ticket-level rows (meta.event_id). */
export async function loadAuditForEvent(eventId: string, limit = 100): Promise<AuditResult> {
    await requirePlatformAdmin();
    if (!UUID_RE.test(eventId)) return { rows: [], missing: false };
    const res = await getSupabaseAdmin()
        .from('admin_audit')
        .select(COLS)
        .or(`and(subject_type.eq.event,subject_id.eq.${eventId}),meta->>event_id.eq.${eventId}`)
        .order('created_at', { ascending: false })
        .limit(limit + 1);
    return finish(res, limit);
}

/** Rows where this profile is the subject (`about`) and rows where it is the actor (`by`). */
export async function loadAuditForProfile(
    profileId: string,
    limit = 50,
): Promise<{ about: AuditResult; by: AuditResult }> {
    await requirePlatformAdmin();
    if (!UUID_RE.test(profileId)) return { about: { rows: [], missing: false }, by: { rows: [], missing: false } };
    const admin = getSupabaseAdmin();
    const [about, by] = await Promise.all([
        admin
            .from('admin_audit')
            .select(COLS)
            .eq('subject_type', 'profile')
            .eq('subject_id', profileId)
            .order('created_at', { ascending: false })
            .limit(limit + 1),
        admin
            .from('admin_audit')
            .select(COLS)
            .eq('actor_profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(limit + 1),
    ]);
    return { about: await finish(about, limit), by: await finish(by, limit) };
}

export type AuditFilters = {
    action?: string;
    /** An admin's @handle (exact). */
    actor?: string;
    subjectType?: string;
    page?: number;
};

export type AuditPage = AuditResult & {
    /** Distinct values for the filter dropdowns (from the most recent rows). */
    actions: string[];
    subjectTypes: string[];
    /** The `actor` filter matched no profile. */
    actorNotFound: boolean;
};

/** The full log, newest first, for /admin/audit. */
export async function loadAuditPage(f: AuditFilters): Promise<AuditPage> {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const base: AuditPage = { rows: [], missing: false, actions: [], subjectTypes: [], actorNotFound: false };

    let actorId: string | null = null;
    const handle = (f.actor ?? '').trim().replace(/^@/, '');
    if (handle) {
        // Escape LIKE wildcards so "_" in a handle is literal.
        const exact = handle.replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data } = await admin.from('profiles').select('id').ilike('handle', exact).limit(1).maybeSingle();
        if (!data) return { ...base, actorNotFound: true };
        actorId = (data as any).id as string;
    }

    const page = Math.max(0, Math.floor(f.page ?? 0));
    let q = admin
        .from('admin_audit')
        .select(COLS)
        .order('created_at', { ascending: false })
        .range(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE); // one extra row = hasMore
    if (f.action) q = q.eq('action', f.action);
    if (f.subjectType) q = q.eq('subject_type', f.subjectType);
    if (actorId) q = q.eq('actor_profile_id', actorId);

    const [res, facets] = await Promise.all([
        q,
        admin.from('admin_audit').select('action, subject_type').order('created_at', { ascending: false }).limit(2000),
    ]);
    const out = await finish(res, AUDIT_PAGE_SIZE);
    const facetRows = facets.error ? [] : ((facets.data as any[]) ?? []);
    return {
        ...base,
        ...out,
        actions: [...new Set(facetRows.map((r) => r.action as string))].sort(),
        subjectTypes: [...new Set(facetRows.map((r) => r.subject_type as string))].sort(),
    };
}

/**
 * Where a row's subject lives in the admin console, or null when there is no
 * page for it. Pure routing over the (server-written) subject_type / meta.
 */
export function auditSubjectHref(row: Pick<AuditRow, 'subjectType' | 'subjectId' | 'meta'>): string | null {
    const eventId = typeof row.meta.event_id === 'string' ? row.meta.event_id : null;
    switch (row.subjectType) {
        case 'event':
            return UUID_RE.test(row.subjectId) ? `/admin/events/${row.subjectId}` : null;
        case 'event_ticket':
            return eventId && UUID_RE.test(eventId) ? `/admin/events/${eventId}` : null;
        case 'profile':
            return UUID_RE.test(row.subjectId) ? `/admin/users/${row.subjectId}` : null;
        case 'shop':
            return /^\d+$/.test(row.subjectId) ? `/admin/shops/${row.subjectId}` : null;
        case 'order':
            return typeof row.meta.shop_slug === 'string' && /^[a-z0-9-]+$/i.test(row.meta.shop_slug)
                ? `/shop/${row.meta.shop_slug}/orders/${encodeURIComponent(row.subjectId)}`
                : null;
        case 'post':
            return '/admin/posts';
        case 'report':
            return '/admin/reports';
        default:
            return null;
    }
}
