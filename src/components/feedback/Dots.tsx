/**
 * Dots — three pulsing dots in the current text color. Pure markup (no hooks),
 * so it is safe to render from both server and client components. Used inside
 * busy buttons and inline "working" labels to signal an in-flight action in the
 * HUD idiom (see .rl-dots in globals.css).
 */
export function Dots({ className }: { className?: string }) {
    return (
        <span className={`rl-dots${className ? ` ${className}` : ''}`} aria-hidden="true">
            <i />
            <i />
            <i />
        </span>
    );
}
