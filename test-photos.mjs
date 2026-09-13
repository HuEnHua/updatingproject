import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'photos.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(root, manifest.provenanceFile), 'utf8'));
const byId = new Map(provenance.photos.map(p => [p.photoId, p]));
const identities = new Set();
const hashes = new Set();
assert.equal(byId.size, manifest.photos.length, 'Every photograph has a provenance entry');

for (const photo of manifest.photos) {
  const source = byId.get(photo.id);
  assert.ok(source, `Missing provenance for ${photo.id}`);
  assert.equal(source.file, photo.file);
  assert.equal(photo.age, source.age, `${photo.id}: age matches source metadata`);
  assert.equal(photo.older, photo.age > 21, `${photo.id}: correct threshold label`);
  const original = /^(\d+)_(.+)_(\d+)_([mf])\.jpg$/.exec(source.originalFilename);
  assert.ok(original, `${photo.id}: recognized AgeDB filename`);
  assert.equal(Number(original[3]), photo.age, `${photo.id}: exact dataset age`);
  assert.equal(original[2], source.datasetIdentity);
  assert.match(photo.file, /^photos\/p\d+\.jpg$/, 'Neutral runtime filename');
  const bytes = fs.readFileSync(path.join(root, photo.file));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8, `${photo.id}: JPEG signature`);
  assert.equal(bytes.length, source.bytes, `${photo.id}: complete image`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, source.sha256, `${photo.id}: original image checksum`);
  assert.ok(!hashes.has(sha256), `${photo.id}: no duplicate image`);
  hashes.add(sha256);
  const identity = source.datasetIdentity.toLowerCase();
  assert.ok(!identities.has(identity), `${photo.id}: no repeated person`);
  identities.add(identity);
}

console.log(`PHOTO CHECKS PASS: ${manifest.photos.length} original JPEGs; exact ages, checksums, and distinct identities verified.`);
