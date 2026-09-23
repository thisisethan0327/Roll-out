'use client';
/**
 * ／ ROUTE section of HostEventEditForm.tsx — host self-service route
 * planning, web parity with the mobile app's PLAN ROUTE screen
 * (mobile-route-plan/src/screens/PlanRouteScreen.tsx). Lets a host lay out
 * an ordered convoy route (destination + stops) against `events.route_plan`
 * (migration 20260921_076_event_route_plan.sql).
 *
 * Two separate write paths, both explained where they're called:
 *   - Destination (name/lat/lng) are plain <input name=…> children of the
 *     OUTER <form> in HostEventEditForm.tsx — they save with the rest of the
 *     event's details via the existing updateHostEvent action (event RLS
 *     already lets a host update their own row). Nothing in this file submits
 *     them directly.
 *   - The stop list saves through ONE `setEventRoutePlan` server action call
 *     (actions.ts) per "SAVE ROUTE" click, which in turn makes ONE call to
 *     the `rollout.set_event_route_plan` RPC on the user's own session (not
 *     service-role — see that action's doc comment). Every button in this
 *     component that must NOT submit the outer form is `type="button"`.
 *
 * Map picking mirrors the mobile screen's MapPinPicker: one persistent
 * click-to-pick map, a mode toggle deciding whether a click sets the
 * destination or drops a new stop's pin, and — for a new stop — a small
 * confirm panel (name/kind/eta/dwell/note) before it's added to the list.
 * Re-picking an EXISTING stop's coordinates isn't offered, matching the
 * mobile screen (StopEditorSheet edits name/eta/dwell/note only).
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import RoutePickerMapLoader from './RoutePickerMapLoader';
import RouteMapLoader from '@/app/event/[id]/RouteMapLoader';
import { buildRoutePoints, type RoutePlanStop } from '@/lib/route-plan';
import { setEventRoutePlan, type RoutePlanStopInput } from '../actions';

const KIND_OPTIONS: { value: string; label: string }[] = [
    { value: 'stop', label: 'STOP' },
    { value: 'fuel', label: 'FUEL' },
    { value: 'restroom', label: 'RESTROOM' },
    { value: 'food', label: 'FOOD' },
    { value: 'photo', label: 'PHOTO' },
    { value: 'regroup', label: 'REGROUP' },
];

type StopDraft = {
    tempId: string;
    kind: string;
    name: string;
    lat: number;
    lng: number;
    etaLocal: string;
    dwellMin: string;
    note: string;
};

function tempId(): string {
    // crypto.randomUUID is available in every browser this app targets
    // (same assumption event/[id]'s client actions make elsewhere).
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

function toDraft(s: RoutePlanStop): StopDraft {
    return {
        tempId: tempId(),
        kind: s.kind,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        etaLocal: s.etaLocal ?? '',
        dwellMin: s.dwellMin != null ? String(s.dwellMin) : '',
        note: s.note ?? '',
    };
}

type NewStopDraft = { lat: number; lng: number; kind: string; name: string; etaLocal: string; dwellMin: string; note: string };

export function RoutePlanEditor({
    eventId,
    startLat,
    startLng,
    startName,
    destinationName,
    destinationLat,
    destinationLng,
    onDestinationChange,
    initialStops,
    disabled = false,
}: {
    eventId: string;
    startLat: number | null;
    startLng: number | null;
    startName: string | null;
    /** Controlled by the parent form (HostEventEditForm) so these three
     * fields submit with the rest of DETAILS via updateHostEvent. */
    destinationName: string;
    destinationLat: number | null;
    destinationLng: number | null;
    onDestinationChange: (next: { name?: string; lat?: number | null; lng?: number | null }) => void;
    initialStops: RoutePlanStop[];
    disabled?: boolean;
}) {
    const router = useRouter();
    const [stops, setStops] = useState<StopDraft[]>(() => initialStops.map(toDraft));
    const [pickMode, setPickMode] = useState<'destination' | 'new-stop'>('new-stop');
    const [newStop, setNewStop] = useState<NewStopDraft | null>(null);

    const [saving, startSaving] = useTransition();
    const [saveError, setSaveError] = useState<string | null>(null);
    const [errorStopIndex, setErrorStopIndex] = useState<number | null>(null);
    const [savedFlash, setSavedFlash] = useState(false);
    const [dirty, setDirty] = useState(false);

    const handlePick = (lat: number, lng: number) => {
        if (pickMode === 'destination') {
            onDestinationChange({ lat, lng });
            return;
        }
        // new-stop: (re)position the pending confirm panel's pin — clicking
        // again before confirming just moves it, same as the mobile picker.
        setNewStop((prev) => (prev ? { ...prev, lat, lng } : { lat, lng, kind: 'stop', name: '', etaLocal: '', dwellMin: '', note: '' }));
    };

    const confirmNewStop = () => {
        if (!newStop) return;
        const name = newStop.name.trim();
        if (!name) return;
        setStops((prev) => [
            ...prev,
            {
                tempId: tempId(),
                kind: newStop.kind,
                name,
                lat: newStop.lat,
                lng: newStop.lng,
                etaLocal: newStop.etaLocal.trim(),
                dwellMin: newStop.dwellMin.trim(),
                note: newStop.note.trim(),
            },
        ]);
        setNewStop(null);
        setDirty(true);
    };

    const cancelNewStop = () => setNewStop(null);

    const updateStop = (idx: number, patch: Partial<StopDraft>) => {
        setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
        setDirty(true);
    };

    const removeStop = (idx: number) => {
        setStops((prev) => prev.filter((_, i) => i !== idx));
        setDirty(true);
    };

    const moveStop = (idx: number, dir: -1 | 1) => {
        setStops((prev) => {
            const target = idx + dir;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
        setDirty(true);
    };

    const previewPoints = useMemo(() => {
        const previewStops: RoutePlanStop[] = stops.map((s, i) => ({
            seq: i + 1,
            kind: s.kind,
            name: s.name || `Stop ${i + 1}`,
            lat: s.lat,
            lng: s.lng,
            etaLocal: s.etaLocal || null,
            dwellMin: s.dwellMin ? Number(s.dwellMin) : null,
            note: s.note || null,
        }));
        return buildRoutePoints({
            startLat,
            startLng,
            startName,
            stops: previewStops,
            destLat: destinationLat,
            destLng: destinationLng,
            destName: destinationName,
        });
    }, [stops, startLat, startLng, startName, destinationLat, destinationLng, destinationName]);

    // Straight lines through the points in travel order — the editor skips
    // the OSRM fetch RouteMap.tsx's caller (the public event page) does
    // server-side; this prop just needs >=2 [lat,lng] pairs in order.
    const previewPolyline = useMemo<[number, number][]>(
        () => previewPoints.map((p) => [p.lat, p.lng] as [number, number]),
        [previewPoints],
    );

    const onSaveRoute = () => {
        setSaveError(null);
        setErrorStopIndex(null);
        // No client-side shape validation — `setEventRoutePlan` (actions.ts)
        // sends this straight to the RPC, which is the single source of
        // truth for what a valid stop is; its 22023 message (parsed below)
        // is what drives the inline per-stop error, not a local guess.
        const payload: RoutePlanStopInput[] = stops.map((s) => ({
            kind: s.kind,
            name: s.name.trim(),
            lat: s.lat,
            lng: s.lng,
            etaLocal: s.etaLocal.trim() || null,
            dwellMin: s.dwellMin.trim() ? Number(s.dwellMin.trim()) : null,
            note: s.note.trim() || null,
        }));
        startSaving(async () => {
            const result = await setEventRoutePlan(eventId, payload);
            if (!result.ok) {
                setSaveError(result.error);
                const m = /^stop (\d+):/i.exec(result.error);
                if (m) setErrorStopIndex(Number(m[1]) - 1);
                return;
            }
            setSavedFlash(true);
            setDirty(false);
            setTimeout(() => setSavedFlash(false), 1500);
            router.refresh();
        });
    };

    const busy = disabled || saving;

    return (
        <div id="route" style={{ scrollMarginTop: 24 }}>
            <SectionHeading>／ ROUTE</SectionHeading>

            {/* DESTINATION */}
            <label className="admin-form-label">DESTINATION NAME</label>
            <input
                name="destination_name"
                className="admin-form-input"
                placeholder="e.g. Chuckanut Manor Seafood & Grill"
                maxLength={80}
                value={destinationName}
                onChange={(e) => onDestinationChange({ name: e.target.value })}
                disabled={busy}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end', marginTop: 8 }}>
                <div>
                    <label className="admin-form-label">DESTINATION LAT</label>
                    <input
                        type="number"
                        step="any"
                        name="destination_lat"
                        className="admin-form-input"
                        value={destinationLat ?? ''}
                        onChange={(e) => onDestinationChange({ lat: e.target.value === '' ? null : Number(e.target.value) })}
                        disabled={busy}
                    />
                </div>
                <div>
                    <label className="admin-form-label">DESTINATION LNG</label>
                    <input
                        type="number"
                        step="any"
                        name="destination_lng"
                        className="admin-form-input"
                        value={destinationLng ?? ''}
                        onChange={(e) => onDestinationChange({ lng: e.target.value === '' ? null : Number(e.target.value) })}
                        disabled={busy}
                    />
                </div>
                <button
                    type="button"
                    className={`admin-action-btn${pickMode === 'destination' ? ' active' : ''}`}
                    style={pickMode === 'destination' ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : undefined}
                    onClick={() => setPickMode('destination')}
                    disabled={busy}
                >
                    📍 PICK ON MAP
                </button>
            </div>

            {/* STOPS */}
            <SectionHeading>／ STOPS · {stops.length}</SectionHeading>

            {stops.length === 0 ? (
                <p className="text-dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
                    No stops yet — pick a spot on the map below and add one.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                    {stops.map((s, i) => (
                        <div
                            key={s.tempId}
                            data-testid="stop-row"
                            data-stop-index={i}
                            style={{
                                border: `1px solid ${errorStopIndex === i ? 'var(--warn)' : 'var(--line)'}`,
                                padding: 10,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                background: 'var(--bg-2)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 11,
                                        color: 'var(--gold)',
                                        minWidth: 20,
                                    }}
                                >
                                    {i + 1}
                                </span>
                                <input
                                    className="admin-form-input"
                                    style={{ flex: 1 }}
                                    placeholder="Stop name"
                                    maxLength={80}
                                    value={s.name}
                                    onChange={(e) => updateStop(i, { name: e.target.value })}
                                    disabled={busy}
                                />
                                <select
                                    className="admin-form-input"
                                    style={{ width: 130 }}
                                    value={s.kind}
                                    onChange={(e) => updateStop(i, { kind: e.target.value })}
                                    disabled={busy}
                                >
                                    {KIND_OPTIONS.map((k) => (
                                        <option key={k.value} value={k.value}>
                                            {k.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                                <input
                                    className="admin-form-input"
                                    placeholder='ETA, e.g. "11:55 AM"'
                                    value={s.etaLocal}
                                    onChange={(e) => updateStop(i, { etaLocal: e.target.value })}
                                    disabled={busy}
                                />
                                <input
                                    type="number"
                                    min={0}
                                    className="admin-form-input"
                                    placeholder="Dwell (min)"
                                    value={s.dwellMin}
                                    onChange={(e) => updateStop(i, { dwellMin: e.target.value.replace(/[^0-9]/g, '') })}
                                    disabled={busy}
                                />
                                <input
                                    className="admin-form-input"
                                    placeholder="Note (optional)"
                                    value={s.note}
                                    onChange={(e) => updateStop(i, { note: e.target.value })}
                                    disabled={busy}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button type="button" data-testid="stop-move-up" className="admin-action-btn muted" onClick={() => moveStop(i, -1)} disabled={busy || i === 0}>
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    data-testid="stop-move-down"
                                    className="admin-action-btn muted"
                                    onClick={() => moveStop(i, 1)}
                                    disabled={busy || i === stops.length - 1}
                                >
                                    ↓
                                </button>
                                <button type="button" data-testid="stop-remove" className="admin-action-btn danger" onClick={() => removeStop(i)} disabled={busy}>
                                    REMOVE
                                </button>
                            </div>
                            {errorStopIndex === i && saveError ? (
                                <div style={{ color: 'var(--warn)', fontSize: 11 }}>{saveError}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                    type="button"
                    className={`admin-action-btn${pickMode === 'new-stop' ? '' : ' muted'}`}
                    style={pickMode === 'new-stop' ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : undefined}
                    onClick={() => setPickMode('new-stop')}
                    disabled={busy}
                >
                    ＋ ADD STOP · CLICK MAP
                </button>
            </div>

            {/* PICKER MAP — always mounted; `pickMode` decides what a click sets. */}
            <div data-testid="route-picker-map" className="route-stage corner-wrap" style={{ marginBottom: newStop ? 8 : 16 }}>
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />
                <RoutePickerMapLoader
                    lat={pickMode === 'destination' ? destinationLat : newStop?.lat ?? null}
                    lng={pickMode === 'destination' ? destinationLng : newStop?.lng ?? null}
                    fallbackLat={startLat}
                    fallbackLng={startLng}
                    onPick={handlePick}
                    label={pickMode === 'destination' ? 'CLICK THE MAP TO SET THE DESTINATION' : 'CLICK THE MAP TO DROP A NEW STOP'}
                />
            </div>

            {newStop ? (
                <div data-testid="new-stop-panel" style={{ border: '1px solid var(--gold)', padding: 10, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--gold)' }}>
                        NEW STOP · {newStop.lat.toFixed(5)}, {newStop.lng.toFixed(5)}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            data-testid="new-stop-name"
                            className="admin-form-input"
                            style={{ flex: 1 }}
                            placeholder="Stop name"
                            maxLength={80}
                            autoFocus
                            value={newStop.name}
                            onChange={(e) => setNewStop({ ...newStop, name: e.target.value })}
                            disabled={busy}
                        />
                        <select
                            data-testid="new-stop-kind"
                            className="admin-form-input"
                            style={{ width: 130 }}
                            value={newStop.kind}
                            onChange={(e) => setNewStop({ ...newStop, kind: e.target.value })}
                            disabled={busy}
                        >
                            {KIND_OPTIONS.map((k) => (
                                <option key={k.value} value={k.value}>
                                    {k.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                        <input
                            data-testid="new-stop-eta"
                            className="admin-form-input"
                            placeholder='ETA, e.g. "11:55 AM"'
                            value={newStop.etaLocal}
                            onChange={(e) => setNewStop({ ...newStop, etaLocal: e.target.value })}
                            disabled={busy}
                        />
                        <input
                            type="number"
                            min={0}
                            className="admin-form-input"
                            placeholder="Dwell (min)"
                            value={newStop.dwellMin}
                            onChange={(e) => setNewStop({ ...newStop, dwellMin: e.target.value.replace(/[^0-9]/g, '') })}
                            disabled={busy}
                        />
                        <input
                            className="admin-form-input"
                            placeholder="Note (optional)"
                            value={newStop.note}
                            onChange={(e) => setNewStop({ ...newStop, note: e.target.value })}
                            disabled={busy}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" data-testid="new-stop-confirm" className="admin-form-btn" onClick={confirmNewStop} disabled={busy || !newStop.name.trim()}>
                            ADD STOP
                        </button>
                        <button type="button" className="admin-action-btn muted" onClick={cancelNewStop} disabled={busy}>
                            CANCEL
                        </button>
                    </div>
                </div>
            ) : null}

            {/* LIVE PREVIEW */}
            <SectionHeading>／ PREVIEW</SectionHeading>
            {previewPoints.length >= 1 ? (
                <div className="route-stage corner-wrap" style={{ marginBottom: 12 }}>
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <RouteMapLoader points={previewPoints} polyline={previewPolyline} />
                </div>
            ) : (
                <p className="text-dim" style={{ fontSize: 12 }}>
                    Set a start location (LOCATION section above) to preview the route.
                </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <button type="button" data-testid="save-route" className="admin-form-btn" onClick={onSaveRoute} disabled={busy}>
                    {savedFlash ? 'ROUTE SAVED ✓' : saving ? 'SAVING…' : 'SAVE ROUTE'}
                </button>
                {dirty && !saving && !savedFlash ? (
                    <span className="text-dim" style={{ fontSize: 11 }}>
                        Unsaved stop changes
                    </span>
                ) : null}
                {saveError && errorStopIndex === null ? <span style={{ color: 'var(--warn)', fontSize: 12 }}>{saveError}</span> : null}
            </div>
            <p className="text-dim" style={{ fontSize: 11, marginTop: 6 }}>
                Saving the route only writes the stop list above — destination and other event details save with the
                main SAVE CHANGES button.
            </p>
        </div>
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
