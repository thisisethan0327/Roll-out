'use client';
/**
 * The slim bar at the top of a long form when a local draft was left
 * behind: "Unsaved draft from 5 min ago · Resume · Discard". Pair it with
 * `useDraft` / `useFormDraft` (src/lib/overlay/useDraft.ts). Renders nothing
 * when there is no draft. Ported from emwraps-tickets
 * `ui/DraftResumeBar.jsx` (7df9702).
 */
import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { Draft } from '@/lib/overlay/useDraft';

export function draftAge(ts: number, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(ts).toLocaleDateString();
}

export function DraftResumeBar({
    draft,
    onResume,
    onDiscard,
    label = 'draft',
}: {
    draft: Draft<unknown> | null;
    onResume: () => void;
    onDiscard: () => void;
    label?: string;
}) {
    // The age is client-only text (it depends on the clock).
    const [age, setAge] = useState('');
    useEffect(() => {
        if (draft) setAge(draftAge(draft.at));
    }, [draft]);
    if (!draft?.value) return null;
    return (
        <div className="g-draftbar" role="status">
            <History size={18} strokeWidth={2} aria-hidden="true" />
            <span>
                Unsaved {label} from {age}
            </span>
            <button type="button" className="g-draftbar-go" onClick={onResume}>
                Resume
            </button>
            <button type="button" className="g-draftbar-x" onClick={onDiscard}>
                Discard
            </button>
        </div>
    );
}
