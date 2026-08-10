'use client';
/**
 * LinkPending — renders pulsing dots while its parent <Link> navigation is in
 * flight. Must be rendered as a CHILD of a next/link <Link>; it reads that
 * link's status via useLinkStatus (Next.js App Router, 15.3+ — no external
 * library). Gives instant "this is loading" feedback in a persistent nav/sidebar
 * the moment a link is tapped, before the destination's loading.tsx mounts.
 *
 * Renders nothing while idle, so it is inert in the common case.
 */
import { useLinkStatus } from 'next/link';
import { Dots } from './Dots';

export function LinkPending({ className }: { className?: string }) {
    const { pending } = useLinkStatus();
    if (!pending) return null;
    return <Dots className={className} />;
}
