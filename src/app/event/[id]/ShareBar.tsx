'use client';
/**
 * Share strip for /event/[id] — copy link, native share (mobile), and X /
 * Facebook intents. Client-only because it touches navigator + clipboard.
 */
import { useState } from 'react';

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

    const linkStyle: React.CSSProperties = {
        fontSize: 12,
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--track-wider)',
        textDecoration: 'none',
        borderBottom: '1px solid var(--line-mid)',
        paddingBottom: 2,
        cursor: 'pointer',
        color: 'var(--text-2)',
        background: 'none',
        border: 'none',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--line-mid)',
    };

    return (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
            <button type="button" onClick={copy} className="text-link" style={linkStyle}>
                {copied ? '✓ LINK COPIED' : 'COPY LINK'}
            </button>
            <a href={x} target="_blank" rel="noopener noreferrer" className="text-link" style={{ ...linkStyle, cursor: 'pointer' }}>
                SHARE ON X
            </a>
            <a href={fb} target="_blank" rel="noopener noreferrer" className="text-link" style={{ ...linkStyle, cursor: 'pointer' }}>
                SHARE ON FACEBOOK
            </a>
        </div>
    );
}
