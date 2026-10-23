'use client';
/**
 * "Add service": the button and its dialog. Glide: the primary pill opens a
 * card dialog over the scrim; it closes by ×, Cancel, the scrim or Escape.
 * Same addService action and the same form fields as before.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { addService } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import { CardHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { ServiceFields } from '@/components/glide-shopbiz/ServiceFields';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

export function AddServiceForm({ shopId }: { shopId: number }) {
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();
    const dialogRef = useRef<HTMLDivElement>(null);

    const onSubmit = (formData: FormData) => {
        start(async () => {
            try {
                await addService(shopId, formData);
                setOpen(false);
            } catch (e: any) {
                alert('Add failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    // Focus the first field on open; Escape closes.
    useEffect(() => {
        if (!open) return;
        dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) {
        return (
            <GlideButton size="sm" onClick={() => setOpen(true)} icon={<Plus size={18} strokeWidth={2} />}>
                Add service
            </GlideButton>
        );
    }

    return (
        <div
            className={bz.dlgRoot}
            onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <div ref={dialogRef} className={bz.dlg} role="dialog" aria-modal="true" aria-labelledby="add-svc-h">
                <CardHead
                    id="add-svc-h"
                    title="Add a service"
                    action={
                        <button type="button" className="g-cb g-cb--fill" aria-label="Close" onClick={() => setOpen(false)}>
                            <X size={20} strokeWidth={2} aria-hidden="true" />
                        </button>
                    }
                />
                <form action={onSubmit} className={cs.cardBody}>
                    <ServiceFields idp="add-svc" isNew />
                    <div className={cx(cs.actRow)} style={{ marginTop: 18, justifyContent: 'flex-end' }}>
                        <button type="button" className={cx(bz.act, bz.actInk)} disabled={pending} onClick={() => setOpen(false)}>
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
