'use client';
/**
 * Local drafts for long forms (owner decision 2026-10-24: every long form
 * autosaves a local draft). Stored in localStorage as `rollout:draft:<key>`,
 * so a refresh, a session-expiry redirect or a mis-tap on the sidebar no
 * longer loses what was typed. Nothing leaves the device.
 *
 * Two shapes:
 *
 * 1. `useDraft(key, value)` for a form held in React state (ported from
 *    emwraps-tickets `hooks/useDraft.js`, 7df9702):
 *
 *        const { draft, dismissDraft, discardDraft } = useDraft('svc-new', form, { isEmpty });
 *        <DraftResumeBar draft={draft} onResume={() => { setForm(draft!.value); dismissDraft(); }} onDiscard={dismissDraft} />
 *        // after a successful save, or when the person discards the form: discardDraft()
 *
 * 2. `useFormDraft(formRef, key)` for Rollout's usual uncontrolled
 *    server-action form (`defaultValue` + FormData). It serialises the named
 *    fields on input / change and restores them into the inputs on Resume:
 *
 *        const formRef = useRef<HTMLFormElement>(null);
 *        const d = useFormDraft(formRef, `event-edit:${event.id}`);
 *        <DraftResumeBar draft={d.draft} onResume={d.resume} onDiscard={d.dismissDraft} />
 *        <form ref={formRef} …>
 *        // after the action succeeds: d.discardDraft()
 *
 *    Skipped: file, password and hidden inputs, unnamed fields, and anything
 *    inside `[data-no-draft]`. A form that is back to how it opened clears
 *    its draft instead of saving one.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type Draft<T> = { at: number; value: T };

const PREFIX = 'rollout:draft:';
const keyFor = (key: string) => PREFIX + key;

export function readDraft<T = unknown>(key: string | null | undefined): Draft<T> | null {
    if (!key) return null;
    try {
        const raw = localStorage.getItem(keyFor(key));
        if (!raw) return null;
        const d = JSON.parse(raw);
        return d && typeof d === 'object' && 'value' in d ? (d as Draft<T>) : null;
    } catch {
        return null;
    }
}

export function writeDraft(key: string | null | undefined, value: unknown) {
    if (!key) return;
    try {
        localStorage.setItem(keyFor(key), JSON.stringify({ at: Date.now(), value }));
    } catch {
        /* quota / private mode: drafts are a convenience */
    }
}

export function clearDraft(key: string | null | undefined) {
    if (!key) return;
    try {
        localStorage.removeItem(keyFor(key));
    } catch {
        /* ignore */
    }
}

export function useDraft<T>(
    key: string | null,
    value: T,
    { enabled = true, delay = 500, isEmpty }: { enabled?: boolean; delay?: number; isEmpty?: (v: T) => boolean } = {},
) {
    const [draft, setDraft] = useState<Draft<T> | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const stopped = useRef(false);
    // The value as the form opened: nothing is written until it changes (by
    // reference), which also survives StrictMode's double effects.
    const initial = useRef(value);

    // Read after mount (localStorage is client-only), and re-arm when the
    // form is (re)opened: enabled false → true.
    useEffect(() => {
        if (!enabled) return;
        stopped.current = false;
        initial.current = value;
        setDraft(readDraft<T>(key));
    }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!key || !enabled || stopped.current) return undefined;
        if (value === initial.current) return undefined;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (isEmpty && isEmpty(value)) clearDraft(key);
            else writeDraft(key, value);
        }, delay);
        return () => clearTimeout(timer.current);
    }, [key, enabled, value, delay]); // eslint-disable-line react-hooks/exhaustive-deps

    /** The resume bar was answered (Resume or Discard): forget the stored draft, keep saving. */
    const dismissDraft = useCallback(() => {
        setDraft(null);
        clearDraft(key);
    }, [key]);

    /** Saved or thrown away: clear storage and stop autosaving for the rest of this open. */
    const discardDraft = useCallback(() => {
        stopped.current = true;
        clearTimeout(timer.current);
        setDraft(null);
        clearDraft(key);
    }, [key]);

    return { draft, dismissDraft, discardDraft };
}

// ── Uncontrolled forms ─────────────────────────────────────────────────────

export type FormSnapshot = Record<string, string | string[]>;

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const SKIP_TYPES = new Set(['file', 'password', 'hidden', 'submit', 'button', 'reset', 'image']);

function draftable(form: HTMLFormElement): Field[] {
    return Array.from(form.elements).filter((el): el is Field => {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
        if (!el.name) return false;
        if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
        return !el.closest('[data-no-draft]');
    });
}

/** The named fields of a form as plain JSON. Checkbox groups and multi-selects become arrays. */
export function serializeForm(form: HTMLFormElement): FormSnapshot {
    const out: FormSnapshot = {};
    const push = (name: string, v: string) => {
        const cur = out[name];
        if (cur === undefined) out[name] = v;
        else out[name] = Array.isArray(cur) ? [...cur, v] : [cur, v];
    };
    for (const el of draftable(form)) {
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
            // Record every box (checked or not) so an unticked default restores too.
            if (!(el.name in out)) out[el.name] = [];
            if (el.checked) {
                const cur = out[el.name];
                out[el.name] = Array.isArray(cur) ? [...cur, el.value] : [cur, el.value];
            }
        } else if (el instanceof HTMLSelectElement && el.multiple) {
            out[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
        } else {
            push(el.name, el.value);
        }
    }
    return out;
}

// React tracks a controlled input's value through the native setter; going
// through it (plus an input event) updates controlled and uncontrolled fields alike.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
}

/** Put a snapshot back into the form's fields, firing input / change so React state follows. */
export function restoreForm(form: HTMLFormElement, snap: FormSnapshot) {
    const seen = new Map<string, number>();
    for (const el of draftable(form)) {
        if (!(el.name in snap)) continue;
        const v = snap[el.name];
        const list = Array.isArray(v) ? v : [v];
        let changed = false;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
            const want = list.includes(el.value);
            if (el.checked !== want) {
                el.checked = want;
                changed = true;
            }
        } else if (el instanceof HTMLSelectElement && el.multiple) {
            for (const o of Array.from(el.options)) o.selected = list.includes(o.value);
            changed = true;
        } else {
            // Repeated names (rows of the same field) restore in order.
            const i = seen.get(el.name) ?? 0;
            seen.set(el.name, i + 1);
            const next = list[i];
            if (next === undefined) continue;
            if (el instanceof HTMLSelectElement) el.value = next;
            else setNativeValue(el, next);
            changed = true;
        }
        if (changed) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

const same = (a: FormSnapshot, b: FormSnapshot) => JSON.stringify(a) === JSON.stringify(b);

export function useFormDraft(
    formRef: RefObject<HTMLFormElement | null>,
    key: string | null,
    { enabled = true, delay = 500 }: { enabled?: boolean; delay?: number } = {},
) {
    const [draft, setDraft] = useState<Draft<FormSnapshot> | null>(null);
    const stopped = useRef(false);
    const restoring = useRef(false);
    const initial = useRef<FormSnapshot | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        const form = formRef.current;
        if (!form || !key || !enabled) return undefined;
        stopped.current = false;
        initial.current = serializeForm(form);
        const stored = readDraft<FormSnapshot>(key);
        // A draft identical to the form as it opened is nothing to resume.
        setDraft(stored && !same(stored.value, initial.current) ? stored : null);

        const save = () => {
            if (stopped.current || restoring.current) return;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                if (stopped.current || !formRef.current) return;
                const snap = serializeForm(formRef.current);
                if (initial.current && same(snap, initial.current)) clearDraft(key);
                else writeDraft(key, snap);
            }, delay);
        };
        form.addEventListener('input', save);
        form.addEventListener('change', save);
        return () => {
            clearTimeout(timer.current);
            form.removeEventListener('input', save);
            form.removeEventListener('change', save);
        };
    }, [formRef, key, enabled, delay]);

    const dismissDraft = useCallback(() => {
        setDraft(null);
        clearDraft(key);
    }, [key]);

    /** Fill the form from the draft; autosave carries on from there. */
    const resume = useCallback(() => {
        const form = formRef.current;
        if (form && draft) {
            restoring.current = true;
            try {
                restoreForm(form, draft.value);
            } finally {
                restoring.current = false;
            }
            writeDraft(key, serializeForm(form));
        }
        setDraft(null);
    }, [formRef, draft, key]);

    const discardDraft = useCallback(() => {
        stopped.current = true;
        clearTimeout(timer.current);
        setDraft(null);
        clearDraft(key);
    }, [key]);

    return { draft, resume, dismissDraft, discardDraft };
}
