// Polyhedral dice described as radial functions over one shared sphere mesh, so any die can morph
// into any other by blending radii. A die is the intersection of its face planes n·x = d; the
// surface radius along a direction u is d / max(n·u), and swapping that max for a p-norm rounds
// the edges (low p = pebble, high p = crisp).
import * as THREE from 'three';

const PHI = (1 + Math.sqrt(5)) / 2;
const D10_TILT = 0.7; // elevation of the d10's kite normals; sets how tall the die is
const vec = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const SIGNS = [1, -1];
const pairs = (fn) => SIGNS.flatMap((a) => SIGNS.flatMap((b) => fn(a, b)));

const NORMALS = {
  4: () => [vec(1, 1, 1), vec(1, -1, -1), vec(-1, 1, -1), vec(-1, -1, 1)],
  6: () => [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0), vec(0, 0, 1), vec(0, 0, -1)],
  8: () => pairs((a, b) => [vec(a, b, 1), vec(a, b, -1)]),
  10: () => Array.from({ length: 10 }, (_, k) => {
    const theta = (k * Math.PI) / 5;
    const y = (k % 2 ? -1 : 1) * Math.sin(D10_TILT);
    return vec(Math.cos(D10_TILT) * Math.cos(theta), y, Math.cos(D10_TILT) * Math.sin(theta));
  }),
  12: () => pairs((a, b) => [vec(0, a, b * PHI), vec(a, b * PHI, 0), vec(b * PHI, 0, a)]),
  20: () => [
    ...pairs((a, b) => [vec(a, b, 1), vec(a, b, -1)]),
    ...pairs((a, b) => [vec(0, a / PHI, b * PHI), vec(a / PHI, b * PHI, 0), vec(b * PHI, 0, a / PHI)]),
  ],
};

// radius: circumradius in world units. label: numeral size as a multiple of the inradius.
const SPECS = {
  4: { radius: 1.25, label: 0.85 },
  6: { radius: 0.98, label: 1.05 },
  8: { radius: 1.1, label: 0.82 },
  10: { radius: 1.1, label: 0.62 },
  12: { radius: 1.06, label: 0.9 },
  20: { radius: 1.1, label: 0.6 },
};
export { DIE_SIDES } from './pool.js';

/** Edge rounding 0 (crisp) … 1 (pebble) → p-norm exponent. */
export const sharpness = (rounding) => 40 - 32 * rounding;

export function radiusAt(die, x, y, z, p) {
  const { n } = die;
  let m = 0;
  for (let k = 0; k < n.length; k += 3) m = Math.max(m, n[k] * x + n[k + 1] * y + n[k + 2] * z);
  let s = 0;
  for (let k = 0; k < n.length; k += 3) {
    const dot = n[k] * x + n[k + 1] * y + n[k + 2] * z;
    if (dot > 0) s += (dot / m) ** p;
  }
  return die.d / (m * s ** (1 / p));
}

export function shapeRadii(die, dirs, p) {
  const out = new Float32Array(dirs.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = radiusAt(die, dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], p);
  return out;
}

/**
 * The sharp polyhedron as vertices plus faces wound counter-clockwise from outside, scaled by
 * `scale`. Vertices are where three face planes meet without poking through any other plane.
 */
export function hull(die, scale = 1) {
  const { n, d } = die;
  const planes = [];
  for (let k = 0; k < n.length; k += 3) planes.push(new THREE.Vector3(n[k], n[k + 1], n[k + 2]));
  const inside = (x) => planes.every((p) => p.dot(x) <= d + 1e-6);
  const vertices = [];
  const m = new THREE.Matrix3();
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const [a, b, c] = [planes[i], planes[j], planes[k]];
        m.set(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        if (Math.abs(m.determinant()) < 1e-9) continue;
        const x = new THREE.Vector3(d, d, d).applyMatrix3(m.invert());
        if (inside(x) && !vertices.some((v) => v.distanceToSquared(x) < 1e-10)) vertices.push(x);
      }
    }
  }
  const faces = planes.map((p) => {
    const ids = vertices.flatMap((v, i) => (Math.abs(p.dot(v) - d) < 1e-6 ? [i] : []));
    const centre = ids.reduce((s, i) => s.add(vertices[i]), new THREE.Vector3()).divideScalar(ids.length);
    const u = vertices[ids[0]].clone().sub(centre).normalize();
    const w = new THREE.Vector3().crossVectors(p, u);
    const angle = (i) => { const r = vertices[i].clone().sub(centre); return Math.atan2(r.dot(w), r.dot(u)); };
    return ids.sort((x, y) => angle(x) - angle(y));
  });
  return { vertices: vertices.map((v) => v.multiplyScalar(scale)), faces };
}

const cache = new Map();

/**
 * Face planes, numeral placements and resting outcomes for a die, measured against `dirs`.
 * The 'tens' variant is the percentile d10, numbered 00–90.
 */
export function buildDie(sides, dirs, variant = '') {
  const cacheKey = `${sides}${variant}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const normals = NORMALS[sides]();
  const n = new Float32Array(normals.flatMap((v) => [v.x, v.y, v.z]));
  const spec = SPECS[sides];

  // Measure the sharp solid at d = 1: circumradius for scale, and each face's centroid.
  const sums = normals.map(() => new THREE.Vector3());
  const counts = new Array(normals.length).fill(0);
  let maxR = 0;
  for (let i = 0; i < dirs.length; i += 3) {
    let best = -1, owner = 0;
    for (let k = 0; k < normals.length; k++) {
      const dot = n[k * 3] * dirs[i] + n[k * 3 + 1] * dirs[i + 1] + n[k * 3 + 2] * dirs[i + 2];
      if (dot > best) { best = dot; owner = k; }
    }
    const r = 1 / best;
    maxR = Math.max(maxR, r);
    sums[owner].x += dirs[i] * r; sums[owner].y += dirs[i + 1] * r; sums[owner].z += dirs[i + 2] * r;
    counts[owner]++;
  }
  const d = spec.radius / maxR;
  const size = spec.label * d;
  const centres = normals.map((nm, k) => {
    const c = sums[k].divideScalar(counts[k]).multiplyScalar(d);
    return c.addScaledVector(nm, d - nm.dot(c)); // back onto the face plane
  });

  // Opposite faces sum to sides + 1, as on real dice.
  const values = new Array(normals.length).fill(0);
  let next = 1;
  normals.forEach((nm, i) => {
    if (values[i]) return;
    const j = normals.findIndex((other, k) => !values[k] && k !== i && other.dot(nm) < -0.999);
    values[i] = next;
    if (j >= 0) values[j] = sides + 1 - next;
    next++;
  });

  const tens = variant === 'tens';
  const text = (value) => (tens ? (value === 10 ? '00' : `${value}0`) : sides === 10 && value === 10 ? '0' : String(value));
  const label = (value, centre, normal, up, scale = 1) => ({
    text: text(value), underline: !tens && sides >= 8 && (value === 6 || value === 9), centre, normal, up, size: size * scale,
  });
  let labels, outcomes;

  if (sides === 4) {
    // A d4 lands on a face; its result is the number at the top vertex, printed on all three faces.
    const vertices = normals.map((nm) => nm.clone().multiplyScalar(-3 * d));
    labels = normals.flatMap((nm, j) => vertices.flatMap((v, i) => {
      if (i === j) return [];
      const toVertex = v.clone().sub(centres[j]);
      return [label(i + 1, centres[j].clone().addScaledVector(toVertex, 0.47), nm, toVertex.normalize())];
    }));
    outcomes = vertices.map((v, i) => {
      const up = v.clone().normalize();
      const face = normals[(i + 1) % 4];
      return { value: i + 1, up, front: face.clone().addScaledVector(up, -face.dot(up)).normalize() };
    });
  } else {
    labels = normals.map((nm, k) => {
      const ref = sides === 10 ? new THREE.Vector3(0, Math.sign(nm.y), 0)
        : Math.abs(nm.y) > 0.99 ? new THREE.Vector3(0, 0, -Math.sign(nm.y)) : new THREE.Vector3(0, 1, 0);
      const up = ref.addScaledVector(nm, -ref.dot(nm)).normalize();
      return label(values[k], centres[k], nm, up);
    });
    outcomes = labels.map((l, k) => ({ value: values[k], up: l.normal, front: l.up.clone().negate() }));
  }

  const die = { sides, variant, n, d, labels, outcomes };
  cache.set(cacheKey, die);
  return die;
}

/**
 * A rotation of the die onto itself carrying body direction `from` to `to` (both outcome ups).
 * Physics decides which face lands up; turning the numbering by this symmetry shows the rolled
 * value there instead, without changing the die's shape or how it moved.
 */
export function symmetry(die, from, to) {
  if (from.distanceToSquared(to) < 1e-8) return new THREE.Quaternion();
  const normals = [];
  for (let k = 0; k < die.n.length; k += 3) normals.push(new THREE.Vector3(die.n[k], die.n[k + 1], die.n[k + 2]));
  const ups = die.outcomes.map((o) => o.up);
  let ref = null, best = -2;
  for (const u of ups) {
    const c = u.dot(from);
    if (c < 0.999 && c > best) { best = c; ref = u; }
  }
  const frame = (a, b) => {
    const y = b.clone().addScaledVector(a, -b.dot(a)).normalize();
    return new THREE.Matrix4().makeBasis(a, y, new THREE.Vector3().crossVectors(a, y));
  };
  const fromFrame = frame(from, ref).transpose();
  for (const candidate of ups) {
    if (Math.abs(candidate.dot(to) - best) > 1e-4) continue;
    const m = frame(to, candidate).multiply(fromFrame);
    const maps = normals.every((nm) => {
      const r = nm.clone().applyMatrix4(m);
      return normals.some((o) => o.distanceToSquared(r) < 1e-6);
    });
    if (maps) return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  throw new Error(`No symmetry of d${die.sides} maps those faces`);
}
