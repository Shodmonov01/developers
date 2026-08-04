import sharp from "sharp";

/** Resize + JPEG compress so Groq free-tier TPM (~8k) is not exceeded by huge screenshots. */
export async function prepareImageForGroq(inputBuffer, {
  maxEdge = 1280,
  quality = 75,
} = {}) {
  const image = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width || maxEdge;
  const height = meta.height || maxEdge;
  const longest = Math.max(width, height);

  let pipeline = image;
  if (longest > maxEdge) {
    pipeline = pipeline.resize({
      width: width >= height ? maxEdge : undefined,
      height: height > width ? maxEdge : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  return {
    buffer,
    mime: "image/jpeg",
    originalBytes: inputBuffer.length,
    preparedBytes: buffer.length,
    originalSize: { width, height },
  };
}
