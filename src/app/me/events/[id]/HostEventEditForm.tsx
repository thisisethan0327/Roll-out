'use client';
/**
 * Edit form for a host's own event. Binds to updateHostEvent + cancelHostEvent.
 * Reuses the shop EventCoverPicker (mode="edit"). No shop/role concept here —
 * ownership is enforced server-side.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateHostEvent, cancelHostEvent } from '../actions';
import { EventCoverPicker } from '@/app/shop/[slug]/events/EventCoverPicker';

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'PUBLIC' },
    { value: 'followers', label: 'FOLLOWERS' },
    { value: 'private', label: 'PRIVATE' },
];

export function HostEventEditForm({ event }: { event: any }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [savedFlash, setSavedFlash] = useState(false);

    const startAtLocal = event.start_at
        ? (() => {
              const d = new Date(event.start_at);
              const pad = (n: number) => n.toString().padStart(2, '0');
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          })()
        : '';
    const tagsString = Array.isArray(event.tags) ? event.tags.join(', ') : '';

    const onSubmit = async (formData: FormData) => {
        start(async () => {
            try {
                await updateHostEvent(event.id, formData);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1500);
                router.refresh();
            } catch (e: any) {
                alert('Save failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onCancel = () => {
        if (!confirm('Cancel this event? People who RSVP’d will see it as cancelled.')) return;
        start(async () => {
            try {
                await cancelHostEvent(event.id, true);
                router.refresh();
            } catch (e: any) {
                alert('Cancel failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onUncancel = () => {
        start(async () => {
            try {
                await cancelHostEvent(event.id, false);
                router.refresh();
            } catch (e: any) {
                alert('Uncancel failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <form className="admin-form" action={onSubmit} style={{ maxWidth: 720 }}>
            <SectionHeading>DETAILS</SectionHeading>
            <label className="admin-form-label">TITLE</label>
            <input name="title" className="admin-form-input" minLength={4} required defaultValue={event.title ?? ''} disabled={pending} />

            <label className="admin-form-label">DESCRIPTION</label>
            <textarea name="description" className="admin-form-input" rows={4} maxLength={400} defaultValue={event.description ?? ''} disabled={pending} />

            <SectionHeading>LOCATION</SectionHeading>
            <label className="admin-form-label">LOCATION NAME *</label>
            <input name="location_name" className="admin-form-input" defaultValue={event.location_name ?? ''} disabled={pending} required minLength={2} />

            <label className="admin-form-label">LOCATION DETAIL</label>
            <input name="location_detail" className="admin-form-input" defaultValue={event.location_detail ?? ''} disabled={pending} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className="admin-form-label">LAT</label>
                    <input type="number" step="any" name="lat" className="admin-form-input" defaultValue={event.lat ?? ''} disabled={pending} />
                </div>
                <div>
                    <label className="admin-form-label">LNG</label>
                    <input type="number" step="any" name="lng" className="admin-form-input" defaultValue={event.lng ?? ''} disabled={pending} />
                </div>
            </div>

            <SectionHeading>WHEN & CAPACITY</SectionHeading>
            <label className="admin-form-label">START AT</label>
            <input type="datetime-local" name="start_at" className="admin-form-input" required defaultValue={startAtLocal} disabled={pending} />

            <label className="admin-form-label">CAPACITY</label>
            <input type="number" min={1} name="capacity" className="admin-form-input" defaultValue={event.capacity ?? ''} disabled={pending} />

            <SectionHeading>VISIBILITY</SectionHeading>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VISIBILITY.map((v) => (
                    <label key={v.value} className="admin-form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="visibility" value={v.value} defaultChecked={event.visibility === v.value} required disabled={pending} />
                        {v.label}
                    </label>
                ))}
            </div>

            <SectionHeading>COVER</SectionHeading>
            <EventCoverPicker mode="edit" initialType={event.type} initialUrl={event.hero_image_url} disabled={pending} />

            <SectionHeading>TAGS</SectionHeading>
            <label className="admin-form-label">TAGS (COMMA-SEPARATED)</label>
            <input name="tags" className="admin-form-input" defaultValue={tagsString} disabled={pending} />

            <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="admin-form-btn" disabled={pending}>
                    {savedFlash ? 'SAVED ✓' : 'SAVE CHANGES'}
                </button>
                {!event.cancelled_at ? (
                    <button type="button" className="admin-action-btn danger" onClick={onCancel} disabled={pending}>CANCEL EVENT</button>
                ) : (
                    <button type="button" className="admin-action-btn" onClick={onUncancel} disabled={pending}>UNCANCEL EVENT</button>
                )}
            </div>
        </form>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 14, marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)', color: 'var(--gold)', borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            {children}
        </div>
    );
}
