// Offline dice throws: the whole throw is simulated up front with cannon-es and recorded, so it
// can be replayed smoothly, identically for everyone with the same seed, and relabelled to show
// a value decided elsewhere (see `symmetry` in dice.js).
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { hull, radiusAt } from './dice.js';

export const TRAY = { hx: 3.4, hz: 2.3 };
const STEP = 1 / 120;
const RECORD_EVERY = 2;
export const FRAME_TIME = STEP * RECORD_EVERY;
const STRIDE = 7; // x, y, z, qx, qy, qz, qw

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Dice shrink a little in big pools so a handful still fits the tray. */
export const poolScale = (count) => (count <= 3 ? 1 : count <= 6 ? 0.8 : 0.66);

function hullShape(die, p, scale) {
  const n = die.n;
  const { vertices, faces } = hull(die, (radiusAt(die, n[0], n[1], n[2], p) / die.d) * scale);
  return new CANNON.ConvexPolyhedron({ vertices: vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), faces });
}

/**
 * Throws `dice` ([{ die, p }]) into a walled tray. Returns per-die recorded frames, which outcome
 * each die settled on, impact sounds and the shared scale.
 */
export function simulateThrow(dice, { seed, tray = TRAY, maxTime = 6 } = {}) {
  const rng = mulberry32(seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -45, 0), allowSleep: true });
  world.solver.iterations = 14;
  const dieMat = new CANNON.Material('die');
  const feltMat = new CANNON.Material('felt');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, feltMat, { friction: 0.38, restitution: 0.32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, wallMat, { friction: 0.15, restitution: 0.55 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.06, restitution: 0.35 }));

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: feltMat });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const { hx, hz } = tray;
  for (const [ex, ez, x, z] of [[0.5, hz + 1, -(hx + 0.5), 0], [0.5, hz + 1, hx + 0.5, 0], [hx + 1, 0.5, 0, -(hz + 0.5)], [hx + 1, 0.5, 0, hz + 0.5]]) {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(ex, 8, ez)), material: wallMat });
    wall.position.set(x, 8, z);
    world.addBody(wall);
  }

  // The dice leave the hand as a loose cluster on one side and fly across the tray.
  const scale = poolScale(dice.length);
  const angle = rng() * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle) * 0.7).normalize();
  const cols = Math.ceil(Math.sqrt(dice.length));
  const gap = 2.4 * scale;
  const width = (cols - 1) * gap;
  const start = dir.clone().multiplyScalar(-Math.max(0.3, Math.min(hx, hz) - width / 2 - 1.2 * scale));
  const sounds = [];
  let time = 0;

  const bodies = dice.map(({ die, p }, i) => {
    const body = new CANNON.Body({
      mass: 1, material: dieMat, shape: hullShape(die, p, scale),
      linearDamping: 0.1, angularDamping: 0.14, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.35,
    });
    const col = i % cols, row = Math.floor(i / cols);
    body.position.set(
      THREE.MathUtils.clamp(start.x + (col - (cols - 1) / 2) * gap + (rng() - 0.5) * 0.3, -hx + 1, hx - 1),
      2.6 + (row % 2) * gap * 0.6 + rng() * 0.4,
      THREE.MathUtils.clamp(start.z + (row - (Math.ceil(dice.length / cols) - 1) / 2) * gap + (rng() - 0.5) * 0.3, -hz + 1, hz - 1),
    );
    body.quaternion.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    // Each die fans out a little from the throw line so a handful spreads across the felt.
    const fan = dice.length > 1 ? (rng() - 0.5) * 0.9 : 0;
    const speed = 5 + rng() * 2.5;
    const vx = dir.x * Math.cos(fan) - dir.z * Math.sin(fan), vz = dir.x * Math.sin(fan) + dir.z * Math.cos(fan);
    body.velocity.set(vx * speed, -2 - rng() * 2, vz * speed);
    const spin = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).multiplyScalar(-(14 + rng() * 8));
    spin.add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(10));
    body.angularVelocity.set(spin.x, spin.y, spin.z);
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const last = sounds[sounds.length - 1];
      if (v > 0.8 && !(last && time - last.t < 0.02 && last.die === i)) sounds.push({ t: time, v, die: i });
    });
    world.addBody(body);
    return body;
  });

  const tracks = bodies.map(() => []);
  const record = () => bodies.forEach((b, i) => tracks[i].push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
  record();
  let quiet = 0; // recorded frames in a row where nothing visibly moves
  for (let step = 1; time < maxTime; step++) {
    world.step(STEP);
    time += STEP;
    if (step % RECORD_EVERY === 0) {
      record();
      const still = bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.08 && b.angularVelocity.length() < 0.3));
      quiet = still ? quiet + 1 : 0;
      if (quiet >= 30) break;
    }
  }

  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  // Clean means every die lies flat on the felt: none cocked against another or the wall and none
  // stacked. A die still trembling by a hair when time runs out is fine.
  let clean = true;
  const landed = bodies.map((b, i) => {
    const { die, p } = dice[i];
    q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    let best = 0, top = -Infinity;
    die.outcomes.forEach((o, k) => {
      const y = v.copy(o.up).applyQuaternion(q).y;
      if (y > top) { top = y; best = k; }
    });
    const n = die.n;
    const restHeight = radiusAt(die, n[0], n[1], n[2], p) * scale;
    if (top < 0.985 || b.position.y > restHeight + 0.12) clean = false;
    return best;
  });
  return { tracks: tracks.map((t) => new Float32Array(t)), frames: tracks[0]?.length / STRIDE || 0, landed, sounds, scale, duration: time, clean };
}

/** Like a player re-rolling a cocked die: retry with derived seeds until every die lies flat. */
export function throwDice(dice, { seed, tray } = {}) {
  const started = performance.now();
  let result;
  for (let attempt = 0; attempt < 6; attempt++) {
    result = simulateThrow(dice, { seed: (seed + attempt * 7919) >>> 0, tray });
    if (result.clean || performance.now() - started > 700) break;
  }
  return result;
}

/** Pose of die `i` at time `t` (seconds), interpolated between recorded frames. */
export function sampleTrack(track, t, position, quaternion) {
  const frames = track.length / STRIDE;
  const f = Math.min(t / FRAME_TIME, frames - 1);
  const i = Math.floor(f), j = Math.min(i + 1, frames - 1), k = f - i;
  const a = i * STRIDE, b = j * STRIDE;
  position.set(
    track[a] + (track[b] - track[a]) * k,
    track[a + 1] + (track[b + 1] - track[a + 1]) * k,
    track[a + 2] + (track[b + 2] - track[a + 2]) * k,
  );
  quaternion.set(track[a + 3], track[a + 4], track[a + 5], track[a + 6]);
  if (k > 0) quaternion.slerp(new THREE.Quaternion(track[b + 3], track[b + 4], track[b + 5], track[b + 6]), k);
}

/** Dice clatter, synthesised: a short filtered noise burst per impact. */
let audio = null;
let noise = null;
export function clack(strength = 1) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate * 0.06, audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 2600;
    filter.Q.value = 3;
    const gain = audio.createGain();
    gain.gain.value = Math.min(0.5, 0.05 + strength * 0.045);
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* audio unavailable */ }
}
