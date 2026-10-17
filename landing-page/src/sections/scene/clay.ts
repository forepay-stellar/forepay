import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Matte clay pieces of the hero, built in code from the 3D stage in forepay.pen
// (Landing / Desktop → Hero → 3D stage, 616 × 640). One unit is 100 design pixels.
// Gradients from the design are painted into vertex colours so the light only adds shading.

type Paint = (x: number, y: number, z: number) => string | THREE.Color;

const tmp = new THREE.Color();

function paint(geometry: THREE.BufferGeometry, fn: Paint) {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    tmp.set(c);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const mix = (a: string, b: string, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Welds the extrusion and recomputes normals so the bevel shades as one soft surface.
function soften(g: THREE.BufferGeometry) {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

// A soft, pillowy slab: a rounded rectangle extruded with a deep bevel, centred on z.
function slab(w: number, h: number, r: number, depth: number, bevel: number, segments: number) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, Math.max(0.01, r - bevel)), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: segments * 2,
  });
  g.translate(0, 0, -depth / 2);
  return soften(g);
}

function disc(radius: number, depth: number, bevel: number, segments: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius - bevel, 0, Math.PI * 2, false);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: segments * 6,
  });
  g.translate(0, 0, -depth / 2);
  return soften(g);
}

export function makeClayMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
}

// Vertical gradient top → bottom across a height h centred on 0.
const vertical = (top: string, bottom: string, h: number): Paint => (_x, y) => mix(top, bottom, 0.5 - y / h);

export function walletGeometries(detail: number) {
  const body = paint(slab(3.6, 2.36, 0.6, 0.7, 0.22, detail), vertical("#FA9156", "#DE4F07", 2.36));
  const flap = paint(slab(3.0, 1.6, 0.44, 0.3, 0.12, detail), vertical("#FDD9BC", "#F6B98C", 1.6));
  const slot = paint(slab(2.0, 0.16, 0.08, 0.06, 0.03, 2), () => "#8A3207");
  const clasp = paint(slab(0.96, 0.92, 0.3, 0.26, 0.1, detail), vertical("#B4470F", "#7E2C05", 0.92));
  const button = paint(new THREE.SphereGeometry(0.11, 16 * detail, 12 * detail), vertical("#FFE2CC", "#F2B48A", 0.22));
  return { body, flap, slot, clasp, button };
}

// The wave on a coin face: one period of a sine, as a round tube.
function wave(halfWidth: number, amplitude: number, thickness: number, y: number, detail: number) {
  const points = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    return new THREE.Vector3(-halfWidth + t * halfWidth * 2, y + Math.sin(t * Math.PI * 2) * amplitude, 0);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24 * detail, thickness, 6 * detail, false);
}

// A coin of radius 1, scaled per coin. Rim darker, body a warm radial highlight,
// raised peach face and two rust waves, as in the design.
export function coinGeometries(detail: number) {
  const body = disc(1, 0.2, 0.08, detail * 2);
  paint(body, (x, y, z) => {
    if (z < 0.08) return mix("#C8500B", "#8A3207", 0.5 - y / 2);
    return mix("#FF9F66", "#E0560A", Math.hypot(x + 0.3, y - 0.4) / 1.6);
  });
  const face = paint(disc(0.72, 0.04, 0.03, detail * 2), (x, y) =>
    mix("#FFF6EE", "#FBD0AC", Math.hypot(x + 0.15, y - 0.2) / 1.0),
  );
  const waveTop = paint(wave(0.42, 0.065, 0.05, 0.17, detail), () => "#953202");
  const waveBottom = paint(wave(0.42, 0.065, 0.05, -0.17, detail), () => "#953202");
  return { body, face, waveTop, waveBottom };
}

// A soft round shadow, drawn once into a texture and laid on planes.
export function shadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(28,22,18,1)");
  g.addColorStop(0.45, "rgba(28,22,18,0.55)");
  g.addColorStop(1, "rgba(28,22,18,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
