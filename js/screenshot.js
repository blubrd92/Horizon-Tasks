// Turns a pasted, dropped, or picked image into the small JPEG the backend
// sends to Haiku. Everything here happens in the browser; nothing is saved.

// At most this wide (SPEC: about 1600) and this tall (the longest edge Haiku
// reads at full detail; a taller image would be shrunk on Anthropic's side
// anyway).
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 2576;
const QUALITY = 0.85;
const SMALLER_QUALITY = 0.7;
const MAX_BYTES = 3.5 * 1024 * 1024; // above this, try again at SMALLER_QUALITY

// The image files among a paste's or a drop's files, and how many weren't
// images.
export function splitImages(fileList) {
  const files = [...(fileList || [])];
  const images = files.filter((f) => f.type.startsWith('image/'));
  return { images, others: files.length - images.length };
}

// Shrinks an image file. Returns { blob, width, height }: a JPEG at most
// MAX_WIDTH wide and MAX_HEIGHT tall. Throws if the browser can't open it
// (a format it doesn't read, like HEIC in Chrome, or a broken file).
export async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    return await draw(await open(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function draw(img) {
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // White first, so a transparent PNG doesn't turn black as a JPEG.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  let blob = await toJpeg(canvas, QUALITY);
  if (blob.size > MAX_BYTES) blob = await toJpeg(canvas, SMALLER_QUALITY);
  // Let the full-size copy go now; only the small one is kept.
  canvas.width = 0;
  canvas.height = 0;
  return { blob, width, height };
}

// The small JPEG as base64, the form the backend expects. Made just before
// sending; the caller lets go of it once the request ends.
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function open(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
  return img;
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not make a JPEG'))), 'image/jpeg', quality);
  });
}
