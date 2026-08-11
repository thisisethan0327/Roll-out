'use client';
/**
 * COVER picker for the event create/edit forms.
 *
 * - `create` mode also owns the TYPE radio group (name="type") so the two
 *   default tiles auto-swap when the host changes the event type.
 * - `edit` mode takes a fixed `initialType` (type is immutable after creation)
 *   and just shows the cover chooser.
 *
 * Selection is written to a hidden `hero_image_url` input:
 *   - AUTO (default)  → empty string → server stores NULL → event falls back to
 *     `defaultCoverFor(type, id)` at render time (re-brands follow automatically).
 *   - a default tile / custom URL → that exact URL is pinned into the row.
 */
import { useMemo, useState } from 'react';
import {
    DEFAULT_EVENT_COVERS,
    EVENT_COVER_TYPES,
    EVENT_COVER_TYPE_LABELS,
    defaultsForType,
    isEventCoverType,
    type EventCoverType,
} from '@/lib/event-covers';

const TYPE_OPTIONS: { value: EventCoverType; label: string }[] = EVENT_COVER_TYPES.map((v) => ({
    value: v,
    label: EVENT_COVER_TYPE_LABELS[v].toUpperCase(),
}));

const ALL_URLS = new Set(
    EVENT_COVER_TYPES.flatMap((t) => DEFAULT_EVENT_COVERS[t]),
);

export function EventCoverPicker({
    mode,
    initialType,
    initialUrl,
    disabled = false,
}: {
    mode: 'create' | 'edit';
    initialType?: string | null;
    initialUrl?: string | null;
    disabled?: boolean;
}) {
    const startType: EventCoverType = isEventCoverType(initialType) ? initialType : 'NIGHT_RUN';
    const [type, setType] = useState<EventCoverType>(startType);

    const pinned = (initialUrl ?? '').trim();
    // A pinned URL that isn't one of the 10 defaults is a custom URL.
    const [selected, setSelected] = useState<string>(pinned);
    const [customUrl, setCustomUrl] = useState<string>(pinned && !ALL_URLS.has(pinned) ? pinned : '');
    const [showAll, setShowAll] = useState<boolean>(false);

    const defaults = useMemo(() => defaultsForType(type), [type]);
    const isAuto = selected.trim().length === 0;
    const isCustom = !isAuto && !ALL_URLS.has(selected);

    return (
        <div>
            {mode === 'create' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {TYPE_OPTIONS.map((t, i) => (
                        <label
                            key={t.value}
                            className="admin-form-label"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer' }}
                        >
                            <input
                                type="radio"
                                name="type"
                                value={t.value}
                                defaultChecked={i === 0}
                                required
                                disabled={disabled}
                                onChange={() => setType(t.value)}
                            />
                            {t.label}
                        </label>
                    ))}
                </div>
            ) : (
                <div className="admin-form-label" style={{ marginBottom: 10, opacity: 0.7 }}>
                    TYPE · {EVENT_COVER_TYPE_LABELS[type].toUpperCase()} (LOCKED)
                </div>
            )}

            {/* Hidden field the server action reads */}
            <input type="hidden" name="hero_image_url" value={isAuto ? '' : selected} />

            <label className="admin-form-label">
                COVER · {EVENT_COVER_TYPE_LABELS[type].toUpperCase()} DEFAULTS
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
                <Tile
                    label="AUTO"
                    sublabel="follows type"
                    active={isAuto}
                    disabled={disabled}
                    onClick={() => setSelected('')}
                />
                {defaults.map((url, i) => (
                    <Tile
                        key={url}
                        url={url}
                        label={`${EVENT_COVER_TYPE_LABELS[type].toUpperCase()} ${i + 1}`}
                        active={selected === url}
                        disabled={disabled}
                        onClick={() => setSelected(url)}
                    />
                ))}
            </div>

            <button
                type="button"
                className="admin-action-btn muted"
                disabled={disabled}
                onClick={() => setShowAll((s) => !s)}
                style={{ marginBottom: showAll ? 12 : 0 }}
            >
                {showAll ? '▾ HIDE ALL COVERS' : '▸ ALL COVERS'}
            </button>

            {showAll ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
                    {EVENT_COVER_TYPES.map((t) =>
                        DEFAULT_EVENT_COVERS[t].map((url, i) => (
                            <Tile
                                key={url}
                                url={url}
                                label={`${EVENT_COVER_TYPE_LABELS[t].toUpperCase()} ${i + 1}`}
                                active={selected === url}
                                disabled={disabled}
                                onClick={() => setSelected(url)}
                            />
                        )),
                    )}
                </div>
            ) : null}

            <label className="admin-form-label" style={{ marginTop: 8 }}>
                CUSTOM COVER URL (OPTIONAL)
            </label>
            <input
                type="url"
                className="admin-form-input"
                placeholder="https://…"
                value={customUrl}
                disabled={disabled}
                onChange={(e) => {
                    const v = e.target.value;
                    setCustomUrl(v);
                    if (v.trim().length > 0) setSelected(v.trim());
                    else if (isCustom) setSelected('');
                }}
            />
            <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Leave on AUTO to inherit the type default — future re-brands then apply automatically.
            </div>
        </div>
    );
}

function Tile({
    url,
    label,
    sublabel,
    active,
    disabled,
    onClick,
}: {
    url?: string;
    label: string;
    sublabel?: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            style={{
                position: 'relative',
                padding: 0,
                border: active ? '2px solid var(--gold)' : '1px solid var(--line)',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: url
                    ? `url(${url}) center/cover no-repeat`
                    : 'repeating-linear-gradient(135deg, var(--bg-3) 0 8px, var(--bg-2) 8px 16px)',
                aspectRatio: '16 / 9',
                width: '100%',
                display: 'block',
                opacity: disabled ? 0.6 : 1,
            }}
        >
            <span
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '4px 6px',
                    background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.8))',
                    color: active ? 'var(--gold)' : '#fff',
                    fontFamily: 'var(--font-display)',
                    fontSize: 9,
                    letterSpacing: 1,
                    textAlign: 'left',
                    lineHeight: 1.3,
                }}
            >
                {active ? '✓ ' : ''}
                {label}
                {sublabel ? <span style={{ display: 'block', opacity: 0.75, fontSize: 8 }}>{sublabel}</span> : null}
            </span>
        </button>
    );
}
