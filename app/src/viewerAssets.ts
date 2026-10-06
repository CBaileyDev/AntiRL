/** Geometry converted from RLViser's public cache; provenance in public/viewer/SOURCES.md. */
export interface ViewerMesh {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
  groups: Uint8Array;
  materialCount: number;
}
const cache = new Map<string, Promise<ViewerMesh>>();
export function loadViewerMesh(name: "octane" | "ball" | "wheel" | "stadium"): Promise<ViewerMesh> {
  const existing = cache.get(name);
  if (existing) return existing;
  const request = fetch(`/viewer/${name}.mesh`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Missing viewer geometry: ${name}`);
      const buffer = await response.arrayBuffer();
      const header = new Uint32Array(buffer, 0, 4);
      const [vertices, indices, uvs, materialCount] = header;
      const expected = 16 + vertices * 12 + indices * 4 + uvs * 4 + indices / 3;
      if (buffer.byteLength !== expected || indices % 3)
        throw new Error(`Invalid viewer geometry: ${name}`);
      let offset = 16;
      const positions = new Float32Array(buffer, offset, vertices * 3);
      offset += vertices * 12;
      const triangles = new Uint32Array(buffer, offset, indices);
      offset += indices * 4;
      const textureCoords = new Float32Array(buffer, offset, uvs);
      offset += uvs * 4;
      return {
        positions,
        indices: triangles,
        uvs: textureCoords,
        groups: new Uint8Array(buffer, offset),
        materialCount,
      };
    })
    .catch((error) => {
      cache.delete(name);
      throw error;
    });
  cache.set(name, request);
  return request;
}
