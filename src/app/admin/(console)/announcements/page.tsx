import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ANNOUNCEMENT_COLUMNS, rowToAnnouncement, sortAnnouncements, type Announcement } from '@/lib/announcements-core';
import { AdminAnnouncements } from './AdminAnnouncements';

export const metadata = { title: 'Announcements' };

async function load(): Promise<{ list: Announcement[]; events: { id: string; title: string | null; start_at: string | null }[]; ready: boolean }> {
    const admin = getSupabaseAdmin();
    const [a, e] = await Promise.all([
        admin.from('announcements').select(ANNOUNCEMENT_COLUMNS).order('created_at', { ascending: false }).limit(200),
        admin.from('events').select('id, title, start_at').is('cancelled_at', null).order('start_at', { ascending: false }).limit(150),
    ]);
    const missing = !!a.error && /does not exist|schema cache|42P01|PGRST205/i.test(`${a.error.code ?? ''} ${a.error.message}`);
    if (a.error && !missing) console.error('[admin/announcements] load failed:', a.error.message);
    return {
        list: ((a.data as any[]) ?? []).map(rowToAnnouncement),
        events: (e.data as any[]) ?? [],
        ready: !a.error,
    };
}

export default async function AnnouncementsPage() {
    const { list, events, ready } = await load();
    const eventTitles = Object.fromEntries(events.map((ev) => [ev.id, ev.title ?? ev.id]));
    const eventOptions = events.map((ev) => ({
        id: ev.id,
        label: `${ev.title ?? 'Untitled'}${ev.start_at ? ' · ' + ev.start_at.slice(0, 10) : ''}`,
    }));
    // Sites first (pinned/severity), then by recency.
    const ordered = [...list.filter((x) => x.scope === 'site'), ...sortAnnouncements(list.filter((x) => x.scope === 'event'))];
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ANNOUNCEMENTS</div>
                    <div className="admin-page-sub">SITE-WIDE AND EVENT NOTICES · NO DEPLOY NEEDED</div>
                </div>
            </div>
            {!ready ? (
                <div className="admin-empty">ANNOUNCEMENTS TABLE NOT AVAILABLE YET — APPLY MIGRATION 090</div>
            ) : (
                <AdminAnnouncements announcements={ordered} eventOptions={eventOptions} eventTitles={eventTitles} />
            )}
        </>
    );
}
