const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;

/**
 * Reads an image File, downscales it so its longest edge is at most
 * MAX_DIMENSION, and re-encodes it as a JPEG data URL. This keeps the base64
 * payload small enough to avoid HTTP 413 errors and speeds up AI analysis,
 * while preserving enough detail for footwear recognition.
 *
 * Falls back to the original file (read as a data URL) if anything goes wrong.
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const fallback = () => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    };

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          fallback();
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        fallback();
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      fallback();
    };

    img.src = objectUrl;
  });
}
