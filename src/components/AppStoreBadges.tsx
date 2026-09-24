import { APP_STORE_URL, PLAY_STORE_URL, IOS_BETA_URL, ANDROID_BETA_URL } from '@/lib/app-links';

/**
 * App-store buttons, per platform. Once APP_STORE_URL / PLAY_STORE_URL are
 * set to real listings, this renders the normal "Download iOS" / "Get
 * Android" badges below. Until then it renders "BETA TEST ONLY" pills instead
 * of nothing: iOS links straight to the public TestFlight join link, Android
 * renders disabled (no build yet) and turns into a live pill the moment
 * ANDROID_BETA_URL is set — no changes needed here.
 */
export function AppStoreBadges({ size = 'lg' }: { size?: 'lg' | 'md' }) {
    const cls = size === 'lg' ? 'btn btn-lg' : 'btn';

    if (APP_STORE_URL || PLAY_STORE_URL) {
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

    const pillCls = size === 'lg' ? 'beta-pill beta-pill-lg' : 'beta-pill beta-pill-md';

    return (
        <>
            <a className={pillCls} href={IOS_BETA_URL} rel="noopener" target="_blank">
                <span className="beta-pill-label">iOS <span className="beta-pill-sep">·</span> BETA TEST ONLY</span>
                <span className="beta-pill-sub">Install TestFlight, then join the Rollout beta</span>
            </a>
            {ANDROID_BETA_URL ? (
                <a className={pillCls} href={ANDROID_BETA_URL} rel="noopener" target="_blank">
                    <span className="beta-pill-label">ANDROID <span className="beta-pill-sep">·</span> BETA TEST ONLY</span>
                    <span className="beta-pill-sub">Join the Android beta</span>
                </a>
            ) : (
                <span className={`${pillCls} beta-pill-disabled`} aria-disabled="true">
                    <span className="beta-pill-label">ANDROID <span className="beta-pill-sep">·</span> BETA TEST ONLY</span>
                    <span className="beta-pill-sub">Android beta opens soon</span>
                </span>
            )}
        </>
    );
}
