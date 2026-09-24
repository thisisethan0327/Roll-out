/**
 * Cover Story B — equal-size sponsor cards. Behaviour unchanged (link wraps
 * card when sponsor.url is set); purely restyled markup.
 */
import styles from './cover-story.module.css';

export type SponsorView = {
    name: string;
    logo_url: string;
    url: string | null;
    role: string | null;
    note: string | null;
};

export function SponsorsSection({ sponsors }: { sponsors: SponsorView[] }) {
    return (
        <div className={styles.sponsorStrip}>
            <div className={styles.sponsorGrid}>
                {sponsors.map((s, i) => {
                    const card = (
                        <>
                            <div className={styles.sponsorMark}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- external/local sponsor art */}
                                <img src={s.logo_url} alt={s.name} />
                            </div>
                            <span className={styles.sponsorName}>{s.name}</span>
                            {s.role ? <span className={styles.sponsorRole}>{s.role}</span> : null}
                            {s.note ? <p className={styles.sponsorBlurb}>{s.note}</p> : null}
                        </>
                    );
                    return s.url ? (
                        <a key={`${s.name}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" className={styles.sponsorCard}>
                            {card}
                        </a>
                    ) : (
                        <div key={`${s.name}-${i}`} className={styles.sponsorCard}>
                            {card}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
