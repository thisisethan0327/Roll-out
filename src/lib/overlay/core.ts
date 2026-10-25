/**
 * The overlay stack's plain core: no React, no imports, so it runs (and is
 * unit-tested) anywhere. The hooks in ./stack.ts wrap it.
 *
 * Ported from emwraps-tickets `src/lib/overlayStack.js` (origin/master
 * 7df9702), overlay plan Phase 1:
 *
 * - **Escape goes to the top layer only.** A Sheet under a confirm, or a
 *   picker inside a Sheet, no longer closes with the same keypress. A handler
 *   inside an overlay that consumes Escape itself calls `e.preventDefault()`;
 *   the stack then leaves that keypress alone.
 * - **Body scroll lock is counted**, so closing an inner overlay never
 *   unlocks the page under the outer one. Rollout also pauses Lenis (the
 *   smooth-scroll driver) while locked; overlay roots carry
 *   `data-lenis-prevent` so their own content still scrolls.
 * - **First-run prompts queue**, so only one shows at a time.
 */

export type OverlayLayer = { id: number; onEscape: (e: KeyboardEvent) => void };

type KeyTarget = { addEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void };

const layers: OverlayLayer[] = [];
let seq = 0;
let boundTo: KeyTarget | null = null;

/**
 * Window keydown, bubble phase: every listener inside the overlay has run by
 * now, so one that handled Escape has had its chance to preventDefault().
 */
export function handleEscapeKey(e: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'preventDefault'>): boolean {
    if (e.key !== 'Escape' || e.defaultPrevented || layers.length === 0) return false;
    const top = layers[layers.length - 1];
    e.preventDefault();
    top.onEscape(e as KeyboardEvent);
    return true;
}

function bindKey() {
    const w = typeof window === 'undefined' ? null : (window as unknown as KeyTarget);
    if (!w || boundTo === w) return;
    boundTo = w;
    w.addEventListener('keydown', (e) => {
        handleEscapeKey(e);
    });
}

/** Push a layer; returns the function that removes it. */
export function pushLayer(onEscape: (e: KeyboardEvent) => void): { layer: OverlayLayer; remove: () => void } {
    const layer: OverlayLayer = { id: ++seq, onEscape };
    layers.push(layer);
    bindKey();
    return {
        layer,
        remove: () => {
            const i = layers.indexOf(layer);
            if (i >= 0) layers.splice(i, 1);
        },
    };
}

export const isTopLayer = (layer: OverlayLayer | null) => layer != null && layers[layers.length - 1] === layer;
export const isAnyOverlayOpen = () => layers.length > 0;
export const layerCount = () => layers.length;

// ── Body scroll lock, counted ──────────────────────────────────────────────
type LenisLike = { stop: () => void; start: () => void };
let locks = 0;
let savedOverflow = '';

const lenis = (): LenisLike | undefined =>
    typeof window === 'undefined' ? undefined : (window as unknown as { __lenis?: LenisLike }).__lenis;

export function lockScroll() {
    if (typeof document === 'undefined') return;
    if (locks === 0) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        lenis()?.stop();
    }
    locks += 1;
}

export function unlockScroll() {
    if (typeof document === 'undefined' || locks === 0) return;
    locks -= 1;
    if (locks === 0) {
        document.body.style.overflow = savedOverflow;
        lenis()?.start();
    }
}

export const scrollLockCount = () => locks;

// ── First-run prompt queue ─────────────────────────────────────────────────
const promptQueue: { key: string; resolve: () => void }[] = [];
let promptActive: string | null = null;

function pump() {
    if (promptActive || promptQueue.length === 0) return;
    const next = promptQueue.shift()!;
    promptActive = next.key;
    next.resolve();
}

/** Resolves when it's this prompt's turn to show. Call releasePrompt(key) when it closes. */
export function claimPrompt(key: string): Promise<void> {
    return new Promise((resolve) => {
        promptQueue.push({ key, resolve });
        pump();
    });
}

export function releasePrompt(key: string) {
    const i = promptQueue.findIndex((p) => p.key === key);
    if (i >= 0) promptQueue.splice(i, 1);
    if (promptActive === key) {
        promptActive = null;
        pump();
    }
}
