import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';

// Shared dungeon renderer: the DM's editor, the room key and the live battle map all draw with it.
// Everything is SVG in grid units (1 unit = one 5-foot square), drawn as a few big paths so even a
// large map stays cheap to re-render.

export const MAP_STYLES = {
  parchment: { label: 'Parchment', bg: '#d9c7a1', floor: '#f3e7cb', ink: '#3b2a1a', hatch: '#7a6449', grid: 'rgba(59, 42, 26, 0.16)', fog: '#1a120b', accent: '#9c2a1c' },
  blueprint: { label: 'Blueprint', bg: '#2a5d9c', floor: '#f6f8fb', ink: '#163a6b', hatch: '#9cc0ea', grid: 'rgba(22, 58, 107, 0.22)', fog: '#0c1a2e', accent: '#c0322b' },
  stone: { label: 'Stone', bg: '#0f0c0a', floor: '#3b352e', ink: '#0a0806', hatch: '#2a231d', grid: 'rgba(0, 0, 0, 0.32)', fog: '#050403', accent: '#e8643c' },
};

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** One path drawing every cell for which `test(i)` holds. */
function cellsPath(w, h, test) {
  let d = '';
  for (let y = 0; y < h; y++) {
    // Merge horizontal runs so the path stays short.
    let x = 0;
    while (x < w) {
      if (!test(y * w + x)) { x++; continue; }
      const start = x;
      while (x < w && test(y * w + x)) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

function wallsPath(w, h, open) {
  let d = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!open(x, y)) continue;
      if (!open(x, y - 1)) d += `M${x} ${y}h1`;
      if (!open(x, y + 1)) d += `M${x} ${y + 1}h1`;
      if (!open(x - 1, y)) d += `M${x} ${y}v1`;
      if (!open(x + 1, y)) d += `M${x + 1} ${y}v1`;
    }
  }
  return d;
}

export function decodeRevealed(base64, size) {
  if (!base64) return null;
  try {
    const bin = atob(base64);
    const out = new Uint8Array(size);
    for (let i = 0; i < Math.min(size, bin.length); i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ── Furniture glyphs, drawn in a unit cell ───────────────────────────────────
function Feature({ f, s, dm }) {
  const t = `translate(${f.x} ${f.y})`;
  const ink = { stroke: s.ink, strokeWidth: 0.06, fill: 'none' };
  switch (f.type) {
    case 'stairs-up':
    case 'stairs-down':
      return (
        <g transform={t}>
          <rect x="0.08" y="0.08" width="0.84" height="0.84" fill={s.floor} {...ink} />
          {[0.25, 0.42, 0.59, 0.76].map((y, i) => <line key={y} x1={0.08 + (f.type === 'stairs-down' ? i * 0.08 : 0)} x2={0.92 - (f.type === 'stairs-down' ? i * 0.08 : 0)} y1={y} y2={y} {...ink} />)}
        </g>
      );
    case 'chest':
      return <g transform={t}><rect x="0.2" y="0.3" width="0.6" height="0.42" rx="0.06" fill="#b07a2e" stroke={s.ink} strokeWidth="0.05" /><line x1="0.2" x2="0.8" y1="0.46" y2="0.46" stroke={s.ink} strokeWidth="0.05" /></g>;
    case 'trap':
      return dm ? <g transform={t}><circle cx="0.5" cy="0.5" r="0.32" fill="none" stroke={s.accent} strokeWidth="0.07" strokeDasharray="0.12 0.08" /><text x="0.5" y="0.62" textAnchor="middle" fontSize="0.38" fontWeight="800" fill={s.accent}>T</text></g> : null;
    case 'pillar':
      return <circle cx={f.x + 0.5} cy={f.y + 0.5} r="0.3" fill={s.ink} opacity="0.85" />;
    case 'statue':
      return <g transform={t}><circle cx="0.5" cy="0.5" r="0.32" fill={s.floor} {...ink} /><path d="M0.5 0.26 L0.57 0.45 L0.76 0.45 L0.61 0.57 L0.67 0.76 L0.5 0.64 L0.33 0.76 L0.39 0.57 L0.24 0.45 L0.43 0.45 Z" fill={s.ink} /></g>;
    case 'altar':
      return <g transform={t}><rect x="0.12" y="0.28" width="0.76" height="0.44" fill={s.floor} {...ink} /><line x1="0.5" x2="0.5" y1="0.34" y2="0.66" {...ink} /><line x1="0.38" x2="0.62" y1="0.45" y2="0.45" {...ink} /></g>;
    case 'coffin':
      return <g transform={t}><path d="M0.38 0.08 L0.62 0.08 L0.74 0.3 L0.64 0.92 L0.36 0.92 L0.26 0.3 Z" fill={s.floor} {...ink} /></g>;
    case 'table':
    case 'shelf':
    case 'rack':
      return <g transform={t}><rect x="0.1" y={f.type === 'table' ? 0.25 : 0.12} width="0.8" height={f.type === 'table' ? 0.5 : 0.26} fill={s.floor} {...ink} />{f.type === 'rack' && [0.3, 0.5, 0.7].map((x) => <line key={x} x1={x} x2={x} y1="0.12" y2="0.38" {...ink} />)}</g>;
    case 'bed':
      return <g transform={t}><rect x="0.22" y="0.1" width="0.56" height="0.8" fill={s.floor} {...ink} /><rect x="0.28" y="0.16" width="0.44" height="0.18" {...ink} /></g>;
    case 'rubble':
      return <g transform={t} fill={s.ink} opacity="0.7">{[[0.25, 0.3, 0.09], [0.6, 0.25, 0.07], [0.45, 0.6, 0.11], [0.75, 0.7, 0.06], [0.2, 0.72, 0.05]].map(([cx, cy, r]) => <circle key={cx + cy} cx={cx} cy={cy} r={r} />)}</g>;
    case 'brazier':
      return <g transform={t}><circle cx="0.5" cy="0.5" r="0.28" fill={s.floor} {...ink} /><path d="M0.5 0.3 C0.62 0.45 0.62 0.6 0.5 0.66 C0.38 0.6 0.38 0.45 0.5 0.3 Z" fill="#e8643c" /></g>;
    case 'pool':
      return <circle cx={f.x + 0.5} cy={f.y + 0.5} r="0.42" fill="#3d6f8f" opacity="0.75" stroke={s.ink} strokeWidth="0.04" />;
    case 'lava':
      return <rect x={f.x + 0.05} y={f.y + 0.05} width="0.9" height="0.9" rx="0.3" fill="#e2551d" opacity="0.85" />;
    case 'chasm':
      return <rect x={f.x + 0.08} y={f.y + 0.08} width="0.84" height="0.84" rx="0.2" fill="#000" opacity="0.8" />;
    case 'fungus':
      return <g transform={t} fill="#9b6bff" opacity="0.8">{[[0.3, 0.35, 0.14], [0.65, 0.4, 0.11], [0.45, 0.68, 0.12]].map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} />)}</g>;
    case 'crystal':
      return <path transform={t} d="M0.5 0.12 L0.72 0.5 L0.5 0.88 L0.28 0.5 Z" fill="#8fdcff" stroke={s.ink} strokeWidth="0.04" />;
    case 'tree':
      return <circle cx={f.x + 0.5} cy={f.y + 0.5} r="0.4" fill="#3f7a3c" opacity="0.8" stroke={s.ink} strokeWidth="0.04" />;
    case 'throne':
      return <g transform={t}><rect x="0.25" y="0.2" width="0.5" height="0.6" fill="#b07a2e" stroke={s.ink} strokeWidth="0.05" /><rect x="0.25" y="0.2" width="0.5" height="0.18" fill={s.ink} /></g>;
    case 'cage':
      return <g transform={t}><rect x="0.15" y="0.15" width="0.7" height="0.7" {...ink} />{[0.33, 0.5, 0.67].map((x) => <line key={x} x1={x} x2={x} y1="0.15" y2="0.85" {...ink} />)}</g>;
    case 'crate':
      return <g transform={t}><rect x="0.18" y="0.18" width="0.64" height="0.64" fill="#9a7348" stroke={s.ink} strokeWidth="0.05" /><path d="M0.18 0.18 L0.82 0.82 M0.82 0.18 L0.18 0.82" {...ink} /></g>;
    case 'wheel':
      return <g transform={t}><circle cx="0.5" cy="0.5" r="0.32" {...ink} /><path d="M0.5 0.18 V0.82 M0.18 0.5 H0.82" {...ink} /></g>;
    case 'anvil':
      return <path transform={t} d="M0.18 0.35 H0.82 L0.7 0.5 H0.6 V0.7 H0.75 V0.8 H0.25 V0.7 H0.4 V0.5 H0.3 Z" fill={s.ink} />;
    case 'hoard':
      return <g transform={t} fill="#e2b33d">{[[0.3, 0.4], [0.5, 0.3], [0.7, 0.45], [0.4, 0.62], [0.62, 0.66]].map(([cx, cy]) => <circle key={cx + cy} cx={cx} cy={cy} r="0.11" stroke={s.ink} strokeWidth="0.03" />)}</g>;
    default:
      return null;
  }
}

function Door({ d, s, dm }) {
  const horizontal = d.dir === 'h'; // the opening runs left-right, so the door leaf is horizontal
  const cx = d.x + 0.5, cy = d.y + 0.5;
  if (d.kind === 'arch') return null;
  if (d.kind === 'secret') {
    if (!dm && !d.found) return null;
    return <text x={cx} y={cy + 0.18} textAnchor="middle" fontSize="0.55" fontWeight="800" fill={s.accent} fontFamily="Cinzel, serif">S</text>;
  }
  if (d.kind === 'portcullis') {
    return <line x1={horizontal ? d.x + 0.1 : cx} x2={horizontal ? d.x + 0.9 : cx} y1={horizontal ? cy : d.y + 0.1} y2={horizontal ? cy : d.y + 0.9} stroke={s.ink} strokeWidth="0.12" strokeDasharray="0.1 0.08" />;
  }
  const [w, h] = horizontal ? [0.8, 0.32] : [0.32, 0.8];
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={d.kind === 'locked' ? '#8a5a2b' : s.floor} stroke={s.ink} strokeWidth="0.07" />
      {d.kind === 'locked' && <circle cx={cx} cy={cy} r="0.07" fill={s.ink} />}
    </g>
  );
}

function Token({ c, active, selected, mine, draggable, onPointerDown }) {
  const x = c.pos.x + 0.5, y = c.pos.y + 0.5;
  const r = 0.42;
  const hp = c.maxHp ? Math.max(0, c.hp) / c.maxHp : 1;
  const ring = c.side === 'party' ? '#5aa2ff' : '#ef4f43';
  const circumference = 2 * Math.PI * (r + 0.06);
  return (
    <g className={`map-token ${c.status === 'dead' ? 'is-dead' : ''} ${draggable ? 'is-draggable' : ''}`} onPointerDown={onPointerDown}>
      <title>{`${c.name} · ${c.hp}/${c.maxHp} HP`}</title>
      {active && <circle cx={x} cy={y} r={r + 0.2} className="map-token__turn" fill="none" stroke="#f3d38f" strokeWidth="0.07" />}
      <clipPath id={`tok-${c.id}`}><circle cx={x} cy={y} r={r} /></clipPath>
      <circle cx={x} cy={y} r={r} fill={c.color ?? '#555'} />
      {c.image && <image href={c.image} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath={`url(#tok-${c.id})`} preserveAspectRatio="xMidYMid slice" />}
      <circle cx={x} cy={y} r={r} fill="none" stroke={selected ? '#f3d38f' : ring} strokeWidth={selected ? 0.1 : 0.07} />
      {c.status !== 'dead' && (
        <circle cx={x} cy={y} r={r + 0.06} fill="none" stroke={hp > 0.5 ? '#45d18e' : hp > 0.25 ? '#f2b33d' : '#ef4f43'} strokeWidth="0.05"
          strokeDasharray={`${circumference * hp} ${circumference}`} transform={`rotate(-90 ${x} ${y})`} />
      )}
      {mine && <circle cx={x + r * 0.72} cy={y - r * 0.72} r="0.1" fill="#f3d38f" stroke="#000" strokeWidth="0.02" />}
      {c.status === 'dead' && <path d={`M${x - 0.25} ${y - 0.25} L${x + 0.25} ${y + 0.25} M${x + 0.25} ${y - 0.25} L${x - 0.25} ${y + 0.25}`} stroke="#ef4f43" strokeWidth="0.1" />}
    </g>
  );
}

/**
 * Props:
 *  map       { width, height, cells, rooms, doors, features } (full dungeon or the public table map)
 *  view      'dm' (sees everything; fog is a tint) or 'player' (fog hides)
 *  revealed  Uint8Array of revealed cells, or null for no fog
 *  tokens, activeId, selectedId, canDrag(c), onTokenDrop(c, x, y)
 *  selectedRoom, onCellClick(x, y, event), onPaint(x, y) (drag-painting, editor tools)
 *  pings     [{ id, x, y, color }]
 */
function DungeonMap({
  map, mapStyle = 'parchment', view = 'dm', revealed = null, tokens = [], activeId, selectedId, meId,
  canDrag, onTokenDrop, selectedRoom, onCellClick, onPaint, painting = false, pings = [], showNumbers = true, className = '', interactive = true,
}) {
  const s = MAP_STYLES[mapStyle] ?? MAP_STYLES.parchment;
  const { width: W, height: H, cells } = map;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const dm = view === 'dm';

  const open = useCallback((x, y) => x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] !== '#', [W, H, cells]);
  const paths = useMemo(() => {
    const isOpen = (i) => cells[i] !== '#';
    const nearOpen = (i) => {
      const x = i % W, y = (i / W) | 0;
      return cells[i] === '#' && N8.some(([dx, dy]) => open(x + dx, y + dy));
    };
    return { floor: cellsPath(W, H, isOpen), hatch: cellsPath(W, H, nearOpen), walls: wallsPath(W, H, open) };
  }, [W, H, cells, open]);

  // A cell is visible to players if it is revealed, or is the wall right beside a revealed cell.
  const fogPath = useMemo(() => {
    if (!revealed) return '';
    const visible = (i) => {
      if (revealed[i]) return true;
      const x = i % W, y = (i / W) | 0;
      return cells[i] === '#' && N8.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < W && ny < H && revealed[ny * W + nx];
      });
    };
    return cellsPath(W, H, (i) => !visible(i));
  }, [revealed, W, H, cells]);

  // Fit the whole map in view on first load and whenever the map changes size.
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / (W + 2), el.clientHeight / (H + 2));
    setCam({ k, x: (el.clientWidth - W * k) / 2, y: (el.clientHeight - H * k) / 2 });
  }, [W, H]);
  useEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fit]);

  const toCell = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return { x: Math.floor((e.clientX - rect.left - cam.x) / cam.k), y: Math.floor((e.clientY - rect.top - cam.y) / cam.k) };
  };

  const zoomAt = (factor, cx, cy) => setCam((c) => {
    const k = Math.max(6, Math.min(120, c.k * factor));
    const f = k / c.k;
    return { k, x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f };
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!interactive) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive]);

  const onPointerDown = (e) => {
    if (e.button === 2) return;
    wrapRef.current.setPointerCapture(e.pointerId);
    const cell = toCell(e);
    // Painting tools take the left button; the middle button (or Alt) always pans.
    if (painting && e.button === 0 && !e.altKey) {
      dragRef.current = { kind: 'paint', last: `${cell.x},${cell.y}` };
      onPaint?.(cell.x, cell.y, e);
      return;
    }
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: 0, cell };
  };

  const onTokenDown = (c) => (e) => {
    if (!canDrag?.(c) || e.button !== 0) return;
    e.stopPropagation();
    wrapRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'token', c, moved: 0, sx: e.clientX, sy: e.clientY };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'paint') {
      const cell = toCell(e);
      const key = `${cell.x},${cell.y}`;
      if (key !== d.last) { d.last = key; onPaint?.(cell.x, cell.y, e); }
    } else if (d.kind === 'pan') {
      d.moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy);
      setCam((c) => ({ ...c, x: d.cx + e.clientX - d.sx, y: d.cy + e.clientY - d.sy }));
    } else if (d.kind === 'token') {
      d.moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy);
      if (d.moved > 4) setGhost({ id: d.c.id, ...toCell(e) });
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    if (!d) return;
    if (d.kind === 'pan' && d.moved < 5) onCellClick?.(d.cell.x, d.cell.y, e);
    if (d.kind === 'token') {
      const cell = toCell(e);
      if (d.moved > 4) onTokenDrop?.(d.c, cell.x, cell.y);
      else onCellClick?.(d.c.pos.x, d.c.pos.y, e, d.c);
    }
  };

  const ghostToken = ghost && tokens.find((t) => t.id === ghost.id);
  const placed = tokens.filter((t) => t.pos);
  const visibleToken = (t) => dm || !revealed || revealed[t.pos.y * W + t.pos.x] || t.side === 'party';

  return (
    <div ref={wrapRef} className={`dmap dmap--${mapStyle} ${painting ? 'is-painting' : ''} ${className}`} style={{ background: s.bg }}
      {...(interactive ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onContextMenu: (e) => e.preventDefault() } : {})}>
      <svg ref={svgRef} className="dmap__svg" width="100%" height="100%">
        <defs>
          <pattern id={`hatch-${mapStyle}`} width="0.35" height="0.35" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.35" stroke={s.hatch} strokeWidth="0.07" />
          </pattern>
          <pattern id={`grid-${mapStyle}`} width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M1 0 H0 V1" fill="none" stroke={s.grid} strokeWidth="0.03" />
          </pattern>
        </defs>
        <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
          <path d={paths.hatch} fill={`url(#hatch-${mapStyle})`} />
          <path d={paths.floor} fill={s.floor} />
          <path d={paths.floor} fill={`url(#grid-${mapStyle})`} />
          {selectedRoom && <rect x={selectedRoom.x - 0.15} y={selectedRoom.y - 0.15} width={selectedRoom.w + 0.3} height={selectedRoom.h + 0.3} rx="0.4" fill={s.accent} opacity="0.12" stroke={s.accent} strokeWidth="0.08" strokeDasharray="0.3 0.2" />}
          {map.features?.map((f, i) => <Feature key={i} f={f} s={s} dm={dm} />)}
          <path d={paths.walls} fill="none" stroke={s.ink} strokeWidth="0.16" strokeLinecap="square" />
          {map.doors?.map((d, i) => <Door key={i} d={d} s={s} dm={dm} />)}
          {showNumbers && map.rooms?.map((r) => (dm || !revealed || revealed[(r.y + 1) * W + r.x + 1] || revealed[(r.y + (r.h >> 1)) * W + r.x + (r.w >> 1)]) && (
            <g key={r.id} className="dmap__num">
              <circle cx={r.x + 0.7} cy={r.y + 0.7} r="0.5" fill={s.ink} />
              <text x={r.x + 0.7} y={r.y + 0.9} textAnchor="middle" fontSize="0.58" fontWeight="700" fill={s.floor} fontFamily="Cinzel, serif">{r.n}</text>
            </g>
          ))}
          {fogPath && <path d={fogPath} fill={s.fog} opacity={dm ? 0.4 : 1} className="dmap__fog" />}
          {placed.filter(visibleToken).map((c) => (
            <Token key={c.id} c={c} active={c.id === activeId} selected={c.id === selectedId} mine={c.ownerId === meId}
              draggable={!!canDrag?.(c)} onPointerDown={onTokenDown(c)} />
          ))}
          {ghostToken && <circle cx={ghost.x + 0.5} cy={ghost.y + 0.5} r="0.42" fill="#f3d38f" opacity="0.35" stroke="#f3d38f" strokeWidth="0.06" strokeDasharray="0.15 0.1" />}
          {pings.map((p) => (
            <g key={p.id} className="dmap__ping">
              <circle cx={p.x + 0.5} cy={p.y + 0.5} r="0.5" fill="none" stroke={p.color} strokeWidth="0.12" />
              <circle cx={p.x + 0.5} cy={p.y + 0.5} r="0.5" fill="none" stroke={p.color} strokeWidth="0.08" className="dmap__ping-wave" />
            </g>
          ))}
        </g>
      </svg>
      {interactive && <div className="dmap__zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomAt(1.25, wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2)} aria-label="Zoom in"><Plus size={15} /></button>
        <button onClick={() => zoomAt(0.8, wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2)} aria-label="Zoom out"><Minus size={15} /></button>
        <button onClick={fit} aria-label="Fit map"><Maximize size={14} /></button>
      </div>}
    </div>
  );
}

export default memo(DungeonMap);
