'use client';
/**
 * Glide message composer (board G6, chat): a rounded field with a round send
 * button, a hint line under it and an error line above it. The hint says who
 * sees the message; the Ctrl/Cmd + Enter shortcut lives in the Send button's
 * tooltip, so callers never repeat it. Presentational:
 * the caller owns the text, the send action and the pending state, so every
 * composer keeps its own server action exactly as before.
 */
import { useId, type RefObject } from 'react';
import { CircleAlert, Lock, Send } from 'lucide-react';
import s from './composer.module.css';

export function ComposerLocked({ children }: { children: React.ReactNode }) {
    return (
        <div className={s.locked} role="note">
            <Lock size={18} strokeWidth={2} aria-hidden="true" />
            <span>{children}</span>
        </div>
    );
}

export function Composer({
    value,
    onChange,
    onSubmit,
    pending,
    error,
    hint,
    placeholder,
    label,
    textareaRef,
    sendLabel = 'Send',
    extra,
}: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    pending: boolean;
    error?: string | null;
    hint?: React.ReactNode;
    placeholder: string;
    label: string;
    textareaRef?: RefObject<HTMLTextAreaElement | null>;
    sendLabel?: string;
    /** Controls that sit left of the send button (attach photo, visibility). */
    extra?: React.ReactNode;
}) {
    const empty = !value.trim();
    const id = useId();
    return (
        <div className={s.wrap}>
            {error ? (
                <p className={s.err} role="alert">
                    <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
                    {error}
                </p>
            ) : null}
            <div className={s.box}>
                <label className="g-sr" htmlFor={id}>
                    {label}
                </label>
                <textarea
                    id={id}
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        // Cmd/Ctrl+Enter to send; plain Enter inserts a newline.
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    placeholder={placeholder}
                    disabled={pending}
                    rows={2}
                    className={s.ta}
                />
                <div className={s.acts}>
                    {extra}
                    <button
                        type="button"
                        className={s.send}
                        onClick={onSubmit}
                        disabled={pending || empty}
                        aria-label={pending ? 'Sending' : sendLabel}
                        title={`${sendLabel} (Ctrl or Cmd + Enter)`}
                    >
                        <Send size={19} strokeWidth={2} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {hint ? <p className={s.hint}>{hint}</p> : null}
        </div>
    );
}
