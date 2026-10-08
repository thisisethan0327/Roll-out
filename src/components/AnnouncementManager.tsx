'use client';
/**
 * Create / edit / unpublish / delete UI for announcements. Used by the shop
 * event page (fixed event) and the platform-admin page (site or event scope).
 * Pure presentation: every mutation goes through the server actions handed in
 * as props, which re-check permission server side.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EventPicker } from './EventPicker';
import {
    announcementState,
    type Announcement,
    type AnnouncementInput,
    type AnnouncementLevel,
    type AnnouncementState,
} from '@/lib/announcements-core';

type Result = { ok: true } | { ok: false; error: string };

export type EventOption = {
    id: string;
    label: string;            // plain "Title · date" fallback
    title?: string;
    date?: string;            // YYYY-MM-DD
    upcoming?: boolean;
    official?: boolean;
};

export type ManagerActions = {
    create: (p: { scope: 'site' | 'event'; eventId: string | null; input: AnnouncementInput }) => Promise<Result>;
    update: (id: string, input: AnnouncementInput) => Promise<Result>;
    setPublished: (id: string, published: boolean) => Promise<Result>;
    remove: (id: string) => Promise<Result>;
};

const STATE_PILL: Record<AnnouncementState, string> = {
    live: 'admin-pill neon',
    scheduled: 'admin-pill gold',
    expired: 'admin-pill',
    unpublished: 'admin-pill',
};
const LEVEL_PILL: Record<AnnouncementLevel, string> = {
    info: 'admin-pill gold',
    warning: 'admin-pill warn',
    critical: 'admin-pill warn',
};

/** ISO → value for <input type="datetime-local"> in the viewer's zone. */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Draft = {
    title: string;
    body: string;
    level: AnnouncementLevel;
    linkUrl: string;
    linkLabel: string;
    startsAt: string;
    endsAt: string;
    pinned: boolean;
    scope: 'site' | 'event';
    eventId: string;
};

const blank = (scope: 'site' | 'event', eventId: string): Draft => ({
    title: '', body: '', level: 'info', linkUrl: '', linkLabel: '', startsAt: '', endsAt: '', pinned: false, scope, eventId,
});

export function AnnouncementManager({
    announcements,
    actions,
    fixedEventId,
    eventOptions,
    eventTitles,
}: {
    announcements: Announcement[];
    actions: ManagerActions;
    /** Shop page: announcements are always for this event. */
    fixedEventId?: string;
    /** Admin page: event picker options (scope = event). */
    eventOptions?: EventOption[];
    /** Admin page: event id → title, for the list rows. */
    eventTitles?: Record<string, string>;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [editing, setEditing] = useState<string | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(blank(fixedEventId ? 'event' : 'site', fixedEventId ?? ''));
    const [err, setErr] = useState<string | null>(null);
    const [armed, setArmed] = useState<string | null>(null);

    const open = (a?: Announcement) => {
        setErr(null);
        if (!a) {
            setDraft(blank(fixedEventId ? 'event' : 'site', fixedEventId ?? ''));
            setEditing('new');
            return;
        }
        setDraft({
            title: a.title, body: a.body ?? '', level: a.level, linkUrl: a.linkUrl ?? '', linkLabel: a.linkLabel ?? '',
            startsAt: toLocalInput(a.startsAt), endsAt: toLocalInput(a.endsAt), pinned: a.pinned,
            scope: a.scope, eventId: a.eventId ?? '',
        });
        setEditing(a.id);
    };

    const run = (fn: () => Promise<Result>, after?: () => void) => {
        setErr(null);
        start(async () => {
            try {
                const res = await fn();
                if (!res.ok) {
                    setErr(res.error);
                    return;
                }
                after?.();
                router.refresh();
            } catch (e: any) {
                setErr(e?.message ?? 'Something went wrong.');
            }
        });
    };

    const save = () => {
        const input: AnnouncementInput = {
            title: draft.title,
            body: draft.body,
            level: draft.level,
            linkUrl: draft.linkUrl,
            linkLabel: draft.linkLabel,
            startsAt: fromLocalInput(draft.startsAt),
            endsAt: fromLocalInput(draft.endsAt),
            pinned: draft.pinned,
        };
        if (draft.startsAt && !input.startsAt) return setErr('Start time is not a valid date.');
        if (draft.endsAt && !input.endsAt) return setErr('End time is not a valid date.');
        if (editing === 'new') {
            const scope = fixedEventId ? 'event' : draft.scope;
            const eventId = fixedEventId ?? (scope === 'event' ? draft.eventId || null : null);
            if (scope === 'event' && !eventId) return setErr('Pick an event.');
            run(() => actions.create({ scope, eventId, input }), () => setEditing(null));
        } else if (editing) {
            run(() => actions.update(editing, input), () => setEditing(null));
        }
    };

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
    const ids = (s: string) => `ann-${s}`;

    return (
        <div>
            {err && (
                <div className="admin-pill warn" role="alert" style={{ margin: '8px 0', whiteSpace: 'normal' }}>
                    {err}
                </div>
            )}

            {editing === null && (
                <button className="admin-action-btn" onClick={() => open()} style={{ margin: '4px 0 12px' }}>
                    + NEW ANNOUNCEMENT
                </button>
            )}

            {editing !== null && (
                <form
                    className="admin-form"
                    style={{ maxWidth: 640, width: '100%', boxSizing: 'border-box' }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        save();
                    }}
                >
                    {editing === 'new' && !fixedEventId && (
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="admin-form-label" htmlFor={ids('scope')}>SCOPE</label>
                            <select id={ids('scope')} className="admin-form-input" value={draft.scope}
                                onChange={(e) => set('scope', e.target.value as 'site' | 'event')}>
                                <option value="site">Site-wide (home page)</option>
                                <option value="event">One event</option>
                            </select>
                            {draft.scope === 'event' && (
                                <EventPicker options={eventOptions ?? []} value={draft.eventId} onChange={(id) => set('eventId', id)} />
                            )}
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: 6 }}>
                        <label className="admin-form-label" htmlFor={ids('title')}>TITLE ({draft.title.length}/120)</label>
                        <input id={ids('title')} className="admin-form-input" maxLength={120} required value={draft.title}
                            onChange={(e) => set('title', e.target.value)} placeholder="_NAC Run postponed to Oct 17 (ferry strike)" />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label className="admin-form-label" htmlFor={ids('body')}>DETAILS (OPTIONAL, PLAIN TEXT, {draft.body.length}/2000)</label>
                        <textarea id={ids('body')} className="admin-form-input" rows={4} maxLength={2000} value={draft.body}
                            onChange={(e) => set('body', e.target.value)} />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label className="admin-form-label" htmlFor={ids('level')}>LEVEL</label>
                        <select id={ids('level')} className="admin-form-input" value={draft.level}
                            onChange={(e) => set('level', e.target.value as AnnouncementLevel)}>
                            <option value="info">Info (can be dismissed)</option>
                            <option value="warning">Warning</option>
                            <option value="critical">Critical (also in link previews and the calendar file)</option>
                        </select>
                    </div>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="admin-form-label" htmlFor={ids('link')}>BUTTON LINK (OPTIONAL)</label>
                            <input id={ids('link')} className="admin-form-input" value={draft.linkUrl} inputMode="url"
                                onChange={(e) => set('linkUrl', e.target.value)} placeholder="/meets or https://…" />
                        </div>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="admin-form-label" htmlFor={ids('label')}>BUTTON LABEL</label>
                            <input id={ids('label')} className="admin-form-input" maxLength={40} value={draft.linkLabel}
                                onChange={(e) => set('linkLabel', e.target.value)} placeholder="Learn more" />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="admin-form-label" htmlFor={ids('start')}>SHOW FROM (BLANK = NOW)</label>
                            <input id={ids('start')} type="datetime-local" className="admin-form-input" value={draft.startsAt}
                                onChange={(e) => set('startsAt', e.target.value)} />
                        </div>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="admin-form-label" htmlFor={ids('end')}>SHOW UNTIL (BLANK = UNTIL UNPUBLISHED)</label>
                            <input id={ids('end')} type="datetime-local" className="admin-form-input" value={draft.endsAt}
                                onChange={(e) => set('endsAt', e.target.value)} />
                        </div>
                    </div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                        <input type="checkbox" checked={draft.pinned} onChange={(e) => set('pinned', e.target.checked)} />
                        Pin to the top
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="submit" className="admin-form-btn" disabled={pending}>
                            {pending ? 'SAVING…' : editing === 'new' ? 'POST ANNOUNCEMENT' : 'SAVE CHANGES'}
                        </button>
                        <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => setEditing(null)}>
                            CANCEL
                        </button>
                    </div>
                </form>
            )}

            {announcements.length === 0 && editing === null ? (
                <div className="admin-empty">NO ANNOUNCEMENTS YET</div>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {announcements.map((a) => {
                        const state = announcementState(a);
                        return (
                            <div key={a.id} style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                    <span className={STATE_PILL[state]}>{state.toUpperCase()}</span>
                                    <span className={LEVEL_PILL[a.level]}>{a.level.toUpperCase()}</span>
                                    {a.scope === 'site' && <span className="admin-pill">SITE-WIDE</span>}
                                    {a.pinned && <span className="admin-pill">PINNED</span>}
                                </div>
                                <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{a.title}</div>
                                {a.scope === 'event' && eventTitles && a.eventId && (
                                    <div className="admin-handle">{eventTitles[a.eventId] ?? a.eventId}</div>
                                )}
                                {a.body && <div className="text-dim" style={{ fontSize: 13, whiteSpace: 'pre-line', marginTop: 4, overflowWrap: 'anywhere' }}>{a.body}</div>}
                                <div className="admin-page-sub" style={{ marginTop: 6 }} suppressHydrationWarning>
                                    FROM {new Date(a.startsAt).toLocaleString()} · {a.endsAt ? `UNTIL ${new Date(a.endsAt).toLocaleString()}` : 'UNTIL UNPUBLISHED'}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                                    <button className="admin-action-btn" disabled={pending} onClick={() => open(a)}>EDIT</button>
                                    <button className="admin-action-btn muted" disabled={pending}
                                        onClick={() => run(() => actions.setPublished(a.id, !a.published))}>
                                        {a.published ? 'UNPUBLISH' : 'REPUBLISH'}
                                    </button>
                                    <button
                                        className="admin-action-btn danger"
                                        disabled={pending}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (armed !== a.id) {
                                                setArmed(a.id);
                                                setTimeout(() => setArmed((cur) => (cur === a.id ? null : cur)), 3000);
                                                return;
                                            }
                                            setArmed(null);
                                            run(() => actions.remove(a.id));
                                        }}
                                    >
                                        {armed === a.id ? 'CLICK AGAIN TO DELETE' : 'DELETE'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
