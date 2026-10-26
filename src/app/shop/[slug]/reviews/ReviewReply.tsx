'use client';
import { useState, useTransition } from 'react';
import { replyToReview } from './actions';
import { Pencil, Reply, Store, Trash2 } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import cs from '@/components/glide-console/console.module.css';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { toast } from '@/components/glide/Toast';

export type ReviewReplyData = {
    id: string;
    shopId: number;
    ownerReply: string | null;
};

export function ReviewReply({ id, shopId, ownerReply }: ReviewReplyData) {
    const [editing, setEditing] = useState(false);
    const [pending, start] = useTransition();

    const onSubmit = (formData: FormData) => {
        start(async () => {
            try {
                await replyToReview(id, shopId, formData);
                setEditing(false);
            } catch (e: any) {
                toast.error('Reply failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

    if (ownerReply && !editing) {
        return (
            <div className={bz.reply}>
                <h3>
                    <Store {...ic} />
                    Shop reply
                </h3>
                <p>{ownerReply}</p>
                <button className={bz.act} type="button" onClick={() => setEditing(true)}>
                    <Pencil {...ic} />
                    Edit reply
                </button>
            </div>
        );
    }

    if (!editing) {
        return (
            <div style={{ marginTop: 14 }}>
                <button className={bz.act} type="button" onClick={() => setEditing(true)}>
                    <Reply {...ic} />
                    Reply
                </button>
            </div>
        );
    }

    return (
        <form action={onSubmit} className={cx(cs.form, bz.reply)}>
            <div className={cs.field}>
                <label className={cs.label} htmlFor={`reply-${id}`}>
                    Public reply
                </label>
                <textarea
                    id={`reply-${id}`}
                    name="reply"
                    className={cx(cs.input, bz.in)}
                    defaultValue={ownerReply ?? ''}
                    placeholder="Write a public reply…"
                    rows={3}
                />
            </div>
            <div className={cs.actRow}>
                <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending}>
                    {pending ? 'Saving…' : 'Post reply'}
                </GlideButton>
                <button className={cx(bz.act, bz.actInk)} type="button" onClick={() => setEditing(false)} disabled={pending}>
                    Cancel
                </button>
                {ownerReply ? (
                    <button
                        className={cx(bz.act, bz.actInk, bz.actDanger)}
                        type="button"
                        onClick={() => {
                            const fd = new FormData();
                            fd.set('reply', '');
                            onSubmit(fd);
                        }}
                        disabled={pending}
                    >
                        <Trash2 {...ic} />
                        Remove
                    </button>
                ) : null}
            </div>
        </form>
    );
}
