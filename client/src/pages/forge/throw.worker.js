// Runs dice throws off the main thread so a big handful never stalls the page.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildDie, sharpness } from './dice.js';
import { throwDice } from './physics.js';

// The same shared sphere the stage uses, so die definitions (and outcome indices) match exactly.
let dirs = null;
function sphereDirs() {
  if (dirs) return dirs;
  let sphere = new THREE.IcosahedronGeometry(1, 50);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  sphere = mergeVertices(sphere);
  dirs = sphere.attributes.position.array;
  return dirs;
}

self.onmessage = ({ data: { id, dice, seed, tray } }) => {
  const d = sphereDirs();
  const result = throwDice(dice.map(({ sides, variant, rounding }) => ({ die: buildDie(sides, d, variant), p: sharpness(rounding) })), { seed, tray });
  self.postMessage({ id, ...result }, result.tracks.map((t) => t.buffer));
};
