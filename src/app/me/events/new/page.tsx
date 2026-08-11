/**
 * /me/events/new — a verified host creates a no-shop community event.
 * Mirrors the shop event form (reuses EventCoverPicker) but binds to
 * createHostEvent and is gated by requireVerifiedHost.
 */
import Link from 'next/link';
import { requireVerifiedHost } from '@/lib/me-guard';
import { EventCoverPicker } from '@/app/shop/[slug]/events/EventCoverPicker';
import { createHostEvent } from '../actions';

export const metadata = { title: 'Host Event' };

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'PUBLIC' },
    { value: 'followers', label: 'FOLLOWERS' },
    { value: 'private', label: 'PRIVATE' },
];

export default async function NewHostEventPage() {
    await requireVerifiedHost('/me/events/new');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">HOST EVENT</div>
                    <div className="admin-page-sub">YOUR COMMUNITY EVENT · NO SHOP</div>
                </div>
                <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>‹ BACK</Link>
            </div>

            <form className="admin-form" action={createHostEvent} style={{ maxWidth: 720 }}>
                <SectionHeading>TYPE & COVER</SectionHeading>
                <EventCoverPicker mode="create" />

                <SectionHeading>DETAILS</SectionHeading>
                <label className="admin-form-label">TITLE</label>
                <input name="title" className="admin-form-input" minLength={4} required placeholder="Sunday Canyon Run" />

                <label className="admin-form-label">DESCRIPTION</label>
                <textarea name="description" className="admin-form-input" rows={4} maxLength={400} placeholder="What's the vibe? Who should come? (max 400 chars)" />

                <SectionHeading>LOCATION</SectionHeading>
                <label className="admin-form-label">LOCATION NAME *</label>
                <input name="location_name" className="admin-form-input" placeholder="Cars & Coffee Lot" required minLength={2} />

                <label className="admin-form-label">LOCATION DETAIL (OPTIONAL)</label>
                <input name="location_detail" className="admin-form-input" placeholder="North lot by the coffee stand" />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label className="admin-form-label">LAT (OPTIONAL)</label>
                        <input type="number" step="any" name="lat" className="admin-form-input" placeholder="47.6062" />
                    </div>
                    <div>
                        <label className="admin-form-label">LNG (OPTIONAL)</label>
                        <input type="number" step="any" name="lng" className="admin-form-input" placeholder="-122.3321" />
                    </div>
                </div>
                <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Add lat/lng to pin your meet on the Meets map. Look them up on Google Maps (right-click → coordinates).
                </div>

                <SectionHeading>WHEN & CAPACITY</SectionHeading>
                <label className="admin-form-label">START AT</label>
                <input type="datetime-local" name="start_at" className="admin-form-input" required />

                <label className="admin-form-label">CAPACITY (OPTIONAL)</label>
                <input type="number" min={1} name="capacity" className="admin-form-input" placeholder="30" />

                <SectionHeading>VISIBILITY</SectionHeading>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {VISIBILITY.map((v) => (
                        <label key={v.value} className="admin-form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input type="radio" name="visibility" value={v.value} defaultChecked={v.value === 'public'} required />
                            {v.label}
                        </label>
                    ))}
                </div>

                <SectionHeading>TAGS</SectionHeading>
                <label className="admin-form-label">TAGS (COMMA-SEPARATED)</label>
                <input name="tags" className="admin-form-input" placeholder="jdm, canyon, sunday" />

                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn">HOST EVENT ›</button>
                    <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>CANCEL</Link>
                </div>
            </form>
        </>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 14, marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)', color: 'var(--gold)', borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            {children}
        </div>
    );
}
