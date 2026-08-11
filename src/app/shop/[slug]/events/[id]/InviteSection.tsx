'use client';
/**
 * INVITATIONS section on the shop event detail page.
 *
 * Template picker + LIVE srcdoc preview (rendered client-side by the exact same
 * template module the server sends, so WYSIWYG), recipient chips, optional
 * greeting name + personal note, and send. Results report per-recipient
 * sent/skipped/failed. Inline styles + admin-* classes to match the dashboard.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    INVITE_STYLES,
    renderInvitePreview,
    type InviteBranding,
    type InviteEvent,
    type InviteStyleKey,
} from '@/lib/event-invites';
import { sendEventInvites, type InviteSendResult } from './invite-actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
    eventId: string;
    shopId: number;
    branding: InviteBranding;
    event: InviteEvent;
    hostNames: string[];
    /** true when the acting shop is a co-host (not the host) — affects copy. */
    asCoHost?: boolean;
};

export function InviteSection({ eventId, shopId, branding, event, hostNames, asCoHost }: Props) {
    const router = useRouter();
    const [style, setStyle] = useState<InviteStyleKey>('hud');
    const [chips, setChips] = useState<string[]>([]);
    const [entry, setEntry] = useState('');
    const [invitedName, setInvitedName] = useState('');
    const [note, setNote] = useState('');
    const [pending, start] = useTransition();
    const [result, setResult] = useState<InviteSendResult | null>(null);

    const previewHtml = useMemo(
        () =>
            renderInvitePreview({
                style,
                branding,
                event,
                invitedName: invitedName || null,
                personalNote: note || null,
                hostNames,
                token: 'preview-token',
            }),
        [style, branding, event, invitedName, note, hostNames],
    );

    const commitEntry = (raw: string) => {
        const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length === 0) return;
        setChips((prev) => {
            const seen = new Set(prev.map((e) => e.toLowerCase()));
            const next = [...prev];
            for (const p of parts) {
                if (!seen.has(p.toLowerCase())) {
                    seen.add(p.toLowerCase());
                    next.push(p);
                }
            }
            return next;
        });
        setEntry('');
    };

    const onEntryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            e.preventDefault();
            commitEntry(entry);
        } else if (e.key === 'Backspace' && entry === '' && chips.length) {
            setChips((prev) => prev.slice(0, -1));
        }
    };

    const removeChip = (i: number) => setChips((prev) => prev.filter((_, idx) => idx !== i));

    const validCount = chips.filter((c) => EMAIL_RE.test(c)).length;
    const badCount = chips.length - validCount;

    const onSend = () => {
        const all = entry.trim() ? [...chips, entry.trim()] : chips;
        const recipients = all.join(', ');
        const fd = new FormData();
        fd.set('template_key', style);
        fd.set('recipients', recipients);
        fd.set('invited_name', invitedName);
        fd.set('personal_note', note);
        setResult(null);
        start(async () => {
            const res = await sendEventInvites(eventId, shopId, fd);
            setResult(res);
            if (res.ok && res.sent > 0) {
                setChips([]);
                setEntry('');
                router.refresh();
            }
        });
    };

    return (
        <div style={{ marginTop: 24 }}>
            <div className="admin-page-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        INVITATIONS
                    </div>
                    <div className="admin-page-sub">
                        {asCoHost ? 'CO-HOST · INVITE YOUR CUSTOMERS' : 'INVITE CUSTOMERS'} · SENT AS{' '}
                        {branding.fromName.toUpperCase()}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
                    gap: 18,
                    marginTop: 12,
                }}
                className="invite-grid"
            >
                {/* ── Controls ── */}
                <div>
                    <label style={lbl}>STYLE</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                        {INVITE_STYLES.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                className={`admin-action-btn ${style === s.key ? '' : 'muted'}`}
                                onClick={() => setStyle(s.key)}
                                title={s.blurb}
                            >
                                {s.name.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <label style={lbl}>RECIPIENTS</label>
                    <div style={chipBox}>
                        {chips.map((c, i) => {
                            const bad = !EMAIL_RE.test(c);
                            return (
                                <span key={`${c}-${i}`} style={bad ? chipBad : chip}>
                                    {c}
                                    <button type="button" onClick={() => removeChip(i)} style={chipX}>
                                        ×
                                    </button>
                                </span>
                            );
                        })}
                        <input
                            value={entry}
                            onChange={(e) => setEntry(e.target.value)}
                            onKeyDown={onEntryKey}
                            onBlur={() => commitEntry(entry)}
                            onPaste={(e) => {
                                const text = e.clipboardData.getData('text');
                                if (/[\s,;]/.test(text)) {
                                    e.preventDefault();
                                    commitEntry(text);
                                }
                            }}
                            placeholder={chips.length ? '' : 'paste or type emails, Enter to add'}
                            style={chipInput}
                        />
                    </div>
                    <div style={hint}>
                        {validCount} VALID{badCount ? ` · ${badCount} INVALID` : ''}
                    </div>

                    <label style={lbl}>GREETING NAME (OPTIONAL)</label>
                    <input
                        value={invitedName}
                        onChange={(e) => setInvitedName(e.target.value)}
                        placeholder="e.g. Kazuki (applied to all)"
                        style={field}
                    />

                    <label style={lbl}>PERSONAL NOTE (OPTIONAL)</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="A line from the host — shown in the invite."
                        style={{ ...field, resize: 'vertical' }}
                    />

                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending || validCount === 0}
                        onClick={onSend}
                        style={{ marginTop: 14 }}
                    >
                        {pending ? 'SENDING…' : `SEND ${validCount || ''} INVITE${validCount === 1 ? '' : 'S'}`}
                    </button>

                    {result && (
                        <div style={{ marginTop: 12 }}>
                            {!result.ok ? (
                                <div className="admin-pill warn">{result.error}</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <span className="admin-pill neon">{result.sent} SENT</span>
                                        {result.skipped > 0 && (
                                            <span className="admin-pill gold">{result.skipped} SKIPPED</span>
                                        )}
                                        {result.failed > 0 && (
                                            <span className="admin-pill warn">{result.failed} FAILED</span>
                                        )}
                                    </div>
                                    {(result.failed > 0 || result.skipped > 0) && (
                                        <ul style={resultList}>
                                            {result.results
                                                .filter((r) => r.status !== 'sent')
                                                .map((r, i) => (
                                                    <li key={i}>
                                                        {r.email} — {r.status}
                                                        {r.reason ? ` (${r.reason})` : ''}
                                                    </li>
                                                ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Live preview ── */}
                <div>
                    <label style={lbl}>LIVE PREVIEW</label>
                    <iframe
                        title="Invitation preview"
                        srcDoc={previewHtml}
                        style={{
                            width: '100%',
                            height: 620,
                            border: '1px solid var(--line, #1a1a28)',
                            background: '#fff',
                            borderRadius: 4,
                        }}
                    />
                </div>
            </div>
            <style>{`@media (max-width: 860px){ .invite-grid{ grid-template-columns: 1fr !important; } }`}</style>
        </div>
    );
}

const lbl: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-display, monospace)',
    fontSize: 10,
    letterSpacing: '2px',
    color: 'var(--text-dim, #8a8a9a)',
    marginBottom: 6,
};
const field: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    background: 'var(--bg-2, #0c0c14)',
    border: '1px solid var(--line, #1a1a28)',
    color: 'var(--text, #f0f0f0)',
    fontSize: 14,
    marginBottom: 14,
    borderRadius: 3,
    boxSizing: 'border-box',
};
const chipBox: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    minHeight: 44,
    background: 'var(--bg-2, #0c0c14)',
    border: '1px solid var(--line, #1a1a28)',
    borderRadius: 3,
    alignItems: 'center',
};
const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    background: 'var(--bg-hover, #1a1a28)',
    border: '1px solid var(--line, #2a2a3a)',
    borderRadius: 3,
    fontSize: 12,
    color: 'var(--text, #f0f0f0)',
};
const chipBad: React.CSSProperties = { ...chip, borderColor: '#c0392b', color: '#e88' };
const chipX: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    padding: 0,
};
const chipInput: React.CSSProperties = {
    flex: 1,
    minWidth: 160,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text, #f0f0f0)',
    fontSize: 14,
};
const hint: React.CSSProperties = {
    fontFamily: 'var(--font-display, monospace)',
    fontSize: 10,
    letterSpacing: '1px',
    color: 'var(--text-dim, #8a8a9a)',
    margin: '6px 0 14px',
};
const resultList: React.CSSProperties = {
    margin: '10px 0 0',
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--text-dim, #8a8a9a)',
    lineHeight: 1.6,
};
