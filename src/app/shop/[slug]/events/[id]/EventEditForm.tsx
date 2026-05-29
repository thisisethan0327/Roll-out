'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateEvent, cancelEvent, uncancelEvent, deleteEvent } from '../actions';

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'PUBLIC' },
    { value: 'followers', label: 'FOLLOWERS' },
    { value: 'private', label: 'PRIVATE' },
];

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);

export function EventEditForm({
    event,
    shopId,
    slug,
    callerRole,
}: {
    event: any;
    shopId: number;
    slug: string;
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [savedFlash, setSavedFlash] = useState(false);

    const canManage = MANAGER_ROLES.has(callerRole);
    const canDelete = OWNER_ROLES.has(callerRole);

    // datetime-local needs `YYYY-MM-DDTHH:MM` (no Z, no seconds)
    const startAtLocal = event.start_at
        ? (() => {
              const d = new Date(event.start_at);
              const pad = (n: number) => n.toString().padStart(2, '0');
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
                  d.getHours(),
              )}:${pad(d.getMinutes())}`;
          })()
        : '';

    const tagsString = Array.isArray(event.tags) ? event.tags.join(', ') : '';

    const onSubmit = async (formData: FormData) => {
        start(async () => {
            try {
                await updateEvent(event.id, shopId, formData);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1500);
                router.refresh();
            } catch (e: any) {
                alert('Save failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onCancel = () => {
        if (!confirm('Cancel this event? RSVPs will see it as cancelled.')) return;
        start(async () => {
            try {
                await cancelEvent(event.id, shopId);
                router.refresh();
            } catch (e: any) {
                alert('Cancel failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onUncancel = () => {
        start(async () => {
            try {
                await uncancelEvent(event.id, shopId);
                router.refresh();
            } catch (e: any) {
                alert('Uncancel failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onDelete = () => {
        if (!confirm('DELETE this event permanently? This also drops all RSVPs and cannot be undone.')) return;
        start(async () => {
            try {
                await deleteEvent(event.id, shopId);
                // deleteEvent redirects, so no refresh needed.
            } catch (e: any) {
                alert('Delete failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <form className="admin-form" action={onSubmit} style={{ maxWidth: 720 }}>
            <SectionHeading>DETAILS</SectionHeading>
            <label className="admin-form-label">TITLE</label>
            <input
                name="title"
                className="admin-form-input"
                minLength={4}
                required
                defaultValue={event.title ?? ''}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">DESCRIPTION</label>
            <textarea
                name="description"
                className="admin-form-input"
                rows={4}
                maxLength={400}
                defaultValue={event.description ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>LOCATION</SectionHeading>
            <label className="admin-form-label">LOCATION NAME</label>
            <input
                name="location_name"
                className="admin-form-input"
                defaultValue={event.location_name ?? ''}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">LOCATION DETAIL</label>
            <input
                name="location_detail"
                className="admin-form-input"
                defaultValue={event.location_detail ?? ''}
                disabled={!canManage || pending}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className="admin-form-label">LAT</label>
                    <input
                        type="number"
                        step="any"
                        name="lat"
                        className="admin-form-input"
                        defaultValue={event.lat ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
                <div>
                    <label className="admin-form-label">LNG</label>
                    <input
                        type="number"
                        step="any"
                        name="lng"
                        className="admin-form-input"
                        defaultValue={event.lng ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
            </div>

            <SectionHeading>WHEN & CAPACITY</SectionHeading>
            <label className="admin-form-label">START AT</label>
            <input
                type="datetime-local"
                name="start_at"
                className="admin-form-input"
                required
                defaultValue={startAtLocal}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">CAPACITY</label>
            <input
                type="number"
                min={1}
                name="capacity"
                className="admin-form-input"
                defaultValue={event.capacity ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>VISIBILITY</SectionHeading>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VISIBILITY.map((v) => (
                    <label
                        key={v.value}
                        className="admin-form-label"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: canManage ? 'pointer' : 'not-allowed',
                        }}
                    >
                        <input
                            type="radio"
                            name="visibility"
                            value={v.value}
                            defaultChecked={event.visibility === v.value}
                            required
                            disabled={!canManage || pending}
                        />
                        {v.label}
                    </label>
                ))}
            </div>

            <SectionHeading>TAGS</SectionHeading>
            <label className="admin-form-label">TAGS (COMMA-SEPARATED)</label>
            <input
                name="tags"
                className="admin-form-input"
                defaultValue={tagsString}
                disabled={!canManage || pending}
            />

            <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canManage && (
                    <button type="submit" className="admin-form-btn" disabled={pending}>
                        {savedFlash ? 'SAVED ✓' : 'SAVE CHANGES'}
                    </button>
                )}
                {canManage && !event.cancelled_at && (
                    <button
                        type="button"
                        className="admin-action-btn danger"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        CANCEL EVENT
                    </button>
                )}
                {canManage && event.cancelled_at && (
                    <button
                        type="button"
                        className="admin-action-btn"
                        onClick={onUncancel}
                        disabled={pending}
                    >
                        UNCANCEL EVENT
                    </button>
                )}
                {canDelete && (
                    <button
                        type="button"
                        className="admin-action-btn danger"
                        onClick={onDelete}
                        disabled={pending}
                    >
                        DELETE
                    </button>
                )}
            </div>
        </form>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                marginTop: 14,
                marginBottom: 6,
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                color: 'var(--gold)',
                borderTop: '1px solid var(--rule)',
                paddingTop: 10,
            }}
        >
            {children}
        </div>
    );
}
