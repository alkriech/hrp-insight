export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isImageFile(file: File) {
    return IMAGE_MIME.includes(file.type as (typeof IMAGE_MIME)[number]);
}

const MAX_DIMENSION = 1600;
const TARGET_BYTES = 0.8 * 1024 * 1024;
const QUALITY_STEPS: number[] = [0.85, 0.75, 0.6, 0.45, 0.3, 0.2];

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number) {
    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
}

function blobFile(blob: Blob, name: string, fallbackType: string) {
    const type = (blob.type || fallbackType) as string;
    return new File([blob], name, { type });
}

export async function compressImage(file: File, maxDimension = MAX_DIMENSION, targetBytes = TARGET_BYTES): Promise<File> {
    if (!isImageFile(file) || file.size <= targetBytes)
        return file;
    try {
        const bitmap = await createImageBitmap(file);
        try {
            const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return file;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(bitmap, 0, 0, width, height);
            const losslessMimes = ['image/png'];
            const lossyMimes = ['image/jpeg', 'image/webp'];
            let best: Blob | null = null;
            for (const mime of [...lossyMimes, ...losslessMimes, ...(file.type.includes('webp') ? ['image/webp'] : []), ...(file.type.includes('png') ? ['image/png'] : [])]) {
                for (const quality of QUALITY_STEPS) {
                    const blob = await toBlob(canvas, mime, quality);
                    if (!blob)
                        continue;
                    if (blob.size <= targetBytes)
                        return blobFile(blob, file.name, mime);
                    if (!best || blob.size < best.size)
                        best = blob;
                }
            }
            if (best && best.size < file.size)
                return blobFile(best, file.name, best.type || 'image/jpeg');
            return file;
        }
        finally {
            bitmap.close();
        }
    }
    catch {
        return file;
    }
}
