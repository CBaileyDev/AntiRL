"""Bake original standard stadium modules and the attributed Octane into viewer buffers.

Inputs are public source assets downloaded to .local/review-references. No game install
or user replay data is changed. Source URLs and attribution live in viewer/SOURCES.md.
"""
import json
import math
import struct
import zipfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / ".local/review-references"
OUT = ROOT / "app/public/viewer"

def write_mesh(name, parts, material_count):
    positions, indices, uvs, groups = [], [], [], []
    offset = 0
    for p, i, uv, group in parts:
        used, remap = np.unique(i, return_inverse=True)
        p, uv, i = p[used], uv[used], remap.reshape(-1, 3)
        positions.extend(p.flatten())
        indices.extend(i.flatten() + offset)
        uvs.extend(uv.flatten())
        groups.extend([group] * (i.size // 3))
        offset += len(p)
    with (OUT / f"{name}.mesh").open("wb") as f:
        f.write(struct.pack("<4I", offset, len(indices), len(uvs), material_count))
        f.write(np.asarray(positions, dtype="<f4").tobytes())
        f.write(np.asarray(indices, dtype="<u4").tobytes())
        f.write(np.asarray(uvs, dtype="<f4").tobytes())
        f.write(bytes(groups))
    print(name, offset, "vertices", len(indices)//3, "triangles", material_count, "materials")

archive = zipfile.ZipFile(REF / "cache.zip")
def cached_mesh(name):
    b = archive.read(f"cache/mesh/{name}.bin")
    at = 0
    def vec(dtype, width=1):
        nonlocal at
        count = struct.unpack_from("<Q", b, at)[0]; at += 8
        array = np.frombuffer(b, dtype=dtype, count=count*width, offset=at).copy()
        at += array.nbytes
        return array.reshape(-1, width) if width > 1 else array
    i = vec("<u4").reshape(-1, 3)
    p = vec("<f4").reshape(-1, 3)
    uv = vec("<f4", 2)
    vec("<f4", 4)
    at += 8
    ids = vec("<u8")
    assert at == len(b)
    return p, i, uv, ids

def rotation(r):
    x, y, z = np.radians(r)
    rx = np.array([[1,0,0],[0,math.cos(x),-math.sin(x)],[0,math.sin(x),math.cos(x)]])
    ry = np.array([[math.cos(-y),0,math.sin(-y)],[0,1,0],[-math.sin(-y),0,math.cos(-y)]])
    rz = np.array([[math.cos(z),-math.sin(z),0],[math.sin(z),math.cos(z),0],[0,0,1]])
    return rz @ ry @ rx

# Match RLViser's ObjectNode overrides / InfoNode transforms, then mirror world Z
# to this viewer's replay basis (x, z, -y). Reflection also changes triangle winding.
parts = []
provenance = []
include = {"FFCage_Full", "Field_STD_Frame", "Field_STD_Trim", "Field_STD_TrimB",
           "Field_Center_Trim", "Field_CenterVent", "Field_Mid_A", "Goal_STD_Frame",
           "Goal_STD_Trim", "Goal_STD_Quarterpipe", "Goal_STD_Glass_Outer"}
for top in json.loads((REF / "stadium.json").read_text()):
    for section in top.get("subNodes", []):
        for obj in section.get("subNodes", []):
            overridden = any(k in obj for k in ("Location", "Rotation", "Scale"))
            children = obj.get("subNodes", [])[:1] if overridden else obj.get("subNodes", [])
            for child in children:
                name = child.get("StaticMesh", "").split(".")[-1]
                if name not in include: continue
                node = child.copy()
                if overridden:
                    for key in ("Rotation", "Scale"): node[key] = obj.get(key, [0,0,0] if key == "Rotation" else [1,1,1])
                    node["Translation"] = obj.get("Location", [0,0,0])
                p, i, uv, ids = cached_mesh(name)
                scale = np.array(node.get("Scale", [1,1,1]))[[0,2,1]]
                matrix = np.diag([1,1,-1]) @ rotation(node.get("Rotation", [0,0,0])) @ np.diag(scale)
                translation = np.array(node.get("Translation", [0,0,0]))[[0,2,1]] * [1,1,-1]
                p = (p @ matrix.T + translation) * .01
                if np.linalg.det(matrix) > 0: i = i[:,[0,2,1]]
                for material, label in enumerate(node.get("Materials", [""])):
                    selected = i[(ids[i[:,0]] == material) if len(ids) else np.ones(len(i),dtype=bool)]
                    if not len(selected): continue
                    group = 0
                    if name == "FFCage_Full": group = 4
                    elif "Glass" in name: group = 3
                    elif name == "Goal_STD_Frame" or "Team" in label or "Light" in label or "GoalGenerator" in label:
                        group = 1 if np.mean(p[:,2]) >= 0 else 2
                    parts.append((p, selected, uv, group))
                provenance.append({"mesh":name,"translation":translation.tolist(),"scale":scale.tolist(),"bounds":[p.min(0).tolist(),p.max(0).tolist()]})
write_mesh("stadium", parts, 5)
(OUT / "stadium-sources.json").write_text(json.dumps(provenance, indent=2)+"\n")

# Jako's glTF separates the real windows, chassis, paint and trim. Raw body vertices
# are already at the Rocket League physics origin, unlike the presentation node matrix.
gltf = json.loads((REF / "octane.gltf").read_text())
binary = (REF / "octane.bin").read_bytes()
def accessor(index):
    a = gltf["accessors"][index]; v = gltf["bufferViews"][a["bufferView"]]
    dtype = {5126:"<f4",5125:"<u4",5123:"<u2"}[a["componentType"]]
    width = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    at = v.get("byteOffset",0) + a.get("byteOffset",0)
    stride = v.get("byteStride",np.dtype(dtype).itemsize*width)
    return np.ndarray((a["count"],width),dtype=dtype,buffer=binary,offset=at,strides=(stride,np.dtype(dtype).itemsize)).copy()

def primitive(mesh_index, group):
    p = gltf["meshes"][mesh_index]["primitives"][0]
    pos = accessor(p["attributes"]["POSITION"])[:,[0,2,1]] * [1,1,-1]
    uv = accessor(p["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in p["attributes"] else np.zeros((len(pos),2))
    # RH -> LH winding. The Z-up -> Y-up transform above has positive determinant.
    ids = accessor(p["indices"]).reshape(-1,3)[:,[0,2,1]]
    return pos, ids, uv, group
write_mesh("octane", [primitive(i,i) for i in range(4)], 4)
write_mesh("wheel", [primitive(4,0),primitive(5,1)], 2)
for source, name in [("octane-chassis.png","octane-chassis.webp"),("octane-metal.png","octane-metal.webp")]:
    image = Image.open(REF / source)
    image.thumbnail((1024,1024))
    image.save(OUT / name, quality=93)
(OUT / "LICENSE.octane.txt").write_text((REF / "octane-license.txt").read_text())
