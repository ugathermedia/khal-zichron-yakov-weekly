'use strict';
const assert = require('node:assert/strict');
const { compressToLimit, MAX_BYTES } = require('../jpeg-export.js');

function mockCanvas(sizeFor) {
  const canvas = {
    width: 2550, height: 3300,
    toBlob(callback, mime, quality) {
      callback({ type: mime, size: sizeFor(this, quality) });
    },
    getContext() { return { drawImage() {}, imageSmoothingEnabled: false }; }
  };
  return canvas;
}

async function main() {
  assert.equal(MAX_BYTES, 1000000);
  const initial = mockCanvas((canvas, quality) => Math.round(1900000 * quality));
  const result = await compressToLimit(initial);
  assert.ok(result.blob.size < MAX_BYTES);
  assert.equal(result.width, 2550); // compress quality before resizing
  assert.equal(result.height, 3300);

  const scaled = mockCanvas((canvas, quality) => Math.round(canvas.width * canvas.height * quality * 0.65));
  const resized = await compressToLimit(scaled, { createCanvas: () => mockCanvas((canvas, quality) => Math.round(canvas.width * canvas.height * quality * 0.65)) });
  assert.ok(resized.blob.size < MAX_BYTES);
  assert.ok(resized.width < 2550);
  assert.ok(resized.height < 3300);

  const boundary = mockCanvas(() => 1000000);
  await assert.rejects(() => compressToLimit(boundary, { createCanvas: () => mockCanvas(() => 1000000) }), /Could not compress/);
  const justBelow = await compressToLimit(mockCanvas(() => 999999));
  assert.equal(justBelow.blob.size, 999999);
  assert.equal(justBelow.width, 2550);

  const pngFallback = mockCanvas(() => 500000);
  pngFallback.toBlob = (callback) => callback({ type: 'image/png', size: 500000 });
  await assert.rejects(() => compressToLimit(pngFallback), /cannot encode JPEG/);

  console.log('JPEG hard cap, full-resolution preference, scale fallback and failure tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
