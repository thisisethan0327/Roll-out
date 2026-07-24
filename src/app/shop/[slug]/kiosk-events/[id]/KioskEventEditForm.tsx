'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateKioskEvent } from '../actions';
import { TagListEditor } from '../TagListEditor';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

/** Mirror of the kiosk's splitTitle(): first case-insensitive ' with '. */
function splitTitle(title: string): { main: string; sub: string | null } {
    const m = title.match(/^(.*?)\s+(with\s+.*)$/i);
    if (!m) return { main: title, sub: null };
    return { main: m[1], sub: m[2] };
}

export function KioskEventEditForm({
    event,
    shopId,
    callerRole,
}: {
    event: any;
    shopId: number;
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [savedFlash, setSavedFlash] = useState(false);
    const [title, setTitle] = useState<string>(event.title ?? '');

    const canManage = MANAGER_ROLES.has(callerRole);
    const split = splitTitle(title);

    const initialPartners: string[] = Array.isArray(event.partners)
        ? event.partners.map((p: any) => String(p)).filter(Boolean)
        : [];
    const initialHighlights: string[] = Array.isArray(event.highlights)
        ? event.highlights
              .map((h: any) => (typeof h === 'string' ? h : h?.label))
              .filter(Boolean)
        : [];

    const onSubmit = async (formData: FormData) => {
        const starts = String(formData.get('starts_at') ?? '');
        const ends = String(formData.get('ends_at') ?? '');
        if (starts && ends && ends < starts) {
            alert('End date must be on or after the start date.');
            return;
        }
        start(async () => {
            try {
                await updateKioskEvent(event.id, shopId, formData);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1500);
                router.refresh();
            } catch (e: any) {
                alert('Save failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <form className="admin-form" action={onSubmit}>
            <SectionHeading>DETAILS</SectionHeading>
            <label className="admin-form-label">TITLE *</label>
            <input
                name="title"
                className="admin-form-input"
                minLength={3}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canManage || pending}
            />
            <div className="admin-handle" style={{ margin: '4px 0 8px' }}>
                KIOSK RENDERS: {split.main.toUpperCase() || '—'}
                {split.sub ? ` / ${split.sub.toUpperCase()}` : ''}
            </div>

            <label className="admin-form-label">TAGLINE</label>
            <input
                name="tagline"
                className="admin-form-input"
                defaultValue={event.tagline ?? ''}
                disabled={!canManage || pending}
            />

            <label className="admin-form-label">DESCRIPTION</label>
            <textarea
                name="description"
                className="admin-form-input"
                rows={5}
                defaultValue={event.description ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>DATES</SectionHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className="admin-form-label">STARTS *</label>
                    <input
                        type="date"
                        name="starts_at"
                        className="admin-form-input"
                        required
                        defaultValue={event.starts_at ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
                <div>
                    <label className="admin-form-label">ENDS *</label>
                    <input
                        type="date"
                        name="ends_at"
                        className="admin-form-input"
                        required
                        defaultValue={event.ends_at ?? ''}
                        disabled={!canManage || pending}
                    />
                </div>
            </div>

            <SectionHeading>VENUE</SectionHeading>
            <label className="admin-form-label">VENUE NAME</label>
            <input
                name="venue_name"
                className="admin-form-input"
                defaultValue={event.venue_name ?? ''}
                disabled={!canManage || pending}
            />
            <label className="admin-form-label">VENUE ADDRESS</label>
            <input
                name="venue_address"
                className="admin-form-input"
                defaultValue={event.venue_address ?? ''}
                disabled={!canManage || pending}
            />

            <SectionHeading>PARTNERS</SectionHeading>
            <TagListEditor
                initial={initialPartners}
                mode="plain"
                hiddenInputName="partners_json"
                placeholder="RWB Seattle"
                disabled={!canManage || pending}
            />

            <SectionHeading>HIGHLIGHTS</SectionHeading>
            <TagListEditor
                initial={initialHighlights}
                mode="label-object"
                hiddenInputName="highlights_json"
                placeholder="Live build: Porsche 997"
                disabled={!canManage || pending}
            />

            <SectionHeading>LINK</SectionHeading>
            <label className="admin-form-label">LINK URL (QR TARGET)</label>
            <input
                name="link_url"
                className="admin-form-input"
                defaultValue={event.link_url ?? ''}
                disabled={!canManage || pending}
                placeholder="https://…"
            />

            {canManage && (
                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn" disabled={pending}>
                        {savedFlash ? 'SAVED ✓' : 'SAVE CHANGES'}
                    </button>
                </div>
            )}
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
