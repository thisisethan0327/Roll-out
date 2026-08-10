/**
 * Shared loading-feedback primitives for the Rollout web surface.
 * HUD idiom (mono type, gold accent, shimmer/pulse) — see globals.css `.rl-*`.
 *
 * - Dots           inline pulsing ellipsis (server-safe)
 * - PendingButton  button that shows a working state while an action runs
 * - LinkPending    pulsing dots while a parent <Link> navigation is in flight
 * - Skeleton*      route-level skeleton building blocks for loading.tsx
 */
export { Dots } from './Dots';
export { PendingButton } from './PendingButton';
export { LinkPending } from './LinkPending';
export {
    Skeleton,
    SkeletonText,
    SkeletonCard,
    SkeletonHeading,
    SkeletonRows,
} from './Skeleton';
