'use client';
import { AnnouncementManager, type EventOption, type ManagerActions } from '@/components/AnnouncementManager';
import type { Announcement } from '@/lib/announcements-core';
import {
    createAnnouncementAdminAction,
    deleteAnnouncementAdminAction,
    setAnnouncementPublishedAdminAction,
    updateAnnouncementAdminAction,
} from './actions';

const actions: ManagerActions = {
    create: createAnnouncementAdminAction,
    update: updateAnnouncementAdminAction,
    setPublished: setAnnouncementPublishedAdminAction,
    remove: deleteAnnouncementAdminAction,
};

export function AdminAnnouncements(props: {
    announcements: Announcement[];
    eventOptions: EventOption[];
    eventTitles: Record<string, string>;
}) {
    return <AnnouncementManager {...props} actions={actions} />;
}
