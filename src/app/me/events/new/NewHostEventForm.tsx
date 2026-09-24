'use client';
/**
 * Client half of /me/events/new. createHostEvent redirects on success and
 * returns { ok: false, error } on failure (see actions.ts) — useActionState
 * gives us that failure back as render state instead of a thrown, redacted
 * Error message.
 */
import Link from 'next/link';
import { useActionState } from 'react';
import { createHostEvent } from '../actions';
import { EventCoverPicker } from '@/app/shop/[slug]/events/EventCoverPicker';
import { EventStartAtField } from '@/components/EventStartAtField';

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'PUBLIC' },
    { value: 'followers', label: 'FOLLOWERS' },
    { value: 'private', label: 'PRIVATE' },
];

type FormState = { ok: false; error: string } | null;

async function submitCreateHostEvent(_prev: FormState, formData: FormData): Promise<FormState> {
    const result = await createHostEvent(formData);
    // On success createHostEvent calls redirect(), which throws internally
    // and never reaches this line — so getting here always means failure.
    if (result && !result.ok) return result;
    return null;
}

export function NewHostEventForm() {
    const [state, formAction, pending] = useActionState(submitCreateHostEvent, null);

    return (
        <form className="admin-form" action={formAction} style={{ maxWidth: 720 }}>
            {state && !state.ok ? <div className="admin-form-error" style={{ marginBottom: 12 }}>{state.error}</div> : null}

            <SectionHeading>TYPE & COVER</SectionHeading>
            <EventCoverPicker mode="create" />

            <SectionHeading>DETAILS</SectionHeading>
            <label className="admin-form-label">TITLE</label>
            <input name="title" className="admin-form-input" minLength={4} required placeholder="Sunday Canyon Run" disabled={pending} />

            <label className="admin-form-label">DESCRIPTION</label>
            <textarea name="description" className="admin-form-input" rows={4} maxLength={400} placeholder="What's the vibe? Who should come? (max 400 chars)" disabled={pending} />

            <SectionHeading>LOCATION</SectionHeading>
            <label className="admin-form-label">LOCATION NAME *</label>
            <input name="location_name" className="admin-form-input" placeholder="Cars & Coffee Lot" required minLength={2} disabled={pending} />

            <label className="admin-form-label">LOCATION DETAIL (OPTIONAL)</label>
            <input name="location_detail" className="admin-form-input" placeholder="North lot by the coffee stand" disabled={pending} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className="admin-form-label">LAT (OPTIONAL)</label>
                    <input type="number" step="any" name="lat" className="admin-form-input" placeholder="47.6062" disabled={pending} />
                </div>
                <div>
                    <label className="admin-form-label">LNG (OPTIONAL)</label>
                    <input type="number" step="any" name="lng" className="admin-form-input" placeholder="-122.3321" disabled={pending} />
                </div>
            </div>
            <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Add lat/lng to pin your meet on the Meets map. Look them up on Google Maps (right-click → coordinates).
            </div>

            <SectionHeading>／ ROUTE DESTINATION (OPTIONAL)</SectionHeading>
            <label className="admin-form-label">DESTINATION NAME</label>
            <input name="destination_name" className="admin-form-input" maxLength={80} placeholder="e.g. Chuckanut Manor Seafood & Grill" disabled={pending} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className="admin-form-label">DESTINATION LAT</label>
                    <input type="number" step="any" name="destination_lat" className="admin-form-input" placeholder="47.7300" disabled={pending} />
                </div>
                <div>
                    <label className="admin-form-label">DESTINATION LNG</label>
                    <input type="number" step="any" name="destination_lng" className="admin-form-input" placeholder="-122.4800" disabled={pending} />
                </div>
            </div>
            <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                You can also plan stops and pick coordinates on a map right after creating the event.
            </div>

            <SectionHeading>WHEN & CAPACITY</SectionHeading>
            <label className="admin-form-label">START AT</label>
            <EventStartAtField disabled={pending} />

            <label className="admin-form-label">CAPACITY (OPTIONAL)</label>
            <input type="number" min={1} name="capacity" className="admin-form-input" placeholder="30" disabled={pending} />

            <SectionHeading>VISIBILITY</SectionHeading>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VISIBILITY.map((v) => (
                    <label key={v.value} className="admin-form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="visibility" value={v.value} defaultChecked={v.value === 'public'} required disabled={pending} />
                        {v.label}
                    </label>
                ))}
            </div>

            <SectionHeading>TAGS</SectionHeading>
            <label className="admin-form-label">TAGS (COMMA-SEPARATED)</label>
            <input name="tags" className="admin-form-input" placeholder="jdm, canyon, sunday" disabled={pending} />

            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                <button type="submit" className="admin-form-btn" disabled={pending}>
                    {pending ? 'HOSTING…' : 'HOST EVENT ›'}
                </button>
                <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>CANCEL</Link>
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
