import type { ReportSection } from "./report-types";

/**
 * Longest side, in pixels, a photo is scaled to before it is embedded in the
 * PDF / Word / Excel export. Uploads are allowed up to 5 MB each and were
 * embedded at full resolution, so a zone-wide report came to 60-80 MB per
 * file (about 4 MB per photo; the report data itself is 1-3 MB). The photo
 * boxes in the export are a few centimetres wide, so this is still well above
 * print resolution.
 */
const MAX_SIDE = 1200;
const JPEG_QUALITY = 0.8;
/** Images already this small are embedded as they are (logos, screenshots, small photos). */
const SKIP_BELOW_BYTES = 250_000;

/**
 * Scales a large raster image down and re-encodes it as JPEG. Anything that
 * cannot be decoded, or that would not get smaller, is returned unchanged, so
 * this can only make an export lighter, never lose a photo.
 */
async function shrinkImage(blob: Blob): Promise<Blob> {
  const shrinkable = /^image\/(jpeg|png|webp|bmp)$/i.test(blob.type);
  if (!shrinkable || blob.size <= SKIP_BELOW_BYTES) return blob;

  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so a portrait shot is not embedded sideways.
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    // JPEG has no transparency; without a background a transparent PNG would turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return jpeg && jpeg.size < blob.size ? jpeg : blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Collects every Module-Image url referenced across a built report tree and
 * fetches each once (via the same-origin file proxy, which needs the browser
 * session), returning a `url -> data-URL` map the PDF / Word / Excel
 * renderers embed from. Large photos are scaled down first (see MAX_SIDE).
 * The HTML preview uses the urls directly as <img src> and needs none of this.
 */
export async function prefetchReportImages(sections: ReportSection[]): Promise<Map<string, string>> {
  const urls = new Set<string>();
  for (const sec of sections) for (const sub of sec.subsections) for (const im of sub.images ?? []) urls.add(im.url);
  const out = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await shrinkImage(await res.blob());
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
        out.set(url, dataUrl);
      } catch {
        // A missing/blocked image is skipped, not fatal.
      }
    }),
  );
  return out;
}
