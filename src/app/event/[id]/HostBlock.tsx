/**
 * Cover Story B — host block. Purely presentational; same host data the page
 * already resolved (host name/handle/verified).
 */
import Link from 'next/link';
import styles from './cover-story.module.css';

function initials(name: string, handle: string): string {
    const src = (name?.trim() || handle || '·').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function HostBlock({
    hostName,
    hostHandle,
    hostVerified,
}: {
    hostName: string;
    hostHandle: string;
    hostVerified: boolean;
}) {
    return (
        <div className={styles.hostBlock}>
            <div className={styles.hostAvatar}>{initials(hostName, hostHandle)}</div>
            <div>
                {hostHandle ? (
                    <Link href={`/u/${hostHandle}`} className={styles.hostName}>
                        {hostName}
                        {hostVerified ? ' ✓' : ''}
                    </Link>
                ) : (
                    <span className={styles.hostName}>{hostName}</span>
                )}
                {hostHandle ? <div className={styles.hostDesc}>@{hostHandle}</div> : null}
            </div>
        </div>
    );
}
