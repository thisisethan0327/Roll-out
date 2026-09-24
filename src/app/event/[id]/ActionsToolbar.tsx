/**
 * Cover Story B — calendar/manage action buttons. ShareBar (client, copy +
 * social intents) renders alongside this but keeps its own component since
 * it needs clipboard access; this covers the plain-link actions only.
 */
import Link from 'next/link';
import styles from './cover-story.module.css';

export function ActionsToolbar({
    calUrl,
    icsUrl,
    manageHref,
}: {
    calUrl: string | null;
    icsUrl: string | null;
    manageHref: string | null;
}) {
    if (!calUrl && !icsUrl && !manageHref) return null;
    return (
        <div className={styles.actionsToolbar}>
            {calUrl ? (
                <a href={calUrl} target="_blank" rel="noopener noreferrer" className={styles.actionBtn}>
                    + GOOGLE CALENDAR
                </a>
            ) : null}
            {icsUrl ? (
                <a href={icsUrl} className={styles.actionBtn}>
                    + DOWNLOAD .ICS
                </a>
            ) : null}
            {manageHref ? (
                <Link href={manageHref} className={styles.actionBtn}>
                    HOST · MANAGE THIS EVENT ›
                </Link>
            ) : null}
        </div>
    );
}
