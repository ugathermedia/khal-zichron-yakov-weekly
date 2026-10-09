/* JPEG export for the weekly sheet. Successful files are strictly under
 * 1,000,000 bytes. Preserve dimensions when possible; resize only if needed.
 * PNG and PDF are not affected.
 */
(function (root) {
  'use strict';

  const MAX_BYTES = 1000000;
  const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
  const QUALITIES = [0.92, 0.84, 0.76, 0.68, 0.6, 0.48, 0.35];

  function encodeJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Could not encode the JPEG.'));
          if (blob.type !== 'image/jpeg') return reject(new Error('This browser cannot encode JPEG images.'));
          if (!Number.isFinite(blob.size)) return reject(new Error('Could not determine JPEG file size.'));
          resolve(blob);
        }, 'image/jpeg', quality);
      } catch (error) { reject(error); }
    });
  }

  async function compressToLimit(source, options = {}) {
    if (!source || !source.width || !source.height) throw new Error('The captured sheet is empty.');
    const maxBytes = options.maxBytes ?? MAX_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) throw new Error('Invalid JPEG file-size limit.');
    const createCanvas = options.createCanvas || (() => root.document.createElement('canvas'));

    for (const scale of SCALES) {
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const canvas = scale === 1 ? source : createCanvas();
      if (scale !== 1) {
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not resize the JPEG.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, width, height);
      }

      try {
        for (const quality of QUALITIES) {
          const blob = await encodeJpeg(canvas, quality);
          if (blob.size < maxBytes) return { blob, width, height, quality, size: blob.size };
        }
      } finally {
        if (scale !== 1) { canvas.width = 0; canvas.height = 0; }
      }
    }
    throw new Error('Could not compress the JPEG below 1 MB without making it unreadably small.');
  }

  const api = Object.freeze({ MAX_BYTES, compressToLimit });
  root.WeeklyJpegExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
