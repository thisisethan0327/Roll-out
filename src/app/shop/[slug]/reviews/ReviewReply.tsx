'use client';
import { useState, useTransition } from 'react';
import { replyToReview } from './actions';

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
                alert('Reply failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (ownerReply && !editing) {
        return (
            <div style={{ marginTop: 12, marginLeft: 12, paddingLeft: 14, borderLeft: '2px solid var(--line-mid)' }}>
                <div className="admin-form-label" style={{ marginBottom: 4 }}>SHOP REPLY</div>
                <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5, margin: '0 0 8px' }}>{ownerReply}</p>
                <button className="admin-action-btn muted" type="button" onClick={() => setEditing(true)}>
                    EDIT REPLY
                </button>
            </div>
        );
    }

    if (!editing) {
        return (
            <div style={{ marginTop: 12 }}>
                <button className="admin-action-btn" type="button" onClick={() => setEditing(true)}>
                    REPLY
                </button>
            </div>
        );
    }

    return (
        <form action={onSubmit} className="admin-form" style={{ marginTop: 12 }}>
            <textarea
                name="reply"
                className="admin-form-input"
                defaultValue={ownerReply ?? ''}
                placeholder="Write a public reply…"
                rows={3}
                style={{ resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="admin-form-btn" type="submit" disabled={pending}>
                    {pending ? 'SAVING…' : 'POST REPLY'}
                </button>
                <button
                    className="admin-action-btn muted"
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={pending}
                >
                    CANCEL
                </button>
                {ownerReply ? (
                    <button
                        className="admin-action-btn danger"
                        type="button"
                        onClick={() => {
                            const fd = new FormData();
                            fd.set('reply', '');
                            onSubmit(fd);
                        }}
                        disabled={pending}
                    >
                        REMOVE
                    </button>
                ) : null}
            </div>
        </form>
    );
}
