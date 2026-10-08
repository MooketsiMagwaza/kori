/**
 * Photos are re-encoded on the phone before they are stored. Drawing the image onto a canvas and
 * exporting a new JPEG keeps the pixels and drops everything else the camera wrote into the file,
 * including EXIF GPS coordinates, the camera serial and the time. The long side is capped at 1600px
 * so photos stay small enough to sync over a weak connection later.
 */

const MAX_SIDE = 1600;

export async function reencodePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare photos.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be prepared."))), "image/jpeg", 0.82));
}
