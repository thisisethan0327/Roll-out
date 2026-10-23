'use client';
/**
 * Share strip for /event/[id] — copy link, native share (mobile), and X /
 * Facebook intents. Client-only because it touches navigator + clipboard.
 */
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

type Props = { url: string; title: string };

export function ShareBar({ url, title }: Props) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard blocked — fall back to native share if available.
            void nativeShare();
        }
    };

    const nativeShare = async () => {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
            try {
                await (navigator as any).share({ title, url });
            } catch {
                /* user cancelled */
            }
        }
    };

    const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
    const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

    return (
        <div className="g-panel-acts" role="group" aria-label="Share">
            <button type="button" onClick={copy} className="g-link">
                {copied ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <Link2 size={16} strokeWidth={2} aria-hidden="true" />}
                {copied ? 'Link copied' : 'Copy link'}
            </button>
            <a href={x} target="_blank" rel="noopener noreferrer" className="g-link">
                Share on X
            </a>
            <a href={fb} target="_blank" rel="noopener noreferrer" className="g-link">
                Share on Facebook
            </a>
        </div>
    );
}
