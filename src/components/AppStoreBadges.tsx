import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/app-links';

/** App-store buttons, per platform, only when a real listing URL exists. */
export function AppStoreBadges({ size = 'lg' }: { size?: 'lg' | 'md' }) {
    const cls = size === 'lg' ? 'btn btn-lg' : 'btn';
    if (!APP_STORE_URL && !PLAY_STORE_URL) return null;
    return (
        <>
            {APP_STORE_URL ? (
                <a className={`${cls} btn-ghost`} href={APP_STORE_URL} rel="noopener" target="_blank">
                    Download iOS
                </a>
            ) : null}
            {PLAY_STORE_URL ? (
                <a className={`${cls} btn-ghost`} href={PLAY_STORE_URL} rel="noopener" target="_blank">
                    Get Android
                </a>
            ) : null}
        </>
    );
}
