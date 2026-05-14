/**
 * Strip embedded texture references from a GLB before handing it to
 * three's GLTFLoader.
 *
 * Why: GLTFLoader's "embedded image" path calls `new Blob([bufferView])`
 * + `URL.createObjectURL(blob)` + `new Image()`, none of which work in
 * React Native / Hermes. Stripping `images` / `textures` / texture
 * pointers in the JSON chunk lets the loader fall back to the
 * `baseColorFactor` color from each material — the avatar still
 * renders cleanly, just in solid colors.
 *
 * The image bytes are left in the BIN chunk (deleting them would
 * require fixing up every bufferView index). That's wasted bandwidth
 * once per session — acceptable for a POC.
 */

const MAGIC_GLTF = 0x46546c67; // "glTF" little-endian
const TYPE_JSON = 0x4e4f534a; // "JSON" little-endian
const TYPE_BIN = 0x004e4942; // "BIN\0" little-endian

export function stripGlbTextures(buffer: ArrayBuffer): ArrayBuffer {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== MAGIC_GLTF) {
    throw new Error("Not a GLB (bad magic bytes)");
  }

  // JSON chunk: starts at offset 12.
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== TYPE_JSON) {
    throw new Error("Expected JSON chunk after header");
  }
  const jsonBytes = new Uint8Array(buffer, 20, jsonLen);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  // BIN chunk: starts right after the JSON chunk (8-byte chunk header).
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  if (dv.getUint32(binStart + 4, true) !== TYPE_BIN) {
    throw new Error("Expected BIN chunk after JSON");
  }
  const binBytes = new Uint8Array(buffer, binStart + 8, binLen);

  // Mutate JSON: drop image/texture arrays, then remove every texture
  // pointer materials might reference (so GLTFLoader skips them
  // gracefully rather than dereferencing a missing index).
  delete json.images;
  delete json.textures;
  delete json.samplers;
  if (Array.isArray(json.materials)) {
    for (const m of json.materials) {
      const pbr = m.pbrMetallicRoughness;
      if (pbr) {
        delete pbr.baseColorTexture;
        delete pbr.metallicRoughnessTexture;
      }
      delete m.normalTexture;
      delete m.emissiveTexture;
      delete m.occlusionTexture;
      // KHR_materials_pbrSpecularGlossiness etc. — strip texture refs
      // wherever they appear.
      if (m.extensions) {
        for (const ext of Object.values<any>(m.extensions)) {
          if (ext && typeof ext === "object") {
            for (const k of Object.keys(ext)) {
              if (k.endsWith("Texture")) delete ext[k];
            }
          }
        }
      }
    }
  }

  let newJsonBytes = new TextEncoder().encode(JSON.stringify(json));
  // GLB JSON chunk length must be multiple of 4, padded with space (0x20).
  const padding = (4 - (newJsonBytes.length % 4)) % 4;
  if (padding) {
    const padded = new Uint8Array(newJsonBytes.length + padding);
    padded.set(newJsonBytes);
    padded.fill(0x20, newJsonBytes.length);
    newJsonBytes = padded;
  }

  const totalLen = 12 + 8 + newJsonBytes.length + 8 + binBytes.length;
  const out = new ArrayBuffer(totalLen);
  const ov = new DataView(out);

  ov.setUint32(0, MAGIC_GLTF, true);
  ov.setUint32(4, 2, true);
  ov.setUint32(8, totalLen, true);

  ov.setUint32(12, newJsonBytes.length, true);
  ov.setUint32(16, TYPE_JSON, true);
  new Uint8Array(out, 20, newJsonBytes.length).set(newJsonBytes);

  const newBinStart = 20 + newJsonBytes.length;
  ov.setUint32(newBinStart, binBytes.length, true);
  ov.setUint32(newBinStart + 4, TYPE_BIN, true);
  new Uint8Array(out, newBinStart + 8, binBytes.length).set(binBytes);

  return out;
}
