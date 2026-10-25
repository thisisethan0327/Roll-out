'use client';
/**
 * "Add service": the button and its dialog. Glide: the primary pill opens a
 * card dialog over the scrim. Same addService action and the same form fields
 * as before.
 *
 * Closing follows the overlay rules (Documents/CLAUDE.md §12, overlay plan
 * Phase 0 #7): a scrim click never closes it; ×, Cancel and Escape ask
 * "Discard changes?" once anything has been typed; nothing closes it while
 * the save is in flight. The page behind does not scroll while it is open.
 * A failed save shows inside the dialog instead of an alert().
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { CircleAlert, Plus, X } from 'lucide-react';
import { addService } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import { confirmDialog } from '@/components/glide/confirm';
import { CardHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { ServiceFields } from '@/components/glide-shopbiz/ServiceFields';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

export function AddServiceForm({ shopId }: { shopId: number }) {
    const [open, setOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const dialogRef = useRef<HTMLDivElement>(null);
    // Read from the key handler, which is bound once per open.
    const live = useRef({ dirty, pending });
    live.current = { dirty, pending };
    const asking = useRef(false);

    const close = () => {
        setOpen(false);
        setDirty(false);
        setErr(null);
    };

    /** ×, Cancel and Escape: blocked while saving, a discard check when dirty. */
    const requestClose = async () => {
        if (live.current.pending || asking.current) return;
        if (live.current.dirty) {
            asking.current = true;
            try {
                const ok = await confirmDialog({
                    title: 'Discard changes?',
                    message: 'The service you started is not saved. What you entered here will be lost.',
                    confirmLabel: 'Discard',
                    cancelLabel: 'Keep editing',
                    danger: true,
                });
                if (!ok) return;
            } finally {
                asking.current = false;
            }
        }
        close();
    };
    const closeRef = useRef(requestClose);
    closeRef.current = requestClose;

    const onSubmit = (formData: FormData) => {
        setErr(null);
        start(async () => {
            try {
                await addService(shopId, formData);
                close();
            } catch (e: any) {
                setErr('Add failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    // Focus the first field, lock the page scroll, and route Escape through
    // requestClose. A confirm on top owns Escape itself (it stops the event).
    useEffect(() => {
        if (!open) return;
        dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            void closeRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    if (!open) {
        return (
            <GlideButton size="sm" onClick={() => setOpen(true)} icon={<Plus size={18} strokeWidth={2} />}>
                Add service
            </GlideButton>
        );
    }

    return (
        // No onClick on the scrim: a form overlay never closes on a stray tap.
        <div className={bz.dlgRoot}>
            <div ref={dialogRef} className={bz.dlg} role="dialog" aria-modal="true" aria-labelledby="add-svc-h">
                <CardHead
                    id="add-svc-h"
                    title="Add a service"
                    action={
                        <button
                            type="button"
                            className="g-cb g-cb--fill"
                            aria-label="Close"
                            onClick={() => void requestClose()}
                            disabled={pending}
                        >
                            <X size={20} strokeWidth={2} aria-hidden="true" />
                        </button>
                    }
                />
                <form
                    // onSubmit, not action=: React resets an action form after
                    // every submit, so a failed save used to wipe what was typed.
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (live.current.pending) return;
                        onSubmit(new FormData(e.currentTarget));
                    }}
                    className={cs.cardBody}
                    onInput={() => setDirty(true)}
                    onChange={() => setDirty(true)}
                >
                    <ServiceFields idp="add-svc" isNew />
                    {err ? (
                        <p className="g-note" role="alert" style={{ marginTop: 14 }}>
                            <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
                            {err}
                        </p>
                    ) : null}
                    <div className={cx(cs.actRow)} style={{ marginTop: 18, justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            className={cx(bz.act, bz.actInk)}
                            disabled={pending}
                            onClick={() => void requestClose()}
                        >
                            Cancel
                        </button>
                        <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending}>
                            {pending ? 'Saving…' : 'Create service'}
                        </GlideButton>
                    </div>
                </form>
            </div>
        </div>
    );
}
