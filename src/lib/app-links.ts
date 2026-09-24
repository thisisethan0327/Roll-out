/**
 * Public app-store listings. Both are null until the listings exist: the old
 * buttons linked to the bare store home pages ("Download iOS" → apps.apple.com),
 * which a visitor reads as a broken product. <AppStoreBadges /> renders the
 * real "Download iOS" / "Get Android" badges once these are set.
 */
export const APP_STORE_URL: string | null = null;
export const PLAY_STORE_URL: string | null = null;

/**
 * Beta-only download links, shown as "BETA TEST ONLY" pills while the real
 * store listings above are still null. iOS has a public TestFlight link
 * today; there is no Android build yet, so ANDROID_BETA_URL stays null and
 * <AppStoreBadges /> renders its pill disabled. Once an Android beta link
 * exists, setting this makes that pill a live link automatically.
 */
export const IOS_BETA_URL = 'https://testflight.apple.com/join/F8Jaba18';
export const ANDROID_BETA_URL: string | null = null;
