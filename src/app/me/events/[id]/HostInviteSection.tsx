'use client';
/**
 * Invitations section for a HOST's own event. Same UX as the shop InviteSection
 * (style picker + live WYSIWYG preview + recipient chips) but dispatches through
 * sendHostInvites → send-platform-notification with a neutral Rollout branding
 * object. No opt-out/co-host machinery (host events have no shop).
 *
 * Glide: a section card with the style chips, the recipient field and the live
 * preview beside it.
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
import { sendHostInvites, type HostInviteResult } from '../actions';
import { CircleAlert, CircleCheck, CircleX, LoaderCircle, Send, X } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { FormSection } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import r from './host-event.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HostInviteSection({
    eventId,
    branding,
    event,
    hostName,
}: {
    eventId: string;
    branding: InviteBranding;
    event: InviteEvent;
    hostName: string;
}) {
    const router = useRouter();
    const [style, setStyle] = useState<InviteStyleKey>('hud');
    const [chips, setChips] = useState<string[]>([]);
    const [entry, setEntry] = useState('');
    const [invitedName, setInvitedName] = useState('');
    const [note, setNote] = useState('');
    const [pending, start] = useTransition();
    const [result, setResult] = useState<HostInviteResult | null>(null);

    const previewHtml = useMemo(
        () =>
            renderInvitePreview({
                style,
                branding,
                event,
                invitedName: invitedName || null,
                personalNote: note || null,
                hostNames: [hostName],
                token: 'preview-token',
            }),
        [style, branding, event, invitedName, note, hostName],
    );

    const commitEntry = (raw: string) => {
        const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length === 0) return;
        setChips((prev) => {
            const seen = new Set(prev.map((e) => e.toLowerCase()));
            const next = [...prev];
            for (const p of parts) {
                if (!seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); next.push(p); }
            }
            return next;
        });
        setEntry('');
    };

    const onEntryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); commitEntry(entry); }
        else if (e.key === 'Backspace' && entry === '' && chips.length) setChips((prev) => prev.slice(0, -1));
    };

    const removeChip = (i: number) => setChips((prev) => prev.filter((_, idx) => idx !== i));
    const validCount = chips.filter((c) => EMAIL_RE.test(c)).length;
    const badCount = chips.length - validCount;

    const onSend = () => {
        const all = entry.trim() ? [...chips, entry.trim()] : chips;
        const fd = new FormData();
        fd.set('template_key', style);
        fd.set('recipients', all.join(', '));
        fd.set('invited_name', invitedName);
        fd.set('personal_note', note);
        setResult(null);
        start(async () => {
            const res = await sendHostInvites(eventId, fd);
            setResult(res);
            if (res.ok && res.sent > 0) { setChips([]); setEntry(''); router.refresh(); }
        });
    };

    return (
        <FormSection
            id="invitations"
            title="Invitations"
            sub={`Invite people by email. Sent as ${hostName} via Rollout.`}
        >
            <div className={r.inv}>
                <div className={s.form}>
                    <div className={s.field}>
                        <span className={s.label} id="inv-style">
                            Style
                        </span>
                        <div className={r.styles} role="group" aria-labelledby="inv-style">
                            {INVITE_STYLES.map((st) => (
                                <button key={st.key} type="button" className="g-sec" aria-pressed={style === st.key} onClick={() => setStyle(st.key)} title={st.blurb}>
                                    {st.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={s.field}>
                        <label className={s.label} htmlFor="inv-to">
                            Recipients
                        </label>
                        <div className={r.chipBox}>
                            {chips.map((c, i) => {
                                const bad = !EMAIL_RE.test(c);
                                return (
                                    <span key={`${c}-${i}`} className={`${r.mail}${bad ? ` ${r.mailBad}` : ''}`}>
                                        {bad ? <CircleAlert size={14} strokeWidth={2} aria-label="Not a valid email" /> : null}
                                        {c}
                                        <button type="button" onClick={() => removeChip(i)} aria-label={`Remove ${c}`}>
                                            <X size={15} strokeWidth={2} aria-hidden="true" />
                                        </button>
                                    </span>
                                );
                            })}
                            <input
                                id="inv-to"
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
                                placeholder={chips.length ? '' : 'Paste or type emails, Enter to add'}
                            />
                        </div>
                        <p className={s.hint} aria-live="polite">
                            <span className="g-w" style={{ fontSize: 10.5 }}>
                                {validCount}
                            </span>{' '}
                            valid
                            {badCount ? (
                                <>
                                    {' · '}
                                    <span className="g-w" style={{ fontSize: 10.5 }}>
                                        {badCount}
                                    </span>{' '}
                                    not valid
                                </>
                            ) : null}
                        </p>
                    </div>

                    <div className={s.field}>
                        <label className={s.label} htmlFor="inv-name">
                            Greeting name <span style={{ fontWeight: 500 }}>(optional)</span>
                        </label>
                        <input id="inv-name" className={s.input} value={invitedName} onChange={(e) => setInvitedName(e.target.value)} placeholder="e.g. Kazuki (applied to all)" />
                    </div>

                    <div className={s.field}>
                        <label className={s.label} htmlFor="inv-note">
                            Personal note <span style={{ fontWeight: 500 }}>(optional)</span>
                        </label>
                        <textarea id="inv-note" className={s.input} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A line from you — shown in the invite." />
                    </div>

                    <div>
                        <GlideButton
                            size="sm"
                            disabled={pending || validCount === 0}
                            aria-busy={pending}
                            onClick={onSend}
                            icon={pending ? <LoaderCircle size={18} strokeWidth={2} className="g-spin" /> : <Send size={18} strokeWidth={2} />}
                        >
                            {pending ? 'Sending…' : `Send ${validCount || ''} invite${validCount === 1 ? '' : 's'}`}
                        </GlideButton>
                    </div>

                    {result && (
                        <div role="status">
                            {!result.ok ? (
                                <p className="g-note">
                                    <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
                                    {result.error}
                                </p>
                            ) : (
                                <>
                                    <div className="g-chips">
                                        <span className="g-chip g-chip--tint">
                                            <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
                                            <span className="g-w">{result.sent}</span> sent
                                        </span>
                                        {result.failed > 0 && (
                                            <span className="g-chip">
                                                <CircleX size={14} strokeWidth={2} aria-hidden="true" />
                                                <span className="g-w">{result.failed}</span> failed
                                            </span>
                                        )}
                                    </div>
                                    {result.failed > 0 && (
                                        <ul className={s.small} style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                                            {result.results
                                                .filter((x) => x.status !== 'sent')
                                                .map((x, i) => (
                                                    <li key={i}>
                                                        {x.email} — {x.status}
                                                        {x.reason ? ` (${x.reason})` : ''}
                                                    </li>
                                                ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className={s.field}>
                    <span className={s.label}>Live preview</span>
                    <iframe title="Invitation preview" srcDoc={previewHtml} className={r.preview} />
                </div>
            </div>
        </FormSection>
    );
}
