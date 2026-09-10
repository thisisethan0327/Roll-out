/**
 * The Copper Map icon set — 24-viewBox, 1.5 stroke, currentColor, round caps,
 * hand-authored in rollout/docs/restyle/icons/build-icons.mjs and shipped as
 * one sprite at /icons/rollout-icons.svg. Each <symbol> carries its own
 * presentation attributes, so an external <use> renders without inheriting
 * anything from the sprite root (that is why the sprite is referenced by URL
 * rather than inlined).
 *
 * Replaces the Unicode glyphs (◉ ◐ ✎ ◈ ✦ ∿ ★ ☀ ☾) that carried meaning by
 * font luck. "meet" (two cars) degrades to a squiggle under 18px — use
 * "meet-solo" in small slots; it sits optically light next to square glyphs,
 * hence the default 18px box for it.
 */
export type IconName =
    | 'meet'
    | 'meet-solo'
    | 'shop'
    | 'store'
    | 'map-pin'
    | 'route'
    | 'ferry'
    | 'calendar'
    | 'share'
    | 'going'
    | 'waitlist'
    | 'spots'
    | 'host'
    | 'verified'
    | 'settings'
    | 'sign-out'
    | 'search';

const SPRITE = '/icons/rollout-icons.svg';

export function Icon({
    name,
    size,
    title,
    className,
    style,
}: {
    name: IconName;
    /** Box size in px. Defaults to 20; meet-solo defaults to 18 (see above). */
    size?: number;
    /** Accessible name. Omit for decorative icons next to a text label. */
    title?: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const px = size ?? (name === 'meet-solo' ? 18 : 20);
    return (
        <svg
            width={px}
            height={px}
            viewBox="0 0 24 24"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            className={className}
            style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
        >
            {title ? <title>{title}</title> : null}
            <use href={`${SPRITE}#i-${name}`} />
        </svg>
    );
}
