/**
 * Storage helpers for the EMWRAPS kiosk-media bucket (public read, no write
 * policies — all writes go through service-role signed upload URLs minted
 * server-side).
 *
 * Filenames follow the kiosk cache convention: files are served with a 1-year
 * cache, so an existing path is NEVER overwritten — every new upload mints a
 * fresh `-vN` suffix by listing the folder and bumping past the highest
 * existing version for that base name.
 */
import 'server-only';
import { getSupabasePublicAdmin } from './supabase/admin';

export const KIOSK_BUCKET = 'kiosk-media';
export const HERO_FOLDER = 'kiosk/events';
export const GALLERY_FOLDER = 'kiosk/events/gallery';

export function slugifyTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List `folder` and return `<folder>/<baseName>-v<N+1>.<ext>` where N is the
 * highest existing version for baseName (any extension counts, so replacing
 * a .png hero with a .jpg still bumps the version).
 */
export async function nextVersionedPath(
    folder: string,
    baseName: string,
    ext: string,
): Promise<string> {
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin.storage
        .from(KIOSK_BUCKET)
        .list(folder, { limit: 1000, search: baseName });
    if (error) throw new Error(`Storage list failed: ${error.message}`);

    const re = new RegExp(`^${escapeRegExp(baseName)}-v(\\d+)\\.[a-z0-9]+$`, 'i');
    let maxN = 0;
    for (const f of data ?? []) {
        const m = f.name.match(re);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    return `${folder}/${baseName}-v${maxN + 1}.${ext}`;
}

export function publicUrlFor(path: string): string {
    const admin = getSupabasePublicAdmin();
    return admin.storage.from(KIOSK_BUCKET).getPublicUrl(path).data.publicUrl;
}
