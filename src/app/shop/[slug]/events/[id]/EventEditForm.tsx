'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateEvent, cancelEvent, uncancelEvent, deleteEvent } from '../actions';
import { EventCoverPicker } from '../EventCoverPicker';
import { TierRowsEditor, type TierDraft } from '../TierRowsEditor';
import { EventStartAtField } from '@/components/EventStartAtField';
import { CancelAndRefundAllButton } from '@/components/CancelAndRefundAllButton';
import { InfoTip } from '@/components/glide/InfoTip';
import { AREA_LABEL_TIP } from '@/lib/event-area-label';
import { Check } from '@/components/icons';
import { confirmDialog } from '@/components/glide/confirm';

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'Public' },
    { value: 'followers', label: 'Followers' },
    { value: 'private', label: 'Private' },
];

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);

export function EventEditForm({
    event,
    shopId,
    slug,
    callerRole,
    tiers,
}: {
    event: any;
    shopId: number;
    slug: string;
    callerRole: string;
    /** Existing active tiers (E2), pre-shaped for the editor. */
    tiers?: TierDraft[];
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [savedFlash, setSavedFlash] = useState(false);

    const canManage = MANAGER_ROLES.has(callerRole);
    const canDelete = OWNER_ROLES.has(callerRole);

    // 077: any active priced tier means this event needs the refund-aware
    // cancel path instead of the plain one. cancelEventAndRefundAllAction
    // re-derives the real paid/confirmed list from the DB regardless — this
    // is only which button to show.
    const isPaidEvent =
        (event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid') &&
        (tiers ?? []).some((t) => Number(t.price || 0) > 0);

    // Start time and its zone travel together now — see EventStartAtField.
    // The old pre-fill rendered the instant in the BROWSER's zone while the
    // server parsed the reply in its own, so every save moved the meet.

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

    const eventName = event.title ? `"${event.title}"` : 'this event';

    const onCancel = async () => {
        const ok = await confirmDialog({
            title: `Cancel ${eventName}?`,
            message: "People who RSVP'd see it as cancelled. You can uncancel it later.",
            confirmLabel: 'Cancel event',
            cancelLabel: 'Keep event',
        });
        if (!ok) return;
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

    const onDelete = async () => {
        const going = Number(event.attending_count ?? 0);
        const ok = await confirmDialog({
            title: `Delete ${eventName}?`,
            message: `This also removes every RSVP${going > 0 ? ` (${going} going)` : ''}. This can't be undone.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
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
            <SectionHeading>Details</SectionHeading>
            <label className="admin-form-label">Title</label>
            <input
                name="title"
                className="admin-form-input"
                minLength={4}
                required
                defaultValue={event.title ?? ''}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">Description</label>
            <textarea
                name="description"
                className="admin-form-input"
                rows={4}
                maxLength={400}
                defaultValue={event.description ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>Location</SectionHeading>
            <label className="admin-form-label">Location name *</label>
            <input
                name="location_name"
                className="admin-form-input"
                defaultValue={event.location_name ?? ''}
                disabled={!canManage || pending}
                required
                minLength={2}
            />

            <label className="admin-form-label">Location detail</label>
            <input
                name="location_detail"
                className="admin-form-input"
                defaultValue={event.location_detail ?? ''}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">
                General area <InfoTip text={AREA_LABEL_TIP} label="About General area" />
            </label>
            <input
                name="area_label"
                className="admin-form-input"
                maxLength={60}
                placeholder="e.g. Edmonds, WA"
                defaultValue={event.area_label ?? ''}
                disabled={!canManage || pending}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div>
                    <label className="admin-form-label">Lat</label>
                    <input
                        type="number"
                        step="any"
                        name="lat"
                        className="admin-form-input"
                        style={{ width: '100%' }}
                        defaultValue={event.lat ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
                <div>
                    <label className="admin-form-label">Lng</label>
                    <input
                        type="number"
                        step="any"
                        name="lng"
                        className="admin-form-input"
                        style={{ width: '100%' }}
                        defaultValue={event.lng ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
            </div>

            <SectionHeading>When & capacity</SectionHeading>
            <label className="admin-form-label">Start at</label>
            <EventStartAtField valueIso={event.start_at} disabled={!canManage || pending} />

            <label className="admin-form-label">Capacity</label>
            <input
                type="number"
                min={1}
                name="capacity"
                className="admin-form-input"
                defaultValue={event.capacity ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>RSVP mode & tiers</SectionHeading>
            <TierRowsEditor
                initialMode={event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid' ? 'tiered' : 'free'}
                initialTiers={tiers}
                disabled={!canManage || pending}
            />

            <SectionHeading>Visibility</SectionHeading>
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

            <SectionHeading>Cover</SectionHeading>
            <EventCoverPicker
                mode="edit"
                initialType={event.type}
                initialUrl={event.hero_image_url}
                disabled={!canManage || pending}
            />

            <SectionHeading>Tags</SectionHeading>
            <label className="admin-form-label">Tags (comma-separated)</label>
            <input
                name="tags"
                className="admin-form-input"
                defaultValue={tagsString}
                disabled={!canManage || pending}
            />

            <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canManage && (
                    <button type="submit" className="admin-form-btn" disabled={pending}>
                        {savedFlash ? <>Saved <Check /></> : 'Save changes'}
                    </button>
                )}
                {canManage && !event.cancelled_at && isPaidEvent && (
                    <CancelAndRefundAllButton
                        eventId={event.id}
                        eventTitle={event.title ?? ''}
                        onDone={() => router.refresh()}
                    />
                )}
                {canManage && !event.cancelled_at && !isPaidEvent && (
                    <button
                        type="button"
                        className="admin-action-btn danger"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        Cancel event
                    </button>
                )}
                {canManage && event.cancelled_at && (
                    <button
                        type="button"
                        className="admin-action-btn"
                        onClick={onUncancel}
                        disabled={pending}
                    >
                        Uncancel event
                    </button>
                )}
                {canDelete && (
                    <button
                        type="button"
                        className="admin-action-btn danger"
                        onClick={onDelete}
                        disabled={pending}
                    >
                        Delete
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
