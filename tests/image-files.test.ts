import test from "node:test";
import assert from "node:assert/strict";
import { imageExtension, sniffImageType } from "@/lib/image-files";

// Uploads are identified by their leading bytes, never by the browser-supplied
// File.type -- which a hand-made request can set to anything.

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test("recognises real JPEG, PNG and WebP headers", () => {
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), "image/jpeg");
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), "image/png");
  assert.equal(
    sniffImageType(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), 0])),
    "image/webp"
  );
});

test("rejects things that merely claim to be images", () => {
  const notImages: Array<[string, Uint8Array]> = [
    ["a WAV file (RIFF, but not WEBP)", new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE"), 0])],
    ["a GIF (no longer accepted)", new Uint8Array(ascii("GIF89a......"))],
    ["HTML", new Uint8Array(ascii("<html><script>alert(1)</script>"))],
    ["a PDF", new Uint8Array(ascii("%PDF-1.7 ......"))],
    ["an empty file", new Uint8Array(0)],
    ["a truncated PNG", bytes(0x89, 0x50, 0x4e, 0x47)],
  ];

  for (const [name, data] of notImages) {
    assert.equal(sniffImageType(data), null, name);
  }
});

test("file extensions follow the real type", () => {
  assert.equal(imageExtension("image/webp"), "webp");
  assert.equal(imageExtension("image/jpeg"), "jpg");
  assert.equal(imageExtension("image/png"), "png");
});
