"""Geometry regressions: native Octane proportions, wheel clearance, curved wall contact.

Uses the baked assets and three recorded poses from a wall-driving segment. Replay
identities and saves are not needed. Run: python scripts/test-studio-meshes.py
"""
import base64
import re
import struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
def mesh(name):
    b = (ROOT / f"app/public/viewer/{name}.mesh").read_bytes()
    nv, ni, nu, nm = struct.unpack_from("<4I", b)
    p = np.frombuffer(b, "<f4", nv*3, 16).reshape(-1,3)
    i = np.frombuffer(b, "<u4", ni, 16+nv*12).reshape(-1,3)
    assert i.max() < nv
    assert len(b) == 16+nv*12+ni*4+nu*4+ni//3
    return p, i, nm

body, body_i, materials = mesh("octane")
assert materials == 4, "Chassis, trim, team paint and windows must remain separate"
assert len(body_i) == 28478, "Keep the original Octane body triangles"
assert np.allclose(body.min(0), [-.6031845,-.1195534,-.3621232], atol=.001)
assert np.allclose(body.max(0), [.7956201,.4349589,.3625329], atol=.001)
wheel, _, materials = mesh("wheel")
assert materials == 2, "Rim and tread must remain separate"
assert abs(np.max(np.linalg.norm(wheel[:,[0,1]],axis=1))-.16313) < .0001
stadium, _, _ = mesh("stadium")
assert stadium[:,2].max() > 61 and stadium[:,2].min() < -61, "Both goal modules extend outwards"

source = (ROOT / "app/src/arenaMesh.ts").read_text(encoding="utf-8")
nv = int(re.search(r"ARENA_VERTS\s*=\s*(\d+)",source)[1])
packed = base64.b64decode(re.search(r'ARENA_B64\s*=\s*["\x27]([^"\x27]+)',source)[1])
verts = np.frombuffer(packed,"<i2",nv*3).reshape(-1,3)/500
ids = np.frombuffer(packed,"<u2",offset=nv*6).reshape(-1,3)
triangles = verts[ids]
edge1, edge2 = triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0]

def distance(origin, direction):
    cross = np.cross(direction, edge2)
    determinant = np.sum(edge1*cross,axis=1)
    usable = abs(determinant)>1e-8
    inverse = np.zeros(len(determinant)); inverse[usable]=1/determinant[usable]
    offset = origin-triangles[:,0]
    u = np.sum(offset*cross,axis=1)*inverse
    q = np.cross(offset,edge1)
    v = np.sum(q*direction,axis=1)*inverse
    t = np.sum(edge2*q,axis=1)*inverse
    good = usable & (u>=0) & (v>=0) & (u+v<=1) & (t>0)
    assert np.any(good), "Driving surface is missing below this wall pose"
    return t[good].min()

def rotate(vector, q):
    xyz, w = np.array(q[:3]), q[3]
    return vector + 2*np.cross(xyz, np.cross(xyz,vector)+w*vector)

poses = [
    ([-4046.9,-2276.64,139.9],[.37641528,-.32764074,.6659451,-.554509]),
    ([-4070.46,-3725.33,345.1],[.5839946,-.4001093,.5234996,-.47414237]),
    ([-3407.01,-4632.91,688.76],[.6807719,-.18809299,.35510033,-.61243314]),
]
for n, (position, rotation) in enumerate(poses):
    origin = np.array(position)[[0,2,1]]*[.01,.01,-.01]
    q = [rotation[0],rotation[2],-rotation[1],rotation[3]]
    down = -rotate(np.array([0.,1.,0.]),q)
    gap = distance(origin,down)
    assert .14 < gap < .19, f"Pose {n}: arena diverged from recorded wall contact ({gap})"
    if n == 2:
        for x,y,track,radius in [( .5125,-.0425,.259,.125),(-.3375,-.0175,.295,.15)]:
            for side in [-1,1]:
                axle = origin+rotate(np.array([x,y,side*track]),q)
                gap = distance(axle,down)-radius
                assert abs(gap)<.007, f"Octane tire floats or clips at the corner ({gap})"
print("Studio mesh checks passed: Octane shape/materials, true tire radius, both goal transforms, lower cove/corner contacts, four tires within 7 mm.")
