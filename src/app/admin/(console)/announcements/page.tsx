import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ANNOUNCEMENT_COLUMNS, rowToAnnouncement, sortAnnouncements, type Announcement } from '@/lib/announcements-core';
import { AdminAnnouncements } from './AdminAnnouncements';

export const metadata = { title: 'Announcements' };

type EventRow = { id: string; title: string | null; start_at: string | null; is_official?: boolean | null };

async function load(): Promise<{ list: Announcement[]; events: EventRow[]; ready: boolean }> {
    const admin = getSupabaseAdmin();
    const [a, e] = await Promise.all([
        admin.from('announcements').select(ANNOUNCEMENT_COLUMNS).order('created_at', { ascending: false }).limit(200),
        admin.from('events').select('id, title, start_at, is_official').is('cancelled_at', null).order('start_at', { ascending: false }).limit(150),
    ]);
    const missing = !!a.error && /does not exist|schema cache|42P01|PGRST205/i.test(`${a.error.code ?? ''} ${a.error.message}`);
    if (a.error && !missing) console.error('[admin/announcements] load failed:', a.error.message);
    return {
        list: ((a.data as any[]) ?? []).map(rowToAnnouncement),
        events: (e.data as EventRow[]) ?? [],
        ready: !a.error,
    };
}

export default async function AnnouncementsPage() {
    const { list, events, ready } = await load();
    const eventTitles = Object.fromEntries(events.map((ev) => [ev.id, ev.title ?? ev.id]));
    // Picker order: upcoming events soonest-first (the ones announcements are about), then past
    // events newest-first. Official events get a star so the next run is easy to spot.
    const nowMs = Date.now();
    const startMs = (ev: EventRow) => (ev.start_at ? new Date(ev.start_at).getTime() : NaN);
    const upcoming = events.filter((ev) => startMs(ev) >= nowMs).sort((a, b) => startMs(a) - startMs(b));
    const past = events.filter((ev) => !(startMs(ev) >= nowMs));
    const toOption = (ev: EventRow, tag: string) => ({
        id: ev.id,
        label: `${tag}${ev.is_official ? '★ ' : ''}${ev.title ?? 'Untitled'}${ev.start_at ? ' · ' + ev.start_at.slice(0, 10) : ''}`,
    });
    const eventOptions = [...upcoming.map((ev) => toOption(ev, 'UPCOMING · ')), ...past.map((ev) => toOption(ev, 'PAST · '))];
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
