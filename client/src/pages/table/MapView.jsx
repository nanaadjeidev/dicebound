import { useMemo, useState } from 'react';
import { Brush, CloudFog, Crosshair, Eye, EyeOff, MapPin } from 'lucide-react';
import DungeonMap, { MAP_STYLES, decodeRevealed } from '../../components/DungeonMap.jsx';

/**
 * The live battle map. Players see the public map with fog; the DM sees their full dungeon (secret
 * doors, traps) with the fog as a tint, plus brushes to reveal or hide areas.
 */
export default function MapView({ room, me, isHost, dungeon, targetId, onSelect, onSend, pings }) {
  const map = room.map;
  const [mode, setMode] = useState('move'); // move | ping | reveal | hide
  const [placing, setPlacing] = useState(null);
  const [mapStyle, setMapStyle] = useState('stone');
  const revealed = useMemo(() => decodeRevealed(map.revealed, map.width * map.height), [map.revealed, map.width, map.height]);

  // The DM draws from their own copy (secret doors, traps); everything else follows the server.
  const drawn = useMemo(() => (isHost && dungeon?.id === map.id
    ? { ...map, doors: dungeon.doors.map((d) => ({ ...d, found: map.doors.some((x) => x.x === d.x && x.y === d.y) })), features: dungeon.features }
    : map), [isHost, dungeon, map]);

  const canDrag = (c) => c.status !== 'dead' && (isHost || c.ownerId === me);
  const unplaced = room.combatants.filter((c) => !c.pos && c.status !== 'dead' && (isHost || c.ownerId === me));

  const brush = (x, y, hide) => {
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height) cells.push(ny * map.width + nx);
      }
    }
    onSend('map:reveal', { cells, hide });
  };

  const onCellClick = (x, y, e, token) => {
    if (e.altKey || mode === 'ping') return onSend('map:ping', { x, y });
    if (token) return onSelect(token);
    if (placing) {
      onSend('map:move', { id: placing, x, y });
      return setPlacing(null);
    }
    if (isHost && (mode === 'reveal' || mode === 'hide')) return brush(x, y, mode === 'hide');
    const door = isHost && drawn.doors.find((d) => d.x === x && d.y === y && d.kind === 'secret' && !d.found);
    if (door && window.confirm('Reveal this secret door to the players?')) onSend('map:secret', { x, y });
  };

  const painting = isHost && (mode === 'reveal' || mode === 'hide');
  return (
    <div className="mapview">
      <DungeonMap map={drawn} mapStyle={mapStyle} view={isHost ? 'dm' : 'player'} revealed={revealed}
        tokens={room.combatants} activeId={room.turnId} selectedId={targetId} meId={me}
        canDrag={canDrag} onTokenDrop={(c, x, y) => onSend('map:move', { id: c.id, x, y })}
        onCellClick={onCellClick} painting={painting} onPaint={(x, y) => brush(x, y, mode === 'hide')} pings={pings} />

      <div className="mapview__tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className={mode === 'move' ? 'is-active' : ''} onClick={() => setMode('move')} title="Move tokens (drag)"><Crosshair size={15} /></button>
        <button className={mode === 'ping' ? 'is-active' : ''} onClick={() => setMode('ping')} title="Ping a spot for everyone (or Alt+click)"><MapPin size={15} /></button>
        {isHost && (
          <>
            <span className="mapview__sep" />
            <button className={mode === 'reveal' ? 'is-active' : ''} onClick={() => setMode('reveal')} title="Reveal brush"><Brush size={15} /></button>
            <button className={mode === 'hide' ? 'is-active' : ''} onClick={() => setMode('hide')} title="Fog brush"><CloudFog size={15} /></button>
            <button onClick={() => onSend('map:reveal', { cells: 'all' })} title="Reveal the whole map"><Eye size={15} /></button>
            <button onClick={() => window.confirm('Cover the whole map in fog?') && onSend('map:reveal', { cells: 'all', hide: true })} title="Hide the whole map"><EyeOff size={15} /></button>
          </>
        )}
        <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value)} aria-label="Map style">
          {Object.entries(MAP_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {unplaced.length > 0 && (
        <div className="mapview__tray" onPointerDown={(e) => e.stopPropagation()}>
          <span>{placing ? 'Click the map to place' : 'Not on the map:'}</span>
          {unplaced.map((c) => (
            <button key={c.id} className={`mapview__chip ${placing === c.id ? 'is-active' : ''}`} onClick={() => setPlacing(placing === c.id ? null : c.id)}
              style={{ '--ring': c.side === 'party' ? '#5aa2ff' : '#ef4f43' }}>
              {c.image ? <img src={c.image} alt="" /> : <i style={{ background: c.color }} />} {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
