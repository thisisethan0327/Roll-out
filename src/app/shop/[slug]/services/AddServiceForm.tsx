'use client';
/**
 * "Add service": the button and its dialog, on the Glide kit Modal (overlay
 * plan Phase 1). Same addService action and the same form fields as before.
 *
 * Closing follows the overlay rules (Documents/CLAUDE.md §12): a scrim click
 * never closes it; ×, Cancel and Escape ask "Discard changes?" once anything
 * has been typed; nothing closes it while the save is in flight. Escape and
 * the page scroll lock go through the shared overlay stack. A failed save
 * shows inside the dialog instead of an alert(). Kept a Modal (6 fields), not
 * a Drawer: overlay plan decision 4.
 */
import { useState, useTransition } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import { addService } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import { Modal } from '@/components/glide/Modal';
import { useRequestClose } from '@/lib/overlay/stack';
import cs from '@/components/glide-console/console.module.css';
import { ServiceFields } from '@/components/glide-shopbiz/ServiceFields';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

export function AddServiceForm({ shopId }: { shopId: number }) {
    const [open, setOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pending, start] = useTransition();

    const close = () => {
        setOpen(false);
        setDirty(false);
        setErr(null);
    };

    const DISCARD = 'The service you started is not saved. What you entered here will be lost.';
    // Cancel asks the same "Discard changes?" as ×, Escape and the Modal.
    const requestClose = useRequestClose({ onClose: close, dirty, closable: !pending, discardMessage: DISCARD });

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

    return (
        <>
            <GlideButton size="sm" onClick={() => setOpen(true)} icon={<Plus size={18} strokeWidth={2} />} aria-haspopup="dialog">
                Add service
            </GlideButton>
            <Modal
                open={open}
                onClose={close}
                title="Add a service"
                titleId="add-svc-h"
                size="lg"
                dirty={dirty}
                closable={!pending}
                discardMessage={DISCARD}
                initialFocus='input[name="name"]'
            >
                <form
                    id="add-svc-form"
                    // onSubmit, not action=: React resets an action form after
                    // every submit, so a failed save used to wipe what was typed.
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (pending) return;
                        onSubmit(new FormData(e.currentTarget));
                    }}
                    className={cs.form}
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
                        <button type="button" className={cx(bz.act, bz.actInk)} disabled={pending} onClick={() => void requestClose()}>
                            Cancel
                        </button>
                        <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending}>
                            {pending ? 'Saving…' : 'Create service'}
                        </GlideButton>
                    </div>
                </form>
            </Modal>
        </>
    );
}
