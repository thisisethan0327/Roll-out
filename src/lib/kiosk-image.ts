/**
 * Browser-side image compression for kiosk-media uploads. Import only from
 * 'use client' components — uses canvas/createImageBitmap.
 *
 * Output is always JPEG, so uploaded paths always end in .jpg.
 */

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** For <input accept>. HEIC is excluded on purpose — browsers can't decode it. */
export const KIOSK_IMAGE_ACCEPT = ACCEPTED_TYPES.join(',');

const MAX_RAW_BYTES = 20 * 1024 * 1024;

export async function compressImageFile(
    file: File,
    opts: { maxDim: number; quality: number },
): Promise<Blob> {
    if (!ACCEPTED_TYPES.includes(file.type)) {
        throw new Error(
            'Please use a JPG, PNG, or WEBP image — iPhone HEIC photos must be converted first.',
        );
    }
    if (file.size > MAX_RAW_BYTES) {
        throw new Error('Image is larger than 20MB — please use a smaller file.');
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, opts.maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error('Image processing is not supported in this browser.');
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', opts.quality),
    );
    if (!blob) throw new Error('Image compression failed.');
    return blob;
}
