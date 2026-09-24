/**
 * Cover Story B — torn-edge stat cards (Attending / Capacity / Spots left).
 * Pure presentation over the same numbers the page already computed.
 */
import styles from './cover-story.module.css';

export function StatBand({
    attending,
    capacity,
    spotsLeft,
}: {
    attending: number;
    capacity: number | null;
    spotsLeft: number | null;
}) {
    const cells = [
        { lbl: 'Attending', val: String(attending) },
        { lbl: 'Capacity', val: capacity != null ? String(capacity) : '—' },
        { lbl: 'Spots Left', val: spotsLeft != null ? String(spotsLeft) : '—' },
    ];
    return (
        <div className={styles.statsStrip}>
            {cells.map((c) => (
                <div key={c.lbl} className={`${styles.statCard} ${styles.tornBoth}`}>
                    <div className={styles.statNum}>{c.val}</div>
                    <div className={styles.statLbl}>{c.lbl}</div>
                </div>
            ))}
        </div>
    );
}
