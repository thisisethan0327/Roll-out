'use client';
/**
 * Client half of /me/events/new. createHostEvent redirects on success and
 * returns { ok: false, error } on failure (see actions.ts) — useActionState
 * gives us that failure back as render state instead of a thrown, redacted
 * Error message.
 *
 * Glide (board: G3 create event): the same fields, grouped into section cards
 * with a sticky save bar. Every input keeps its name, so the form posts exactly
 * what it did before. The cover picker is the shared shop-console component,
 * restyled by the console scope.
 */
import Link from 'next/link';
import { useActionState } from 'react';
import { CircleAlert, Globe, LoaderCircle, Lock, Plus, Users } from 'lucide-react';
import { createHostEvent } from '../actions';
import { EventCoverPicker } from '@/app/shop/[slug]/events/EventCoverPicker';
import { EventStartAtField } from '@/components/EventStartAtField';
import { GlideButton } from '@/components/glide/primitives';
import { InfoTip } from '@/components/glide/InfoTip';
import { AREA_LABEL_TIP } from '@/lib/event-area-label';
import { FormSection } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';

const VISIBILITY: { value: string; label: string; icon: React.ReactNode }[] = [
    { value: 'public', label: 'Public', icon: <Globe size={16} strokeWidth={2} aria-hidden="true" /> },
    { value: 'followers', label: 'Followers', icon: <Users size={16} strokeWidth={2} aria-hidden="true" /> },
    { value: 'private', label: 'Private', icon: <Lock size={16} strokeWidth={2} aria-hidden="true" /> },
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
        <form action={formAction} className={s.col} aria-busy={pending}>
            {state && !state.ok ? (
                <p className="g-note" role="alert">
                    <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
                    {state.error}
                </p>
            ) : null}

            <FormSection id="type" title="Type & cover">
                <EventCoverPicker mode="create" />
            </FormSection>

            <FormSection id="details" title="Details">
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-title">
                        Title
                    </label>
                    <input id="ne-title" name="title" className={s.input} minLength={4} required placeholder="Sunday Canyon Run" disabled={pending} />
                </div>
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-desc">
                        Description
                    </label>
                    <textarea id="ne-desc" name="description" className={s.input} rows={4} maxLength={400} placeholder="What's the vibe? Who should come? (max 400 chars)" disabled={pending} />
                </div>
            </FormSection>

            <FormSection id="location" title="Location">
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-loc">
                        Location name
                    </label>
                    <input id="ne-loc" name="location_name" className={s.input} placeholder="Cars & Coffee Lot" required minLength={2} disabled={pending} />
                </div>
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-locd">
                        Location detail
                    </label>
                    <input id="ne-locd" name="location_detail" className={s.input} placeholder="North lot by the coffee stand" disabled={pending} />
                </div>
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-area">
                        General area <InfoTip text={AREA_LABEL_TIP} label="About General area" />
                    </label>
                    <input id="ne-area" name="area_label" className={s.input} maxLength={60} placeholder="e.g. Edmonds, WA" disabled={pending} />
                </div>
                <div className={s.grid2f}>
                    <div className={s.field}>
                        <label className={s.label} htmlFor="ne-lat">
                            Latitude
                        </label>
                        <input id="ne-lat" type="number" step="any" name="lat" className={s.input} placeholder="47.6062" disabled={pending} />
                    </div>
                    <div className={s.field}>
                        <label className={s.label} htmlFor="ne-lng">
                            Longitude
                        </label>
                        <input id="ne-lng" type="number" step="any" name="lng" className={s.input} placeholder="-122.3321" disabled={pending} />
                    </div>
                </div>
                <p className={s.hint}>Add lat/lng to pin your meet on the Meets map. Look them up on Google Maps (right-click → coordinates).</p>
            </FormSection>

            <FormSection id="route" title="Route destination">
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-dest">
                        Destination name
                    </label>
                    <input id="ne-dest" name="destination_name" className={s.input} maxLength={80} placeholder="e.g. Chuckanut Manor Seafood & Grill" disabled={pending} />
                </div>
                <div className={s.grid2f}>
                    <div className={s.field}>
                        <label className={s.label} htmlFor="ne-dlat">
                            Destination latitude
                        </label>
                        <input id="ne-dlat" type="number" step="any" name="destination_lat" className={s.input} placeholder="47.7300" disabled={pending} />
                    </div>
                    <div className={s.field}>
                        <label className={s.label} htmlFor="ne-dlng">
                            Destination longitude
                        </label>
                        <input id="ne-dlng" type="number" step="any" name="destination_lng" className={s.input} placeholder="-122.4800" disabled={pending} />
                    </div>
                </div>
            </FormSection>

            <FormSection id="when" title="When & capacity">
                <div className={s.grid2f}>
                    <label className={s.field}>
                        <span className={s.label}>Start</span>
                        <EventStartAtField disabled={pending} className={s.input} />
                    </label>
                    <div className={s.field}>
                        <label className={s.label} htmlFor="ne-cap">
                            Capacity
                        </label>
                        <input id="ne-cap" type="number" min={1} name="capacity" className={s.input} placeholder="30" disabled={pending} />
                    </div>
                </div>
            </FormSection>

            <FormSection id="visibility" title="Visibility & tags">
                <fieldset className={s.radioSeg}>
                    <legend>Who can see it</legend>
                    {VISIBILITY.map((v) => (
                        <label key={v.value}>
                            <input type="radio" name="visibility" value={v.value} defaultChecked={v.value === 'public'} required disabled={pending} />
                            {v.icon}
                            {v.label}
                        </label>
                    ))}
                </fieldset>
                <div className={s.field}>
                    <label className={s.label} htmlFor="ne-tags">
                        Tags, comma-separated
                    </label>
                    <input id="ne-tags" name="tags" className={s.input} placeholder="jdm, canyon, sunday" disabled={pending} />
                </div>
            </FormSection>

            <div className={`g-fp ${s.saveBar}`}>
                <GlideButton
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    icon={pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <Plus size={20} strokeWidth={2} />}
                >
                    {pending ? 'Hosting…' : 'Host event'}
                </GlideButton>
                <Link href="/me/events" className="g-sec g-sec--ink">
                    Cancel
                </Link>
            </div>
        </form>
    );
}
