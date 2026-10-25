/**
 * The one empty state of the Glide kit: an icon, a one-line title and an
 * optional action. **There is no body prop.** Copy rule (Documents/CLAUDE.md
 * §12, "UI copy: let the layout explain"): an empty state does not explain
 * where things come from or point at a button that is already on screen.
 *
 * A second line is allowed in exactly two cases, each with its own prop:
 *   search   the query that found nothing: renders the fixed line
 *            “Nothing matches "q". Try a shorter word.”
 *   blocker  a state that blocks the person and names who fixes it, or an
 *            error from the server ("Contact team@rollout.club to set it up")
 *
 * The console, shop, shop-business and tickets empty states are thin
 * wrappers over this one (they pass `look` to keep their exact layout), so
 * none of them can take a free-text second line either. Server-safe.
 */
import type { ReactNode } from 'react';

export type EmptyLook = {
    /** Class of the outer element. Default: `g-empty`. */
    root?: string;
    /** Title element: `b` (default) or `h2` (a page-level empty state). */
    title?: 'b' | 'h2';
    /** The 36px roundel instead of 46px (table rows). */
    smallIcon?: boolean;
    /** Wrap title + line in a <span> beside the icon (table rows). */
    inline?: boolean;
    /** Class of the action wrapper; `false` renders the action bare. */
    act?: string | false;
};

export type EmptyStateProps = {
    icon: ReactNode;
    title: string;
    action?: ReactNode;
    /** The search query that found nothing. */
    search?: string;
    /** Only for a blocking state that names who fixes it, or a server error. */
    blocker?: ReactNode;
};

export function emptyLine({ search, blocker }: Pick<EmptyStateProps, 'search' | 'blocker'>): ReactNode {
    if (search != null && search.trim()) return `Nothing matches “${search.trim()}”. Try a shorter word.`;
    return blocker ?? null;
}

export function EmptyState({
    icon,
    title,
    action,
    search,
    blocker,
    center,
    look = {},
}: EmptyStateProps & { center?: boolean; look?: EmptyLook }) {
    const line = emptyLine({ search, blocker });
    const Title = look.title ?? 'b';
    const root = look.root ?? `g-empty${center ? ' g-empty--center' : ''}`;
    const act = look.act === undefined ? 'g-empty-act' : look.act;
    const iconEl = (
        <span className={look.smallIcon ? 'g-ic g-ic--sm' : 'g-ic'} aria-hidden="true">
            {icon}
        </span>
    );
    if (look.inline) {
        return (
            <div className={root}>
                {iconEl}
                <span>
                    <Title>{title}</Title>
                    {line ? <small>{line}</small> : null}
                </span>
                {action ? act ? <div className={act}>{action}</div> : action : null}
            </div>
        );
    }
    return (
        <div className={root}>
            {iconEl}
            <Title>{title}</Title>
            {line ? <p>{line}</p> : null}
            {action ? act ? <div className={act}>{action}</div> : action : null}
        </div>
    );
}
