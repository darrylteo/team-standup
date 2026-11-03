// Prepare an avatar photo in the browser so uploads stay small and square.
export const MAX_PHOTO_BYTES = 1_000_000;
const SIZE = 256;

/**
 * GIFs up to 1 MB are kept as-is so animation survives. Everything else (and larger GIFs, which lose animation)
 * is centre-cropped to a 256 px square WebP, or JPEG where the browser can't encode WebP.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; note?: string }> {
  if (file.type === "image/gif" && file.size <= MAX_PHOTO_BYTES) return { blob: file };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Try a PNG, JPG, GIF or WebP.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.86));
  let blob = await encode("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("Couldn't process that image.");
  return { blob, note: file.type === "image/gif" ? "GIF was over 1 MB, so it was saved as a still image." : undefined };
}

export const MAX_FIGURE_BYTES = 1_400_000;
const FIGURE_MAX_SIDE = 1600;

/** Figure of the week: scaled to fit 1600 px (never cropped), WebP where possible. Small GIFs keep animation. */
export async function prepareFigure(file: File): Promise<Blob> {
  if (file.type === "image/gif" && file.size <= MAX_FIGURE_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Try a PNG, JPG, GIF or WebP.");
  }
  const scale = Math.min(1, FIGURE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of [0.85, 0.7, 0.55]) {
    let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_FIGURE_BYTES) return blob;
  }
  throw new Error("That image is too detailed to fit. Try a screenshot of just the key plot.");
}
