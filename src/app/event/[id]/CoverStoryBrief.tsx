/**
 * Cover Story B — "THE COVER STORY" editorial section: the event description
 * with a drop-cap first letter. Omits itself (page decides) when there is no
 * description; no fallback copy is fabricated here.
 */
import styles from './cover-story.module.css';

export function CoverStoryBrief({ description }: { description: string }) {
    return (
        <div className={styles.briefPanel}>
            {/* whiteSpace: pre-line — hosts often write the itinerary as plain-text
                line breaks; collapsing them read as one run-on paragraph (kept
                from the previous markup). */}
            <p className={styles.dropCap} style={{ whiteSpace: 'pre-line' }}>
                {description}
            </p>
        </div>
    );
}
