'use client';
/** ANNOUNCEMENTS section on the shop event page (host shop managers / host). */
import { AnnouncementManager, type ManagerActions } from '@/components/AnnouncementManager';
import type { Announcement } from '@/lib/announcements-core';
import {
    createEventAnnouncementAction,
    deleteEventAnnouncementAction,
    setEventAnnouncementPublishedAction,
    updateEventAnnouncementAction,
} from './announcement-actions';

export function AnnouncementsSection({ eventId, announcements }: { eventId: string; announcements: Announcement[] }) {
    const actions: ManagerActions = {
        create: ({ input }) => createEventAnnouncementAction(eventId, input),
        update: updateEventAnnouncementAction,
        setPublished: setEventAnnouncementPublishedAction,
        remove: deleteEventAnnouncementAction,
    };
    return (
        <div style={{ marginTop: 24 }}>
            <div className="admin-page-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>ANNOUNCEMENTS</div>
                    <div className="admin-page-sub">NOTICES ON THE EVENT PAGE · SHOWN FOR THE DATES YOU SET</div>
                </div>
            </div>
            <AnnouncementManager announcements={announcements} actions={actions} fixedEventId={eventId} />
        </div>
    );
}
