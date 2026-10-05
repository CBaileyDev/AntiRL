"""Convert the public RLViser cache to small, renderer-independent mesh buffers.

Input: .local/review-references/cache.zip from VirxEC/rlviser (see assets/SOURCES.md).
Only the ball is used here. prepare-studio-meshes.py builds the stadium and Octane.
No user game files or state are accessed.
"""
import io
import struct
import zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
output = root / "app/public/viewer"
output.mkdir(parents=True, exist_ok=True)
archive = zipfile.ZipFile(root / ".local/review-references/cache.zip")

for source, name in [("Ball_DefaultBall00", "ball")]:
    raw = archive.read(f"cache/mesh/{source}.bin")
    cursor = 0

    def vector(fmt, width=1):
        global cursor
        count = struct.unpack_from("<Q", raw, cursor)[0]
        cursor += 8
        values = struct.unpack_from(f"<{count * width}{fmt}", raw, cursor)
        cursor += struct.calcsize(fmt) * count * width
        return values

    indices = vector("I")
    positions = vector("f")
    uvs = vector("f", 2)
    colors = vector("f", 4)
    materials = struct.unpack_from("<Q", raw, cursor)[0]
    cursor += 8
    material_ids = vector("Q")
    assert cursor == len(raw)
    assert len(positions) % 3 == 0 and len(indices) % 3 == 0
    vertex_count = len(positions) // 3
    assert max(indices) < vertex_count
    # RLViser's cache already uses (x, z, -y), exactly this app's replay transform.
    positions = [value * 0.01 for value in positions]
    # Bevy uses right-handed triangle winding; Babylon's default scene is left-handed.
    indices = [indices[i + k] for i in range(0, len(indices), 3) for k in (0, 2, 1)]
    # One material id per triangle, used to separate paint, windows and trim.
    triangle_materials = [material_ids[indices[i]] if material_ids else 0 for i in range(0, len(indices), 3)]
    with (output / f"{name}.mesh").open("wb") as file:
        file.write(struct.pack("<4I", vertex_count, len(indices), len(uvs), materials))
        file.write(struct.pack(f"<{len(positions)}f", *positions))
        file.write(struct.pack(f"<{len(indices)}I", *indices))
        file.write(struct.pack(f"<{len(uvs)}f", *uvs))
        file.write(bytes(triangle_materials))
    print(name, vertex_count, len(indices)//3, "triangles", materials, "materials")

image = Image.open(io.BytesIO(archive.read("cache/textures/Ball_Default00_D.tga")))
image.thumbnail((1024, 1024))
image.save(output / "ball.webp", quality=88)
