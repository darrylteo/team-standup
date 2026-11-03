// Avatar photo checks. Kept out of index.ts so tests can import them directly.

export const MAX_PHOTO_BYTES = 1_000_000;

/** Identify an image by its magic bytes; anything else (SVG, HTML, PDFs…) is refused. */
export function sniffImage(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// Figures are resized in the browser first; this cap keeps base64 under D1's 2 MB row limit.
export const MAX_FIGURE_BYTES = 1_400_000;

/** Serve a stored image with headers that stop browsers treating it as anything but an image. */
export function imageResponse(row: { mime: string; data: string }) {
  const bin = atob(row.data);
  return new Response(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), {
    headers: {
      "content-type": row.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

/** Read an uploaded image body and check it; returns the bytes and type, or an error response body. */
export async function readImage(req: Request, max: number, tooBig: string): Promise<{ bytes: Uint8Array; mime: string } | { error: string; status: 400 | 413 | 415 }> {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return { error: "No image received", status: 400 };
  if (bytes.length > max) return { error: tooBig, status: 413 };
  const mime = sniffImage(bytes);
  if (!mime) return { error: "Use a PNG, JPG, GIF or WebP image", status: 415 };
  return { bytes, mime };
}
