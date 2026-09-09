/**
 * Image sizing for capture. The arithmetic is separated from the canvas so it
 * can be tested; `compressImage` below is the thin browser half.
 */

/** Long edge, in pixels, after downscaling. */
export const MAX_EDGE = 2048
/** JPEG quality. 0.82 is where artefacts stop being visible on a photo of a
 *  dirty machine and the file is roughly a quarter of the size of 0.95. */
export const JPEG_QUALITY = 0.82

export interface Dimensions {
  width: number
  height: number
}

/**
 * Scales dimensions to fit a maximum long edge, preserving aspect ratio.
 *
 * Never scales UP: a small photo stays as it is rather than being interpolated
 * into a bigger file that carries no more information. Rounds to whole pixels
 * and clamps to at least 1, because a 4000x1 panorama would otherwise round
 * the short edge to zero and produce a canvas that throws.
 */
export function fitWithin(
  source: Dimensions,
  maxEdge: number = MAX_EDGE,
): Dimensions {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge || longest === 0) {
    return { width: source.width, height: source.height }
  }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/** Whether this file is worth putting through the canvas at all. */
export function isCompressibleImage(mimeType: string): boolean {
  // HEIC is excluded on purpose. iOS Safari can decode it, but a canvas
  // round-trip on other browsers yields a blank image rather than an error,
  // and a blank photo is worse than a large one. iOS converts HEIC to JPEG
  // for most `<input type="file">` captures anyway; when it does not, the
  // original is uploaded untouched.
  return (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp'
  )
}

export interface CompressedImage {
  blob: Blob
  mimeType: string
  width: number
  height: number
  /** True when the original was returned unchanged. */
  passthrough: boolean
}

/**
 * Downscales and re-encodes a captured photo.
 *
 * `createImageBitmap` with `imageOrientation: 'from-image'` applies the EXIF
 * rotation, which matters: a phone photo carries orientation as metadata, and
 * drawing it to a canvas without honouring that gives a sideways image. The
 * re-encode drops EXIF entirely -- including GPS, which we have no business
 * shipping to a client's browser.
 *
 * Falls back to the original blob if anything throws. A large photo that
 * uploads is worth more than a perfect one that does not exist.
 */
export async function compressImage(
  file: Blob,
  mimeType: string,
  maxEdge: number = MAX_EDGE,
): Promise<CompressedImage> {
  if (!isCompressibleImage(mimeType)) {
    return { blob: file, mimeType, width: 0, height: 0, passthrough: true }
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const target = fitWithin(
      { width: bitmap.width, height: bitmap.height },
      maxEdge,
    )

    const canvas = new OffscreenCanvas(target.width, target.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)

    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
    })

    // If re-encoding made it bigger -- which happens with small PNGs of
    // screenshots -- keep the original.
    if (blob.size >= file.size) {
      return {
        blob: file,
        mimeType,
        width: target.width,
        height: target.height,
        passthrough: true,
      }
    }

    return {
      blob,
      mimeType: 'image/jpeg',
      width: target.width,
      height: target.height,
      passthrough: false,
    }
  } catch {
    return { blob: file, mimeType, width: 0, height: 0, passthrough: true }
  } finally {
    bitmap?.close()
  }
}
