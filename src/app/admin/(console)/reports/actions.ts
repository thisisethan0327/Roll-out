'use server';

/**
 * Platform-admin handling of rollout.content_reports (App Store guideline 1.2).
 *
 * Every write re-checks requirePlatformAdmin() and goes through the service-role
 * client. The client only ever sends a report id: the target of a takedown is
 * read from the report row server-side, never trusted from the browser.
 * Columns written are the ones the table defines: status, reviewed_by (the
 * admin's rollout.profiles.id), reviewed_at, action_taken.
 */
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { forceDeletePost } from '../moderation-actions';

export type ReportStatus = 'pending' | 'reviewing' | 'actioned' | 'dismissed';
type Result = { ok: boolean; error?: string };

const STATUSES: ReportStatus[] = ['pending', 'reviewing', 'actioned', 'dismissed'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanNote(note: string | undefined): string | null {
    const n = (note ?? '').trim().slice(0, 500);
    return n || null;
}

function refresh() {
    revalidatePath('/admin/reports');
    revalidatePath('/admin/overview');
}

async function writeStatus(
    reportId: string,
    status: ReportStatus,
    reviewerProfileId: string,
    actionTaken: string | null,
): Promise<Result> {
    const admin = getSupabaseAdmin();
    const reopen = status === 'pending';
    const { error } = await admin
        .from('content_reports')
        .update({
            status,
            reviewed_by: reopen ? null : reviewerProfileId,
            reviewed_at: reopen ? null : new Date().toISOString(),
            action_taken: reopen ? null : actionTaken,
        })
        .eq('id', reportId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

/** MARK REVIEWING / DISMISS / ACTIONED (no takedown) / REOPEN (-> pending). */
export async function setReportStatus(input: {
    reportId: string;
    status: ReportStatus;
    note?: string;
}): Promise<Result> {
    const { profile } = await requirePlatformAdmin();
    if (!UUID_RE.test(input.reportId)) return { ok: false, error: 'Bad report id' };
    if (!STATUSES.includes(input.status)) return { ok: false, error: 'Bad status' };
    const note = cleanNote(input.note);
    const res = await writeStatus(input.reportId, input.status, profile.profileId, note);
    if (res.ok) {
        await logAdminAction(profile, 'report.set_status', 'report', input.reportId, {
            status: input.status,
            ...(note ? { note } : {}),
        });
        refresh();
    }
    return res;
}

/**
 * ACTIONED + remove the reported content. Posts reuse forceDeletePost (the same
 * soft-delete the /admin/posts page uses); comments get the same soft-delete
 * (post_comments.deleted_at). Profiles and messages have no takedown here.
 */
export async function actionReportWithTakedown(input: {
    reportId: string;
    note?: string;
}): Promise<Result> {
    const { profile } = await requirePlatformAdmin();
    if (!UUID_RE.test(input.reportId)) return { ok: false, error: 'Bad report id' };

    const admin = getSupabaseAdmin();
    const { data: report, error: loadError } = await admin
        .from('content_reports')
        .select('id, target_type, target_id')
        .eq('id', input.reportId)
        .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    if (!report) return { ok: false, error: 'Report not found' };

    let tag: string;
    if (report.target_type === 'post') {
        try {
            await forceDeletePost(report.target_id);
        } catch (e: any) {
            return { ok: false, error: e?.message ?? 'Could not remove the post' };
        }
        tag = 'post_removed';
    } else if (report.target_type === 'comment') {
        const { error } = await admin
            .from('post_comments')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', report.target_id);
        if (error) return { ok: false, error: error.message };
        tag = 'comment_removed';
    } else {
        return { ok: false, error: 'No takedown for this target type' };
    }

    const note = cleanNote(input.note);
    const res = await writeStatus(
        input.reportId,
        'actioned',
        profile.profileId,
        note ? `${tag}: ${note}` : tag,
    );
    if (res.ok) {
        console.warn('[admin] @%s actioned report %s (%s)', profile.handle, input.reportId, tag);
        await logAdminAction(profile, 'report.action_takedown', 'report', input.reportId, {
            target_type: report.target_type,
            target_id: report.target_id,
            result: tag,
            ...(note ? { note } : {}),
        });
        refresh();
    }
    return res;
}
