/**
 * Public app-store listings. Both are null until the listings exist: the old
 * buttons linked to the bare store home pages ("Download iOS" → apps.apple.com),
 * which a visitor reads as a broken product. <AppStoreBadges /> renders nothing
 * while these are null, so the markup is ready the day the URLs arrive.
 */
export const APP_STORE_URL: string | null = null;
export const PLAY_STORE_URL: string | null = null;
