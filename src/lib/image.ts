// Photos are stored in the database, so they are shrunk in the browser before upload: longest edge 1600px,
// re-encoded as JPEG, and kept under MAX_PHOTO_BYTES (the server enforces the same cap). Phone photos of
// 3-8 MB come out around 200-500 KB, which is plenty for a memory wall and keeps the database small.

export const MAX_PHOTO_EDGE = 1600;
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

export type PreparedPhoto = { file: File; width: number; height: number; shrunk: boolean };

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser can't decode it (HEIC on non-Apple browsers, for example). Send it as-is if it's small enough.
    if (file.size <= MAX_PHOTO_BYTES) return { file, width: 0, height: 0, shrunk: false };
    throw new Error("Couldn't read that photo here. Try exporting it as a JPEG, or pick a smaller one.");
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (scale === 1 && file.size <= MAX_PHOTO_BYTES) {
    bitmap.close();
    return { file, width, height, shrunk: false };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("Couldn't resize that photo in this browser"); }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
  for (const quality of [0.84, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_PHOTO_BYTES) return { file: new File([blob], name, { type: "image/jpeg" }), width, height, shrunk: true };
  }
  throw new Error("That photo is still too large after shrinking. Try a different one.");
}

export function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
