// Imperative three.js scene for dice. In the Forge it shows one showcase die in a felt tray that
// morphs between shapes and tweens its finish; rolls throw a whole pool with physics recorded in
// a worker and replayed, then the camera flies over the top to read the result. As an overlay on
// the battle table it is transparent and just plays shared throws.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildDie, radiusAt, shapeRadii, sharpness, symmetry } from './dice.js';
import { TRAY, clack, sampleTrack } from './physics.js';

export const FINISHES = {
  resin: { label: 'Resin', roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
  marbled: { label: 'Marbled', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, swirl: 1 },
  pearl: { label: 'Pearl', roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15, iridescence: 1, sheen: 1 },
  metal: { label: 'Metal', roughness: 0.24, metalness: 1, clearcoat: 0, clearcoatRoughness: 0.2 },
  glass: { label: 'Glass', roughness: 0.05, metalness: 0, clearcoat: 0, clearcoatRoughness: 0, transmission: 1, thickness: 0.7, ior: 1.5, attenuationDistance: 1.4, inner: 0.32 },
  gem: { label: 'Gemstone', roughness: 0.02, metalness: 0, clearcoat: 0, clearcoatRoughness: 0, transmission: 1, thickness: 1.1, ior: 2.1, dispersion: 5, iridescence: 0.35, attenuationDistance: 0.9, inner: 0.26 },
};
// inner: light scattered inside the body, so glass reads as lit colour rather than refracted darkness.
const FINISH_DEFAULTS = { inner: 0, transmission: 0, thickness: 0, ior: 1.5, dispersion: 0, iridescence: 0, sheen: 0, swirl: 0, attenuationDistance: 1000 };
const TWEENED = ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'dispersion', 'iridescence', 'sheen', 'attenuationDistance'];

export const FONTS = {
  royal: { label: 'Royal', family: '"Cinzel", serif', weight: 700 },
  modern: { label: 'Modern', family: '"Inter", sans-serif', weight: 700 },
  scholar: { label: 'Scholar', family: '"Cormorant Garamond", serif', weight: 600 },
  artificer: { label: 'Artificer', family: '"Courier New", monospace', weight: 700 },
};

/** Tray felt and the room around it. */
export const BACKDROPS = {
  emerald: { label: 'Emerald felt', felt: '#1c3a2b', room: '#0d0a08' },
  crimson: { label: 'Crimson velvet', felt: '#4a0f16', room: '#0b0607' },
  midnight: { label: 'Midnight', felt: '#141c38', room: '#04050b' },
  leather: { label: 'Saddle leather', felt: '#5a3a22', room: '#0e0905' },
  slate: { label: 'Slate', felt: '#383d45', room: '#0b0c0f' },
  void: { label: 'The Void', felt: '#0c0c0e', room: '#000000' },
};

const HOVER_Y = 1.6;
const MORPH_TIME = 0.9;
const WINDUP_TIME = 0.32;
const HOLD_TIME = 2.8;
const OVERLAY_HOLD = 2.6;
const RIM = { width: 0.3, height: 0.34 };
const GLOW = 2.6; // emissive multiplier for glowing numerals; >1 so the bloom pass picks them up
const POSES = {
  show: { eye: new THREE.Vector3(0, 4.6, 6.6), look: new THREE.Vector3(0, 1.1, 0) },
  tray: { eye: new THREE.Vector3(0, 6.9, 7.6), look: new THREE.Vector3(0, 0, 0.15) },
  overlay: { eye: new THREE.Vector3(0, 19, 7), look: new THREE.Vector3(0, 0, 0.4) },
};
const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const eye = new THREE.Vector3();
const tmpColor = new THREE.Color();
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

// Domain-warped fbm in object space for marbled resin; keyed to the sphere direction so the
// pattern stays put while the die morphs.
const SWIRL_GLSL = /* glsl */ `
  uniform vec3 uSwirlColor;
  uniform float uSwirl;
  varying vec3 vDir;
  float swHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float swNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(swHash(i), swHash(i + vec3(1, 0, 0)), f.x), mix(swHash(i + vec3(0, 1, 0)), swHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(swHash(i + vec3(0, 0, 1)), swHash(i + vec3(1, 0, 1)), f.x), mix(swHash(i + vec3(0, 1, 1)), swHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float swFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * swNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

function noiseTexture(repeatX, repeatY, low = 200) {
  const size = 256;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = low + Math.random() * (255 - low);
    img.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A gold disc with the die's value, floated over each die in a pool. */
function resultSprite(value, dropped) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fillStyle = dropped ? 'rgba(30, 24, 20, 0.88)' : 'rgba(26, 18, 10, 0.92)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = dropped ? '#6b5f52' : '#d4a85a';
  ctx.stroke();
  ctx.fillStyle = dropped ? '#8f8170' : '#f3d38f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${String(value).length > 2 ? 44 : 58}px "Cinzel", serif`;
  ctx.fillText(String(value), 64, 70);
  if (dropped) {
    ctx.strokeStyle = '#c0322b';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(26, 98);
    ctx.lineTo(102, 30);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, opacity: 0, sizeAttenuation: false }));
  sprite.renderOrder = 10;
  return sprite;
}

export class DiceStage {
  constructor(container, { onRoll, onSettle, onDone, overlay = false } = {}) {
    this.container = container;
    this.onRoll = onRoll;
    this.onSettle = onSettle;
    this.onDone = onDone;
    this.overlay = overlay;
    this.opts = { glow: 0, sound: true };
    this.mode = 'show'; // show | windup | roll | rest (overlay: idle | windup | roll | rest)
    this.flight = null; // camera path after a roll: over → hold → back
    this.spin = new THREE.Vector3(0.1, 0.55, 0.05);
    this.labelOpacity = 0;
    this.labelTarget = 1;
    this.labelMaterials = new Map();
    this.shapes = new Map();
    this.pool = [];
    this.tray = { ...TRAY };
    this.dim = 0;
    this.back = 1;
    this.look = (overlay ? POSES.overlay : POSES.show).look.clone();
    this.timer = new THREE.Timer();
    this.jobs = new Map();
    this.worker = new Worker(new URL('./throw.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.jobs.get(data.id)?.(data);

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: overlay, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (overlay) renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    if (!overlay) {
      scene.background = new THREE.Color('#0d0a08');
      scene.fog = new THREE.Fog('#0d0a08', 8, 17);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);

    // Bloom only catches HDR values, i.e. glowing numerals, the morph flash and hot specular glints.
    // The overlay renders straight to a transparent canvas instead.
    if (!overlay) {
      this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.15, 0.22, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.buildTray();
    } else {
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
      catcher.rotation.x = -Math.PI / 2;
      catcher.receiveShadow = true;
      scene.add(catcher);
    }

    const key = this.key = new THREE.SpotLight('#ffd9a8', 140, 0, overlay ? 0.9 : 0.62, 0.8, 2);
    key.position.set(2.4, overlay ? 10 : 7.5, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    scene.add(key, key.target);
    this.rim = new THREE.DirectionalLight('#8b7cf6', 1.1);
    this.rim.position.set(-3.5, 3, -4.5);
    this.hemi = new THREE.HemisphereLight('#c9d6ff', '#24170e', overlay ? 0.8 : 0.35);
    scene.add(this.rim, this.hemi);
    this.flash = new THREE.PointLight('#ffffff', 0, 6, 2);
    this.glowLight = new THREE.PointLight('#ffffff', 0, 4.5, 2); // numerals spilling light onto the felt
    scene.add(this.flash, this.glowLight);

    // Every die shares this sphere's vertices; only the radii change.
    let sphere = new THREE.IcosahedronGeometry(1, 50);
    sphere.deleteAttribute('normal');
    sphere.deleteAttribute('uv');
    sphere = mergeVertices(sphere);
    this.dirs = sphere.attributes.position.array.slice();
    this.dirAttr = new THREE.BufferAttribute(this.dirs, 3);
    sphere.setAttribute('dir', this.dirAttr);
    sphere.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.geometry = sphere;

    this.material = new THREE.MeshPhysicalMaterial({ sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4, iridescenceIOR: 1.3 });
    this.swirlUniforms = { uSwirlColor: { value: new THREE.Color() }, uSwirl: { value: 0 } };
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.swirlUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 dir;\nvarying vec3 vDir;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = dir;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SWIRL_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 swP = vDir * 2.1;
          vec3 swQ = vec3(swFbm(swP), swFbm(swP + vec3(5.2, 1.3, 2.8)), swFbm(swP + vec3(2.1, 7.7, 4.4)));
          float swBand = 0.5 + 0.5 * sin(swFbm(swP + 3.2 * swQ) * 15.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSwirlColor, smoothstep(0.35, 0.8, swBand) * uSwirl);`);
    };
    this.target = {
      color: new THREE.Color(), swirlColor: new THREE.Color(), ink: new THREE.Color(), finish: FINISHES.resin,
      felt: new THREE.Color(), room: new THREE.Color(), floor: new THREE.Color(),
    };

    // The showcase die (Forge only) has its own geometry so it can morph.
    this.die = new THREE.Group();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.labels = new THREE.Group();
    this.die.add(this.mesh, this.labels);
    this.die.position.set(0, HOVER_Y, 0);
    this.die.quaternion.setFromEuler(new THREE.Euler(0.5, 0.4, 0.2));
    this.die.visible = !overlay;
    if (overlay) this.mode = 'idle';
    scene.add(this.die);

    if (!overlay) this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    renderer.setAnimationLoop((time) => this.frame(time));
  }

  // ── Scene: a felt tray in a wooden frame on a dark table ───────────────────
  buildTray() {
    const { hx, hz } = this.tray;
    const { width: rim, height } = RIM;
    this.feltMap = noiseTexture(10, 7);
    this.woodMap = noiseTexture(1, 8, 150);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.01;
    this.floor.receiveShadow = true;
    this.felt = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), new THREE.MeshStandardMaterial({ roughness: 0.97, map: this.feltMap }));
    this.felt.rotation.x = -Math.PI / 2;
    this.felt.receiveShadow = true;
    this.scene.add(this.floor, this.felt);

    const wood = new THREE.MeshPhysicalMaterial({ color: '#3d2414', roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, map: this.woodMap });
    const sides = [
      [hx * 2 + rim * 2, rim, 0, -(hz + rim / 2)], [hx * 2 + rim * 2, rim, 0, hz + rim / 2],
      [rim, hz * 2, -(hx + rim / 2), 0], [rim, hz * 2, hx + rim / 2, 0],
    ];
    for (const [w, d, x, z] of sides) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wood);
      bar.position.set(x, height / 2, z);
      bar.castShadow = bar.receiveShadow = true;
      this.scene.add(bar);
    }
  }

  // ── Shapes: geometry and numerals per die type, shared by every die of that type ──
  shapeFor(sides, variant = '') {
    const p = sharpness(this.opts.rounding ?? 0.45);
    const key = `${sides}${variant}:${p}`;
    let shape = this.shapes.get(key);
    if (shape) return shape;
    const die = buildDie(sides, this.dirs, variant);
    const radii = shapeRadii(die, this.dirs, p);
    shape = { key, die, p, radii, geometry: null, labelGeos: null };
    this.shapes.set(key, shape);
    return shape;
  }

  /** A static copy of the shape's mesh for pool dice. */
  shapeGeometry(shape) {
    if (shape.geometry) return shape.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(this.geometry.index);
    geo.setAttribute('dir', this.dirAttr);
    const pos = new Float32Array(this.dirs.length);
    for (let i = 0; i < shape.radii.length; i++) {
      pos[i * 3] = this.dirs[i * 3] * shape.radii[i];
      pos[i * 3 + 1] = this.dirs[i * 3 + 1] * shape.radii[i];
      pos[i * 3 + 2] = this.dirs[i * 3 + 2] * shape.radii[i];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    shape.geometry = geo;
    return geo;
  }

  /** Numerals are small grids draped over the actual surface, so they hug rounded faces. */
  labelGeometries(shape) {
    if (shape.labelGeos) return shape.labelGeos;
    const { die, p } = shape;
    const SEG = 6;
    const right = new THREE.Vector3();
    const point = new THREE.Vector3();
    shape.labelGeos = die.labels.map((l) => {
      right.crossVectors(l.up, l.normal);
      const geo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        point.copy(l.centre).addScaledVector(right, pos.getX(i) * l.size).addScaledVector(l.up, pos.getY(i) * l.size).normalize();
        const r = radiusAt(die, point.x, point.y, point.z, p) + 0.004;
        pos.setXYZ(i, point.x * r, point.y * r, point.z * r);
      }
      geo.computeVertexNormals();
      return { geo, text: l.text, underline: l.underline };
    });
    return shape.labelGeos;
  }

  fillLabels(group, shape) {
    group.clear();
    for (const { geo, text, underline } of this.labelGeometries(shape)) group.add(new THREE.Mesh(geo, this.glyphMaterial(text, underline)));
  }

  /** Shapes depend on edge rounding; drop the ones for other roundings. */
  pruneShapes() {
    const p = sharpness(this.opts.rounding ?? 0.45);
    const inUse = new Set(this.pool.map((d) => d.shape.key));
    for (const [key, shape] of this.shapes) {
      if (shape.p === p || inUse.has(key)) continue;
      shape.geometry?.dispose();
      shape.labelGeos?.forEach((l) => l.geo.dispose());
      this.shapes.delete(key);
    }
  }

  // ── Options ────────────────────────────────────────────────────────────────
  setOptions(opts) {
    const prev = this.opts;
    this.opts = { glow: 0, sound: true, ...opts };
    const t = this.target;
    t.color.set(opts.body);
    t.swirlColor.set(opts.swirl);
    t.ink.set(opts.ink);
    t.finish = { ...FINISH_DEFAULTS, ...FINISHES[opts.finish] };
    if (!this.overlay) {
      t.felt.set(opts.felt);
      t.room.set(opts.room);
      t.floor.copy(t.room).offsetHSL(0, 0, 0.035);
    }
    if (!prev.body) this.snapLook();

    if (opts.rounding !== prev.rounding) this.pruneShapes();
    if (!this.overlay && (opts.sides !== prev.sides || opts.rounding !== prev.rounding)) {
      this.reshape(Boolean(prev.sides) && opts.sides !== prev.sides);
    }
    if (opts.font !== prev.font) this.redrawGlyphs();
  }

  reshape(morph) {
    const shape = this.shapeFor(this.opts.sides);
    this.shape = shape;
    this.toShowcase();
    if (morph) {
      this.morph = { from: this.radii.slice(), to: shape.radii, t: 0 };
      this.labelTarget = 0;
      this.spin.y += 7;
    } else if (this.morph) {
      this.morph.to = shape.radii;
    } else {
      this.radii = shape.radii;
      this.applyRadii(1);
      this.fillLabels(this.labels, shape);
    }
  }

  applyRadii(inflate, radii = this.radii) {
    const pos = this.geometry.attributes.position.array;
    const { dirs } = this;
    for (let i = 0; i < radii.length; i++) {
      const r = radii[i] * inflate;
      pos[i * 3] = dirs[i * 3] * r;
      pos[i * 3 + 1] = dirs[i * 3 + 1] * r;
      pos[i * 3 + 2] = dirs[i * 3 + 2] * r;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** First paint: jump straight to the chosen look instead of fading in from black. */
  snapLook() {
    const { finish, color, swirlColor, felt, room, floor } = this.target;
    for (const key of TWEENED) this.material[key] = finish[key];
    this.material.color.copy(color);
    this.material.attenuationColor.copy(color);
    this.material.emissive.copy(color).multiplyScalar(finish.inner);
    this.swirlUniforms.uSwirlColor.value.copy(swirlColor);
    this.swirlUniforms.uSwirl.value = finish.swirl;
    if (!this.overlay) {
      this.felt.material.color.copy(felt);
      this.scene.background.copy(room);
      this.scene.fog.color.copy(room);
      this.floor.material.color.copy(floor);
    }
    this.dim = this.opts.glow;
  }

  tweenLook(dt) {
    const k = 1 - Math.exp(-dt * 7);
    const { finish, color, swirlColor, ink, felt, room, floor } = this.target;
    for (const key of TWEENED) {
      const v = this.material[key] + (finish[key] - this.material[key]) * k;
      // Snap to the target so features like transmission switch fully off.
      this.material[key] = Math.abs(v - finish[key]) < 0.002 ? finish[key] : v;
    }
    this.material.color.lerp(color, k);
    this.material.attenuationColor.lerp(color, k);
    this.material.emissive.lerp(tmpColor.copy(color).multiplyScalar(finish.inner), k);
    this.swirlUniforms.uSwirlColor.value.lerp(swirlColor, k);
    this.swirlUniforms.uSwirl.value += (finish.swirl - this.swirlUniforms.uSwirl.value) * k;

    // Glowing numerals dim the room so they carry the scene.
    this.dim += (this.opts.glow - this.dim) * (1 - Math.exp(-dt * 4));
    const lerp = THREE.MathUtils.lerp;
    if (!this.overlay) {
      this.felt.material.color.lerp(felt, k);
      this.scene.background.lerp(room, k);
      this.scene.fog.color.lerp(room, k);
      this.floor.material.color.lerp(floor, k);
      this.key.intensity = lerp(140, 55, this.dim);
      this.rim.intensity = lerp(1.1, 0.45, this.dim);
      this.hemi.intensity = lerp(0.35, 0.08, this.dim);
      this.scene.environmentIntensity = lerp(0.55, 0.2, this.dim);
      this.bloom.strength = lerp(0.15, 0.75, this.dim);
      this.bloom.threshold = lerp(1.3, 0.92, this.dim); // without glow, only true highlights bloom
      this.glowLight.color.copy(ink);
      this.glowLight.intensity = 4 * this.dim * this.labelOpacity * (this.die.visible ? 1 : 0);
      this.glowLight.position.copy(this.die.position);
    }
    for (const m of this.labelMaterials.values()) {
      m.color.lerp(ink, k);
      m.emissive.lerp(ink, k);
      m.emissiveIntensity = GLOW * this.dim;
      m.opacity = this.labelOpacity;
    }
  }

  // ── Numerals ───────────────────────────────────────────────────────────────
  glyphMaterial(text, underline) {
    const key = `${text}${underline ? '.' : ''}`;
    let mat = this.labelMaterials.get(key);
    if (mat) return mat;
    const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    mat = new THREE.MeshStandardMaterial({
      map, emissiveMap: map, transparent: true, depthWrite: false, roughness: 0.5,
      color: this.target.ink.clone(), emissive: this.target.ink.clone(), emissiveIntensity: GLOW * this.dim,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: this.labelOpacity,
    });
    mat.userData = { canvas, text, underline };
    this.labelMaterials.set(key, mat);
    this.drawGlyph(mat);
    return mat;
  }

  drawGlyph(mat) {
    const { canvas, text, underline } = mat.userData;
    const font = FONTS[this.opts.font] ?? FONTS.royal;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let size = 175;
    ctx.font = `${font.weight} ${size}px ${font.family}`;
    const width = ctx.measureText(text).width;
    if (width > 215) {
      size *= 215 / width;
      ctx.font = `${font.weight} ${size}px ${font.family}`;
    }
    const m = ctx.measureText(text);
    const baseline = 128 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    ctx.fillText(text, 128, baseline);
    if (underline) ctx.fillRect(128 - size * 0.24, baseline + size * 0.1, size * 0.48, size * 0.075);
    mat.map.needsUpdate = true;
  }

  async redrawGlyphs() {
    const font = FONTS[this.opts.font] ?? FONTS.royal;
    try { await document.fonts.load(`${font.weight} 100px ${font.family}`); } catch { /* fall back to whatever is loaded */ }
    if (this.disposed) return;
    for (const mat of this.labelMaterials.values()) this.drawGlyph(mat);
  }

  // ── Rolling ────────────────────────────────────────────────────────────────
  /**
   * Throws a pool of dice. `dice` is [{ sides, variant?, value, dropped? }]: the values are
   * decided by the caller (crypto in the Forge, the server at the table); physics only decides
   * how they tumble. Everyone given the same seed sees the same throw.
   */
  roll({ dice, seed }) {
    if (this.morph) this.finishMorph();
    this.clearPool();
    this.flight = null;
    const job = (this.jobId = (this.jobId ?? 0) + 1);
    const shapes = dice.map((d) => this.shapeFor(d.sides, d.variant));
    this.windup = { t: 0, from: this.die.position.clone(), axis: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(), result: null };
    this.mode = 'windup';
    this.jobs.set(job, (result) => {
      this.jobs.delete(job);
      if (this.jobId !== job || this.disposed) return;
      this.windup.result = { result, dice, shapes };
    });
    this.worker.postMessage({
      id: job, seed, tray: this.tray,
      dice: dice.map((d) => ({ sides: d.sides, variant: d.variant ?? '', rounding: this.opts.rounding ?? 0.45 })),
    });
    this.onRoll?.(dice);
  }

  stepWindup(dt) {
    const w = this.windup;
    w.t += dt;
    if (!this.overlay) {
      // The showcase die is snatched up and shaken, then vanishes into the throw.
      const k = Math.min(w.t / WINDUP_TIME, 1);
      this.die.position.lerpVectors(w.from, tmpV.set(w.from.x * 0.5, 2.9, w.from.z * 0.5), easeInOut(k));
      this.die.quaternion.premultiply(tmpQ.setFromAxisAngle(w.axis, dt * 18 * k));
      this.die.scale.setScalar(1 - 0.25 * k);
    }
    if (w.t >= WINDUP_TIME && w.result) this.launch(w.result);
  }

  launch({ result, dice, shapes }) {
    this.die.visible = false;
    this.die.scale.setScalar(1);
    this.pool = dice.map((spec, i) => {
      const shape = shapes[i];
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(this.shapeGeometry(shape), this.material);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const labels = new THREE.Group();
      this.fillLabels(labels, shape);
      group.add(mesh, labels);
      const target = shape.die.outcomes.find((o) => o.value === spec.value) ?? shape.die.outcomes[0];
      const landed = shape.die.outcomes[result.landed[i]];
      const relabel = symmetry(shape.die, target.up, landed.up);
      this.scene.add(group);
      return { group, shape, spec, target, relabel, track: result.tracks[i], pop: 0 };
    });
    this.throwScale = result.scale;
    this.sounds = result.sounds;
    this.soundIndex = 0;
    this.rolling = { t: 0, duration: result.duration };
    this.labelTarget = 1;
    this.mode = 'roll';
    this.placePool(0);
  }

  placePool(t) {
    for (const d of this.pool) {
      sampleTrack(d.track, t, d.group.position, d.group.quaternion);
      d.group.quaternion.multiply(d.relabel);
      d.group.scale.setScalar(this.throwScale * Math.min(1, d.pop));
    }
  }

  stepRoll(dt) {
    const r = this.rolling;
    r.t += dt;
    for (const d of this.pool) d.pop = Math.min(1, d.pop + dt * 8);
    this.placePool(r.t);
    while (this.soundIndex < this.sounds.length && this.sounds[this.soundIndex].t <= r.t) {
      if (this.opts.sound) clack(this.sounds[this.soundIndex].v);
      this.soundIndex++;
    }
    if (r.t >= r.duration + 0.15) this.settle();
  }

  settle() {
    this.rolling = null;
    this.mode = 'rest';
    const many = this.pool.length > 1 || this.overlay;
    for (const d of this.pool) {
      if (!many) continue;
      d.sprite = resultSprite(d.spec.label ?? d.spec.value, d.spec.dropped);
      d.sprite.scale.setScalar(0.075); // a fixed size on screen, however close the camera gets
      d.sprite.position.copy(d.group.position).add(tmpV.set(0, 0.9 * this.throwScale + 0.4, -0.9 * this.throwScale));
      this.scene.add(d.sprite);
    }
    this.restTime = 0;
    if (!this.overlay) this.flyOver();
    this.onSettle?.(this.pool.map((d) => d.spec));
  }

  clearPool() {
    for (const d of this.pool) {
      this.scene.remove(d.group);
      if (d.sprite) {
        this.scene.remove(d.sprite);
        d.sprite.material.map.dispose();
        d.sprite.material.dispose();
      }
    }
    this.pool = [];
  }

  /** Back to the hovering showcase die (Forge). */
  toShowcase() {
    if (this.overlay) return;
    this.rolling = null;
    this.windup = null;
    if (this.pool.length) this.leaving = { t: 0 };
    if (!this.die.visible) {
      this.die.visible = true;
      this.die.scale.setScalar(0.01);
      this.die.position.set(0, HOVER_Y, 0);
    }
    this.mode = 'show';
  }

  stepLeaving(dt) {
    this.leaving.t += dt;
    const k = Math.max(0, 1 - this.leaving.t / 0.35);
    for (const d of this.pool) {
      d.group.scale.setScalar(this.throwScale * k);
      if (d.sprite) d.sprite.material.opacity = k;
    }
    if (k <= 0) {
      this.clearPool();
      this.leaving = null;
      if (this.overlay) {
        this.mode = 'idle';
        this.onDone?.();
      }
    }
  }

  // ── Morphing ───────────────────────────────────────────────────────────────
  finishMorph() {
    this.radii = this.morph.to;
    this.morph = null;
    this.applyRadii(1);
    this.fillLabels(this.labels, this.shape);
    this.labelTarget = 1;
    this.flash.intensity = 0;
  }

  stepMorph(dt) {
    const m = this.morph;
    m.t = Math.min(m.t + dt / MORPH_TIME, 1);
    const e = easeInOut(m.t);
    const pulse = Math.sin(Math.PI * e);
    if (!this.blend || this.blend.length !== m.to.length) this.blend = new Float32Array(m.to.length);
    for (let i = 0; i < m.to.length; i++) this.blend[i] = m.from[i] + (m.to[i] - m.from[i]) * e;
    this.radii = this.blend;
    this.applyRadii(1 + 0.12 * pulse);
    this.flash.color.copy(this.target.ink);
    this.flash.intensity = pulse * 14;
    this.flash.position.copy(this.die.position).add(tmpV.set(0, 0.2, 1.4));
    if (m.t >= 1) this.finishMorph();
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  /** Bezier sweep up and over the settled dice, ending above them. */
  flyOver() {
    const centre = new THREE.Vector3();
    for (const d of this.pool) centre.add(d.group.position);
    centre.divideScalar(this.pool.length);
    let spread = 0;
    for (const d of this.pool) spread = Math.max(spread, d.group.position.distanceTo(centre));

    // A single die: view from the side its numeral's foot points to, so the result reads upright.
    // A handful: view from the front, so the floating results read upright.
    const single = this.pool.length === 1 ? this.pool[0] : null;
    const front = single ? single.target.front.clone().applyQuaternion(single.group.quaternion).setY(0) : new THREE.Vector3(0, 0, 1);
    if (front.lengthSq() < 1e-4) front.set(0, 0, 1);
    front.normalize();
    // d4 results sit on steep faces, so look from lower down rather than straight over the top.
    const d4 = single?.spec.sides === 4;
    const elevation = d4 ? 0.68 : single ? 1.33 : 1.1;
    const distance = d4 ? 6.2 : single ? 5.3 : 6.4 + spread * 1.6;
    const end = centre.clone().addScaledVector(front, Math.cos(elevation) * distance).addScaledVector(UP, Math.sin(elevation) * distance);
    const side = new THREE.Vector3(-front.z, 0, front.x).multiplyScalar(random() < 0.5 ? -2.4 : 2.4);
    const start = this.camera.position.clone();
    this.flight = {
      kind: 'over', t: 0, duration: 1.7, look0: this.look.clone(), look1: new THREE.Vector3(centre.x, d4 ? 0.45 : 0.3, centre.z - (single ? 0 : 0.35)),
      curve: new THREE.CubicBezierCurve3(start, start.clone().add(tmpV.set(0, 2.8, 0)), end.clone().add(side).add(tmpV.set(0, 2.2, 0)), end),
    };
  }

  flyBack() {
    const start = this.camera.position.clone();
    const end = POSES.show.eye.clone().multiplyScalar(this.back);
    this.flight = {
      kind: 'back', t: 0, duration: 1.5, look0: this.look.clone(), look1: POSES.show.look.clone(),
      curve: new THREE.CubicBezierCurve3(start, start.clone().add(tmpV.set(0, 2.4, 0)), end.clone().add(tmpV.set(0, 2.2, 0)), end),
    };
  }

  moveCamera(dt) {
    if (this.overlay) return;
    const f = this.flight;
    // Any interaction (a new roll, dragging, changing the die) cancels the fly-over.
    if (f && f.kind !== 'back' && this.mode !== 'rest') this.flight = null;
    if (f && f.kind === 'back' && this.mode !== 'show') this.flight = null;

    if (this.flight?.kind === 'hold') {
      f.t += dt;
      if (f.t >= HOLD_TIME + this.pool.length * 0.25) {
        this.toShowcase();
        this.flyBack();
      }
      return;
    }
    if (this.flight) {
      f.t = Math.min(f.t + dt / f.duration, 1);
      const e = easeInOut(f.t);
      this.camera.position.copy(f.curve.getPoint(e));
      this.look.lerpVectors(f.look0, f.look1, e);
      this.camera.lookAt(this.look);
      if (f.t >= 1) this.flight = f.kind === 'over' ? { kind: 'hold', t: 0 } : null;
      return;
    }

    // Otherwise ease towards the pose for the current mode; while rolling, drift after the dice.
    const k = 1 - Math.exp(-dt * 2.5);
    const throwing = this.mode === 'windup' || this.mode === 'roll';
    const pose = throwing ? POSES.tray : POSES.show;
    eye.copy(pose.eye).multiplyScalar(this.back);
    tmpV.copy(pose.look);
    if (throwing && this.pool.length) {
      tmpV.x += this.pool[0].group.position.x * 0.3;
      tmpV.z += this.pool[0].group.position.z * 0.2;
    }
    this.camera.position.lerp(eye, k);
    this.look.lerp(tmpV, k);
    this.camera.lookAt(this.look);
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────
  frame(now) {
    this.timer.update(now);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const time = this.timer.getElapsed();
    if (this.morph) this.stepMorph(dt);
    this.labelOpacity = this.labelTarget > this.labelOpacity
      ? Math.min(this.labelTarget, this.labelOpacity + dt * 4)
      : Math.max(this.labelTarget, this.labelOpacity - dt * 12);
    this.tweenLook(dt);
    if (this.leaving) this.stepLeaving(dt);

    if (this.mode === 'windup') {
      this.stepWindup(dt);
    } else if (this.mode === 'roll') {
      this.stepRoll(dt);
    } else if (this.mode === 'rest') {
      this.restTime += dt;
      for (const d of this.pool) if (d.sprite) d.sprite.material.opacity = Math.min(1, this.restTime * 3);
      if (this.overlay && this.restTime > OVERLAY_HOLD + this.pool.length * 0.2 && !this.leaving) {
        this.mode = 'rest-out';
        this.leaving = { t: 0 };
      }
    } else if (this.mode === 'show') {
      const pos = this.die.position;
      const k = 1 - Math.exp(-dt * 4);
      pos.x += -pos.x * k;
      pos.z += -pos.z * k;
      pos.y += (HOVER_Y + Math.sin(time * 1.3) * 0.07 - pos.y) * k;
      this.die.scale.setScalar(Math.min(1, this.die.scale.x + dt * 3));
      if (!this.drag) {
        this.spin.lerp(tmpV.set(0.1, 0.55, 0.05), 1 - Math.exp(-dt * 1.2));
        const speed = this.spin.length();
        if (speed > 1e-4) this.die.quaternion.premultiply(tmpQ.setFromAxisAngle(tmpV.copy(this.spin).divideScalar(speed), speed * dt));
      }
    }
    this.moveCamera(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.back = Math.max(1, 1.15 / this.camera.aspect);
    if (this.overlay) {
      // The invisible tray fills most of what the camera sees of the ground.
      this.camera.position.copy(POSES.overlay.eye);
      this.camera.lookAt(POSES.overlay.look);
      const dist = POSES.overlay.eye.distanceTo(POSES.overlay.look);
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
      this.tray = { hx: Math.max(2.4, halfH * this.camera.aspect * 0.78), hz: Math.max(2, halfH * 0.62) };
    } else if (!this.placed) {
      this.placed = true;
      this.camera.position.copy(POSES.show.eye).multiplyScalar(this.back);
      this.camera.lookAt(this.look);
    }
    this.camera.updateProjectionMatrix();
  }

  // ── Pointer: drag to spin, tap to roll ─────────────────────────────────────
  bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    const busy = () => this.mode === 'roll' || this.mode === 'windup';
    const down = (e) => {
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, time: performance.now() };
    };
    const move = (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.x = e.clientX; d.y = e.clientY;
      if (d.moved < 5 || busy()) return;
      el.style.cursor = 'grabbing';
      if (this.mode !== 'show') this.toShowcase();
      const now = performance.now();
      const dt = Math.max((now - d.time) / 1000, 1 / 120);
      d.time = now;
      tmpQ.setFromEuler(new THREE.Euler(dy * 0.012, dx * 0.012, 0));
      this.die.quaternion.premultiply(tmpQ);
      this.spin.set(dy * 0.012 / dt, dx * 0.012 / dt, 0).clampLength(0, 14);
    };
    const up = () => {
      if (this.drag && this.drag.moved < 5 && !busy()) this.onTap?.();
      this.drag = null;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.worker.terminate();
    this.timer.dispose();
    this.clearPool();
    for (const shape of this.shapes.values()) {
      shape.geometry?.dispose();
      shape.labelGeos?.forEach((l) => l.geo.dispose());
    }
    for (const m of this.labelMaterials.values()) { m.map.dispose(); m.dispose(); }
    this.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
    for (const tex of [this.feltMap, this.woodMap, this.envMap]) tex?.dispose();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
