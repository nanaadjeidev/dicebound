// The authoritative battle engine. Every roll happens here so no client can fudge dice.
import { roll, rollD20, rollDie } from '../../shared/dice.js';
import {
  ABILITIES, ABILITY_NAMES, CLASSES, CONDITIONS, attacksPerTurn, characterSubtitle,
  crToNumber, finalAbilities, mod, profBonus, resolveCharacterActions, saveBonuses,
} from '../../shared/rules.js';

export const REALMS = ['dungeon', 'forest', 'volcano', 'crypt', 'tundra', 'astral'];
const MAX_COMBATANTS = 30;
const MAX_LOG = 200;
const ROCK = '#';
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class GameError extends Error {}

// What other players need to draw someone's dice; anything else is dropped.
const HEX = /^#[0-9a-f]{6}$/i;
function cleanStyle(style) {
  if (!style || typeof style !== 'object') return null;
  const { finish, body, swirl, ink, rounding, font, glow } = style;
  return {
    finish: ['resin', 'marbled', 'pearl', 'metal', 'glass', 'gem'].includes(finish) ? finish : 'resin',
    body: HEX.test(body) ? body : '#5c0f12', swirl: HEX.test(swirl) ? swirl : '#14090a', ink: HEX.test(ink) ? ink : '#f3d38f',
    rounding: Math.max(0, Math.min(1, Number(rounding) || 0.45)), font: ['royal', 'modern', 'scholar', 'artificer'].includes(font) ? font : 'royal',
    glow: Math.max(0, Math.min(1, Number(glow) || 0)),
  };
}
const fail = (msg) => { throw new GameError(msg); };

// Conditions that grant advantage to attackers / impose disadvantage on the affected creature.
const GRANTS_ADV = ['Blinded', 'Paralysed', 'Prone', 'Restrained', 'Stunned'];
const IMPOSES_DIS = ['Blinded', 'Frightened', 'Poisoned', 'Prone', 'Restrained'];
const AUTO_FAIL_DEX_STR = ['Paralysed', 'Stunned'];

function combinedMode(manual, adv, dis) {
  const a = adv + (manual === 'adv' ? 1 : 0);
  const d = dis + (manual === 'dis' ? 1 : 0);
  return a && !d ? 'adv' : d && !a ? 'dis' : 'normal';
}

function baseCombatant(fields) {
  return {
    initiative: null, conditions: [], tempHp: 0, status: 'ok',
    deathSaves: { success: 0, fail: 0 },
    turn: { attacksLeft: 0, bonusUsed: false, deathSaveDone: false },
    usesLeft: Object.fromEntries(fields.actions.map((a, i) => [i, a.uses]).filter(([, u]) => u)),
    charged: Object.fromEntries(fields.actions.map((a, i) => [i, true]).filter(([i]) => fields.actions[i].recharge)),
    ...fields,
  };
}

export function combatantFromCharacter(c, { id, ownerId, side = 'party' }) {
  const abilities = finalAbilities(c);
  return baseCombatant({
    id, ownerId, side, kind: 'pc', sourceId: c.id, premade: !!c.premade, size: 'Medium',
    name: c.name, subtitle: characterSubtitle(c), image: c.image,
    icon: CLASSES[c.class]?.icon ?? 'crossed-swords', color: CLASSES[c.class]?.color ?? '#c9a45c',
    maxHp: c.maxHp, hp: Math.max(1, Math.min(c.hp ?? c.maxHp, c.maxHp)), ac: c.ac,
    abilities, saves: saveBonuses(c), initBonus: mod(abilities.dex),
    actions: resolveCharacterActions(c), attacksPerTurn: attacksPerTurn(c),
    potions: c.potions ?? 0, startPotions: c.potions ?? 0, xp: 0, cr: null,
  });
}

export function combatantFromMonster(m, { id, ownerId, side = 'foes', name }) {
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, m.saves?.[a] ?? mod(m.abilities[a])]));
  const pb = profBonus(Math.max(1, Math.ceil(crToNumber(m.cr) * 1.5)));
  let actions = m.actions.filter((a) => a.kind !== 'special' && a.damage).map((a) => ({ ...a }));
  if (!actions.length) {
    const strMod = mod(m.abilities.str);
    actions = [{ name: 'Slam', kind: 'attack', toHit: pb + strMod, damage: `1d4${strMod ? (strMod > 0 ? '+' : '') + strMod : ''}`, damageType: 'bludgeoning', desc: 'An improvised strike.' }];
  }
  return baseCombatant({
    id, ownerId, side, kind: 'monster', sourceId: m.id, name: name ?? m.name, size: m.size,
    subtitle: `${m.size} ${m.type} · CR ${m.cr}`, image: m.image, icon: m.icon, color: m.color,
    maxHp: m.hp, hp: m.hp, ac: m.ac, abilities: m.abilities, saves, initBonus: mod(m.abilities.dex),
    actions, attacksPerTurn: m.attacksPerTurn || 1, potions: 0, xp: m.xp ?? 0, cr: m.cr,
  });
}

export class Room {
  constructor({ code, name, hostId, realm, onCharacterHp }) {
    this.code = code;
    this.name = name;
    this.hostId = hostId;
    this.realm = REALMS.includes(realm) ? realm : 'dungeon';
    this.onCharacterHp = onCharacterHp;
    this.createdAt = Date.now();
    this.players = new Map();
    this.combatants = [];
    this.phase = 'lobby';
    this.round = 0;
    this.turnId = null;
    this.outcome = null;
    this.log = [];
    this.seq = 0;
    this.emptySince = null;
    this.map = null; // the battle map: public dungeon layout, fog and nothing the players shouldn't see
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  id(prefix) { return `${prefix}${++this.seq}`; }

  push(entry) {
    this.log.push({ id: this.id('l'), ts: Date.now(), ...entry });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
  }

  get(id) { return this.combatants.find((c) => c.id === id) ?? fail('That combatant is no longer here.'); }
  get current() { return this.combatants.find((c) => c.id === this.turnId) ?? null; }
  isHost(guestId) { return guestId === this.hostId; }
  canControl(guestId, c) { return this.isHost(guestId) || c.ownerId === guestId; }
  playerName(guestId) { return this.players.get(guestId)?.name ?? 'Someone'; }

  requireControl(guestId, c) {
    if (!this.canControl(guestId, c)) fail(`You don't control ${c.name}.`);
  }

  requireTurn(guestId, c) {
    if (this.phase !== 'combat') fail('Combat has not started.');
    if (this.turnId !== c.id) fail(`It is not ${c.name}'s turn.`);
    this.requireControl(guestId, c);
  }

  effectiveAc(c) { return c.ac + (c.conditions.includes('Hasted') ? 2 : 0); }

  // ── players ────────────────────────────────────────────────────────────────
  join(guest) {
    const existing = this.players.get(guest.id);
    if (existing) {
      existing.sockets++;
      existing.name = guest.name;
    } else {
      this.players.set(guest.id, { id: guest.id, name: guest.name, color: guest.color, sockets: 1 });
      this.push({ type: 'system', text: `${guest.name} joined the party.` });
    }
    this.emptySince = null;
  }

  disconnect(guestId) {
    const p = this.players.get(guestId);
    if (!p) return;
    p.sockets = Math.max(0, p.sockets - 1);
    if (![...this.players.values()].some((x) => x.sockets > 0)) this.emptySince = Date.now();
  }

  leave(guestId) {
    const p = this.players.get(guestId);
    if (!p) return;
    this.players.delete(guestId);
    this.push({ type: 'system', text: `${p.name} left the party.` });
    if (this.hostId === guestId) {
      const next = [...this.players.values()].find((x) => x.sockets > 0) ?? [...this.players.values()][0];
      if (next) {
        this.hostId = next.id;
        this.push({ type: 'system', text: `${next.name} is now the Dungeon Master.` });
      }
    }
    if (![...this.players.values()].some((x) => x.sockets > 0)) this.emptySince = Date.now();
  }

  // ── roster ─────────────────────────────────────────────────────────────────
  addCombatant(guestId, combatant, { pos } = {}) {
    if (this.combatants.length >= MAX_COMBATANTS) fail(`The arena is full (${MAX_COMBATANTS} combatants).`);
    combatant.pos = pos ?? (this.map && combatant.side === 'party' ? this.freeCellsNear(this.map.start, 1)[0] ?? null : null);
    this.combatants.push(combatant);
    this.push({ type: 'system', text: `${this.playerName(guestId)} brought ${combatant.name} to the ${combatant.side === 'party' ? 'party' : 'enemy ranks'}.` });
    if (this.phase === 'combat') this.rollInitiativeFor(combatant);
    return [{ type: 'enter', targetId: combatant.id }];
  }

  removeCombatant(guestId, id) {
    const c = this.get(id);
    this.requireControl(guestId, c);
    if (this.turnId === id) this.advance();
    this.combatants = this.combatants.filter((x) => x.id !== id);
    if (this.turnId === id) this.turnId = null;
    this.push({ type: 'system', text: `${c.name} left the battlefield.` });
    this.checkOutcome();
  }

  setSide(guestId, id, side) {
    const c = this.get(id);
    this.requireControl(guestId, c);
    c.side = side === 'party' ? 'party' : 'foes';
  }

  // ── combat flow ────────────────────────────────────────────────────────────
  sortOrder() {
    this.combatants.sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || b.initBonus - a.initBonus || a.tiebreak - b.tiebreak);
  }

  rollInitiativeFor(c) {
    const d = rollDie(20);
    c.initiative = d + c.initBonus;
    c.tiebreak = Math.random();
    this.sortOrder();
    this.push({ type: 'initiative', actor: c.name, natural: d, total: c.initiative });
  }

  startCombat(guestId) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can start combat.');
    if (this.combatants.length < 2) fail('You need at least two combatants to fight.');
    this.phase = 'combat';
    this.round = 1;
    this.outcome = null;
    const rolls = [];
    for (const c of this.combatants) {
      const d = rollDie(20);
      c.initiative = d + c.initBonus;
      c.tiebreak = Math.random();
      rolls.push({ id: c.id, name: c.name, natural: d, total: c.initiative });
    }
    this.sortOrder();
    this.push({ type: 'banner', text: 'Roll for initiative!' });
    for (const r of [...rolls].sort((a, b) => b.total - a.total)) this.push({ type: 'initiative', actor: r.name, natural: r.natural, total: r.total });
    const first = this.combatants.find((c) => this.canAct(c));
    this.turnId = first?.id ?? null;
    if (first) this.beginTurn(first);
    return [{ type: 'initiative', rolls }];
  }

  canAct(c) { return c.status === 'ok' || c.status === 'down'; }

  beginTurn(c) {
    c.turn = {
      attacksLeft: c.attacksPerTurn + (c.conditions.includes('Hasted') ? 1 : 0),
      bonusUsed: false,
      deathSaveDone: false,
    };
    for (const [i, charged] of Object.entries(c.charged)) {
      if (charged) continue;
      const d = rollDie(6);
      const action = c.actions[i];
      if (d >= action.recharge) {
        c.charged[i] = true;
        this.push({ type: 'system', text: `${c.name}'s ${action.name} recharges (rolled ${d}).` });
      }
    }
    this.push({ type: 'turn', actor: c.name, round: this.round, down: c.status === 'down' });
  }

  advance() {
    const n = this.combatants.length;
    const start = this.combatants.findIndex((c) => c.id === this.turnId);
    for (let step = 1; step <= n; step++) {
      const c = this.combatants[(start + step) % n];
      if (!this.canAct(c)) continue;
      if (start + step >= n) {
        this.round++;
        this.push({ type: 'banner', text: `Round ${this.round}` });
      }
      this.turnId = c.id;
      this.beginTurn(c);
      return;
    }
    this.turnId = null;
  }

  endTurn(guestId) {
    const c = this.current ?? fail('Nobody is taking a turn.');
    this.requireTurn(guestId, c);
    if (c.status === 'down' && !c.turn.deathSaveDone && !this.isHost(guestId)) fail('Roll your death saving throw first.');
    this.advance();
  }

  endCombat(guestId) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can end combat.');
    this.finish(null);
    this.phase = 'lobby';
    this.push({ type: 'banner', text: 'The battle is over.' });
  }

  rematch(guestId) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can reset the battle.');
    for (const c of this.combatants) {
      const { id, ownerId, side, kind, sourceId, premade, size, name, subtitle, image, icon, color, maxHp, ac,
        abilities, saves, initBonus, actions, attacksPerTurn, xp, cr, startPotions, pos } = c;
      const potions = c.kind === 'pc' ? Math.max(c.potions, c.startPotions ?? 0) : 0;
      Object.assign(c, baseCombatant({ id, ownerId, side, kind, sourceId, premade, size, name, subtitle, image, icon,
        color, maxHp, hp: maxHp, ac, abilities, saves, initBonus, actions, attacksPerTurn, xp, cr, potions, startPotions, pos }));
    }
    this.phase = 'lobby';
    this.round = 0;
    this.turnId = null;
    this.outcome = null;
    this.push({ type: 'banner', text: 'Wounds mended. The arena awaits.' });
    return this.combatants.map((c) => ({ type: 'heal', targetId: c.id, amount: 0 }));
  }

  clearArena(guestId, side) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can clear the arena.');
    this.combatants = side ? this.combatants.filter((c) => c.side !== side) : [];
    if (!this.combatants.some((c) => c.id === this.turnId)) this.turnId = null;
    if (this.phase === 'combat' && !this.combatants.length) this.phase = 'lobby';
    this.push({ type: 'system', text: side ? `The ${side === 'party' ? 'party' : 'enemies'} were cleared from the arena.` : 'The arena was cleared.' });
  }

  finish(outcome) {
    this.outcome = outcome;
    this.turnId = null;
    for (const c of this.combatants) {
      c.initiative = null;
      if (c.kind === 'pc' && !c.premade) this.onCharacterHp?.(c.sourceId, c.ownerId, c.status === 'dead' ? 0 : c.hp);
    }
  }

  checkOutcome() {
    if (this.phase !== 'combat') return [];
    const party = this.combatants.filter((c) => c.side === 'party');
    const foes = this.combatants.filter((c) => c.side === 'foes');
    if (!party.length || !foes.length) return [];
    let outcome = null;
    if (foes.every((c) => c.status === 'dead')) outcome = 'victory';
    else if (party.every((c) => c.status !== 'ok')) outcome = 'defeat';
    if (!outcome) return [];
    const xp = foes.reduce((s, c) => s + (c.xp || 0), 0);
    this.phase = 'ended';
    this.finish(outcome);
    this.push({ type: 'banner', text: outcome === 'victory' ? `Victory! The party earns ${xp.toLocaleString()} XP.` : 'Defeat… the party has fallen.' });
    return [{ type: 'outcome', outcome, xp }];
  }

  // ── hit points ─────────────────────────────────────────────────────────────
  damage(target, amount, { crit = false } = {}) {
    const fx = [];
    if (target.status === 'dead' || amount <= 0) return fx;
    let remaining = amount;
    if (target.tempHp) {
      const absorbed = Math.min(target.tempHp, remaining);
      target.tempHp -= absorbed;
      remaining -= absorbed;
    }
    if (target.hp === 0 && target.kind === 'pc') {
      if (remaining >= target.maxHp) return this.kill(target, `${target.name} is slain outright!`);
      target.status = 'down';
      target.deathSaves.fail += crit ? 2 : 1;
      this.push({ type: 'death', actor: target.name, text: `${target.name} suffers ${crit ? 'two death save failures' : 'a death save failure'} while down.` });
      if (target.deathSaves.fail >= 3) return this.kill(target, `${target.name} has died.`);
      return fx;
    }
    target.hp -= remaining;
    if (target.hp > 0) return fx;
    const overflow = -target.hp;
    target.hp = 0;
    if (target.kind === 'pc') {
      if (overflow >= target.maxHp) return this.kill(target, `${target.name} is slain outright by massive damage!`);
      target.status = 'down';
      target.deathSaves = { success: 0, fail: 0 };
      this.push({ type: 'death', actor: target.name, text: `${target.name} falls unconscious!` });
      fx.push({ type: 'down', targetId: target.id });
      return fx;
    }
    return this.kill(target, `${target.name} is slain!`);
  }

  kill(target, text) {
    target.hp = 0;
    target.status = 'dead';
    target.conditions = [];
    this.push({ type: 'death', actor: target.name, text, dead: true });
    return [{ type: 'death', targetId: target.id }];
  }

  heal(target, amount) {
    if (target.status === 'dead') fail(`${target.name} is beyond mortal healing.`);
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.status !== 'ok' && target.hp > 0) {
      target.status = 'ok';
      target.deathSaves = { success: 0, fail: 0 };
      this.push({ type: 'system', text: `${target.name} regains consciousness!` });
    }
    return target.hp - before;
  }

  // ── actions ────────────────────────────────────────────────────────────────
  act(guestId, { actorId, actionIndex, targetId, mode = 'normal' }) {
    const actor = this.get(actorId);
    this.requireTurn(guestId, actor);
    if (actor.status !== 'ok') fail(`${actor.name} can't act while ${actor.status === 'down' ? 'unconscious' : actor.status}.`);
    const action = actor.actions[actionIndex] ?? fail('Unknown action.');
    if (actor.turn.attacksLeft <= 0) fail(`${actor.name} has no attacks left this turn.`);
    if (action.uses && !(actor.usesLeft[actionIndex] > 0)) fail(`${action.name} has no uses left.`);
    if (action.recharge && !actor.charged[actionIndex]) fail(`${action.name} is still recharging.`);
    const target = action.self ? actor : this.get(targetId);
    if (target.status === 'dead' && action.kind !== 'heal') fail(`${target.name} is already dead.`);
    if (target.id === actor.id && action.kind !== 'heal') fail("You can't attack yourself.");

    // Spells and big abilities use the whole action; weapon attacks chip away at Extra Attack.
    actor.turn.attacksLeft = action.kind === 'attack' && !action.uses ? actor.turn.attacksLeft - 1 : 0;
    if (action.uses) actor.usesLeft[actionIndex]--;
    if (action.recharge) actor.charged[actionIndex] = false;

    const base = { actorId: actor.id, targetId: target.id, action: action.name, kind: action.kind, damageType: action.damageType };
    let fx = [];

    if (action.kind === 'attack') {
      const adv = target.conditions.filter((x) => GRANTS_ADV.includes(x)).length + (actor.conditions.includes('Invisible') ? 1 : 0);
      const dis = actor.conditions.filter((x) => IMPOSES_DIS.includes(x)).length + (target.conditions.includes('Invisible') ? 1 : 0);
      const rollMode = combinedMode(mode, adv, dis);
      const d20 = rollD20(rollMode);
      const bless = actor.conditions.includes('Blessed') ? rollDie(4) : 0;
      const total = d20.natural + action.toHit + bless;
      const ac = this.effectiveAc(target);
      const crit = d20.natural === 20;
      const hit = crit || (d20.natural !== 1 && total >= ac);
      const dmg = hit ? roll(action.damage, { crit }) : null;
      this.push({ type: 'attack', actor: actor.name, target: target.name, action: action.name, d20: d20.rolls, natural: d20.natural, mode: rollMode, toHit: action.toHit, bless, total, ac, hit, crit, damage: dmg?.total ?? 0, damageRoll: dmg, damageType: action.damageType });
      fx.push({ type: 'attack', ...base, d20: d20.rolls, natural: d20.natural, mode: rollMode, total, ac, hit, crit, amount: dmg?.total ?? 0 });
      if (dmg) fx.push(...this.damage(target, dmg.total, { crit }));
    } else if (action.kind === 'save') {
      const autoFail = ['dex', 'str'].includes(action.save) && target.conditions.some((x) => AUTO_FAIL_DEX_STR.includes(x));
      const d20 = rollD20(target.conditions.includes('Restrained') && action.save === 'dex' ? 'dis' : 'normal');
      const bless = target.conditions.includes('Blessed') ? rollDie(4) : 0;
      const total = d20.natural + (target.saves[action.save] ?? 0) + bless;
      const saved = !autoFail && total >= action.dc;
      const dmg = roll(action.damage);
      const amount = saved ? (action.halfOnSave ? Math.floor(dmg.total / 2) : 0) : dmg.total;
      this.push({ type: 'save', actor: actor.name, target: target.name, action: action.name, save: action.save, dc: action.dc, natural: d20.natural, total, saved, autoFail, damage: amount, damageRoll: dmg, damageType: action.damageType });
      fx.push({ type: 'save', ...base, natural: d20.natural, d20: d20.rolls, total, dc: action.dc, save: action.save, saved, amount });
      fx.push(...this.damage(target, amount));
    } else if (action.kind === 'auto') {
      const dmg = roll(action.damage);
      this.push({ type: 'auto', actor: actor.name, target: target.name, action: action.name, damage: dmg.total, damageRoll: dmg, damageType: action.damageType });
      fx.push({ type: 'auto', ...base, amount: dmg.total, hit: true });
      fx.push(...this.damage(target, dmg.total));
    } else if (action.kind === 'heal') {
      const amt = roll(action.damage);
      const healed = this.heal(target, amt.total);
      this.push({ type: 'heal', actor: actor.name, target: target.name, action: action.name, amount: healed, damageRoll: amt });
      fx.push({ type: 'heal', ...base, amount: healed });
    }
    return [...fx, ...this.checkOutcome()];
  }

  potion(guestId, { actorId }) {
    const actor = this.get(actorId);
    this.requireTurn(guestId, actor);
    if (actor.status !== 'ok') fail(`${actor.name} can't drink while unconscious.`);
    if (actor.turn.bonusUsed) fail('Bonus action already used this turn.');
    if (actor.potions <= 0) fail(`${actor.name} is out of potions.`);
    actor.potions--;
    actor.turn.bonusUsed = true;
    const r = roll('2d4+2');
    const healed = this.heal(actor, r.total);
    this.push({ type: 'heal', actor: actor.name, target: actor.name, action: 'Potion of Healing', amount: healed, damageRoll: r });
    return [{ type: 'heal', actorId: actor.id, targetId: actor.id, action: 'Potion of Healing', amount: healed }];
  }

  deathSave(guestId, { actorId }) {
    const actor = this.get(actorId);
    this.requireTurn(guestId, actor);
    if (actor.status !== 'down') fail(`${actor.name} isn't dying.`);
    if (actor.turn.deathSaveDone) fail('Death save already rolled this turn.');
    actor.turn.deathSaveDone = true;
    const d = rollDie(20);
    let text;
    const fx = [{ type: 'deathsave', targetId: actor.id, natural: d }];
    if (d === 20) {
      actor.hp = 1;
      actor.status = 'ok';
      actor.deathSaves = { success: 0, fail: 0 };
      text = `${actor.name} rolls a natural 20 and surges back to consciousness!`;
      fx.push({ type: 'heal', targetId: actor.id, amount: 1 });
    } else if (d >= 10) {
      actor.deathSaves.success++;
      text = `${actor.name} succeeds on a death save (${d}).`;
      if (actor.deathSaves.success >= 3) {
        actor.status = 'stable';
        text += ` ${actor.name} is stable.`;
      }
    } else {
      actor.deathSaves.fail += d === 1 ? 2 : 1;
      text = `${actor.name} fails a death save (${d}${d === 1 ? ' — two failures' : ''}).`;
    }
    this.push({ type: 'death', actor: actor.name, text, natural: d });
    if (actor.deathSaves.fail >= 3) fx.push(...this.kill(actor, `${actor.name} has died.`));
    return [...fx, ...this.checkOutcome()];
  }

  check(guestId, { actorId, ability, type }) {
    const actor = this.get(actorId);
    this.requireControl(guestId, actor);
    if (!ABILITIES.includes(ability)) fail('Unknown ability.');
    const bonus = type === 'save' ? actor.saves[ability] : mod(actor.abilities[ability]);
    const d = rollDie(20);
    this.push({ type: 'check', actor: actor.name, label: `${ABILITY_NAMES[ability]} ${type === 'save' ? 'saving throw' : 'check'}`, natural: d, bonus, total: d + bonus });
    return [{ type: 'roll', actorId, natural: d, total: d + bonus }];
  }

  adjustHp(guestId, { id, amount, temp = false }) {
    const c = this.get(id);
    this.requireControl(guestId, c);
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 999) fail('Enter an amount between 1 and 999.');
    const who = this.playerName(guestId);
    if (temp) {
      c.tempHp = Math.max(c.tempHp, Math.abs(n));
      this.push({ type: 'system', text: `${who} grants ${c.name} ${Math.abs(n)} temporary HP.` });
      return [];
    }
    if (n > 0) {
      if (c.status === 'dead') {
        c.status = 'ok';
        c.hp = 0;
        this.push({ type: 'system', text: `${who} raises ${c.name} from the dead!` });
      }
      const healed = this.heal(c, n);
      this.push({ type: 'heal', actor: who, target: c.name, action: 'DM adjustment', amount: healed });
      return [{ type: 'heal', targetId: c.id, amount: healed }, ...this.checkOutcome()];
    }
    this.push({ type: 'system', text: `${who} deals ${-n} damage to ${c.name}.` });
    return [{ type: 'damage', targetId: c.id, amount: -n }, ...this.damage(c, -n), ...this.checkOutcome()];
  }

  toggleCondition(guestId, { id, condition }) {
    const c = this.get(id);
    this.requireControl(guestId, c);
    if (!CONDITIONS.includes(condition)) fail('Unknown condition.');
    c.conditions = c.conditions.includes(condition)
      ? c.conditions.filter((x) => x !== condition)
      : [...c.conditions, condition];
  }

  chat(guest, text) {
    const clean = String(text ?? '').trim().slice(0, 500);
    if (!clean) return;
    this.push({ type: 'chat', author: guest.name, color: guest.color, text: clean });
  }

  /**
   * A free roll. Everyone watches the same dice tumble: the server picks the values and a throw
   * seed, and the roller's dice style travels with it. The DM can roll in secret instead.
   */
  freeRoll(guest, { expr, label, style, secret }) {
    const r = roll(expr);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const clean = String(label ?? '').slice(0, 60);
    if (secret && this.isHost(guest.id)) return { secret: { label: clean, roll: r, seed } };
    this.push({ type: 'roll', author: guest.name, color: guest.color, label: clean, roll: r });
    return [{ type: 'roll', natural: r.parts[0]?.rolls?.[0], total: r.total, expr: r.expr, author: guest.name, authorId: guest.id,
      color: guest.color, label: clean, parts: r.parts, seed, style: cleanStyle(style) }];
  }

  // ── battle map ─────────────────────────────────────────────────────────────
  /** Loads a dungeon as the battle map. Only its public half is kept; the DM holds the rest. */
  loadMap(guestId, dungeon) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can change the map.');
    const { width, height, cells } = dungeon;
    if (!width || !height || typeof cells !== 'string' || cells.length !== width * height) fail('That dungeon map is damaged.');
    const rooms = dungeon.rooms.map(({ id, n, x, y, w, h, shape, role }) => ({ id, n, x, y, w, h, shape, role }));
    const entrance = rooms.find((r) => r.role === 'entrance') ?? rooms[0];
    const stairs = dungeon.features.find((f) => f.type === 'stairs-up');
    this.map = {
      id: dungeon.id, name: dungeon.name, theme: dungeon.theme, width, height, cells, rooms,
      doors: dungeon.doors.map(({ x, y, dir, kind }) => ({ x, y, dir, kind, found: kind !== 'secret' })),
      features: dungeon.features.filter((f) => !f.hidden).map(({ x, y, type }) => ({ x, y, type })),
      revealed: new Uint8Array(width * height),
      start: stairs ? { x: stairs.x, y: stairs.y } : { x: entrance.x + (entrance.w >> 1), y: entrance.y + (entrance.h >> 1) },
    };
    for (const c of this.combatants) c.pos = null;
    if (entrance) this.revealRoom(guestId, { roomId: entrance.id });
    const spots = this.freeCellsNear(this.map.start, this.combatants.length);
    for (const c of this.combatants.filter((x) => x.side === 'party')) c.pos = spots.shift() ?? null;
    this.push({ type: 'banner', text: `The party descends into ${dungeon.name}.` });
  }

  clearMap(guestId) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can change the map.');
    this.map = null;
    for (const c of this.combatants) c.pos = null;
  }

  requireMap() { return this.map ?? fail('No map is loaded.'); }
  cell(x, y) {
    const m = this.map;
    return x >= 0 && y >= 0 && x < m.width && y < m.height ? m.cells[y * m.width + x] : ROCK;
  }
  occupied(x, y, exceptId) {
    return this.combatants.some((c) => c.id !== exceptId && c.status !== 'dead' && c.pos?.x === x && c.pos?.y === y);
  }

  /** Walkable, unoccupied cells nearest to `from`, in walking order. */
  freeCellsNear(from, count, { within } = {}) {
    if (!this.map || !from) return [];
    const { width } = this.map;
    const seen = new Set([from.y * width + from.x]);
    const queue = [from];
    const out = [];
    while (queue.length && out.length < count) {
      const p = queue.shift();
      if (!this.occupied(p.x, p.y) && (!within || within(p))) out.push(p);
      for (const [dx, dy] of STEPS) {
        const n = { x: p.x + dx, y: p.y + dy };
        const key = n.y * width + n.x;
        if (seen.has(key) || this.cell(n.x, n.y) === ROCK) continue;
        seen.add(key);
        queue.push(n);
      }
    }
    return out;
  }

  revealRoom(guestId, { roomId, hide = false }) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can lift the fog.');
    const m = this.requireMap();
    const room = m.rooms.find((r) => r.id === roomId) ?? fail('No such room.');
    // The room, plus the doorways around it, so the party can see the ways out.
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (this.cell(x, y) !== ROCK) m.revealed[y * m.width + x] = hide ? 0 : 1;
      }
    }
  }

  revealCells(guestId, { cells, hide = false }) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can lift the fog.');
    const m = this.requireMap();
    if (cells === 'all') return m.revealed.fill(hide ? 0 : 1);
    for (const i of (Array.isArray(cells) ? cells : []).slice(0, 4000)) {
      if (Number.isInteger(i) && i >= 0 && i < m.revealed.length) m.revealed[i] = hide ? 0 : 1;
    }
  }

  revealSecretDoor(guestId, { x, y }) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can reveal secret doors.');
    const door = this.requireMap().doors.find((d) => d.x === x && d.y === y) ?? fail('No door there.');
    door.found = true;
    this.push({ type: 'system', text: 'A secret door has been discovered!' });
  }

  moveToken(guestId, { id, x, y }) {
    const m = this.requireMap();
    const c = this.get(id);
    this.requireControl(guestId, c);
    if (!Number.isInteger(x) || !Number.isInteger(y) || this.cell(x, y) === ROCK) fail('You can’t stand there.');
    if (!this.isHost(guestId) && !m.revealed[y * m.width + x]) fail('That way is shrouded in darkness.');
    if (this.occupied(x, y, id)) fail('Someone is already standing there.');
    c.pos = { x, y };
  }

  ping(guest, { x, y }) {
    this.requireMap();
    if (!Number.isInteger(x) || !Number.isInteger(y)) fail('Bad ping.');
    return [{ type: 'ping', x, y, color: guest.color, author: guest.name }];
  }

  /** Narration from the DM: shown to everyone as a read-aloud scroll and kept in the chronicle. */
  narrate(guestId, { title, text }) {
    if (!this.isHost(guestId)) fail('Only the Dungeon Master can narrate.');
    const clean = String(text ?? '').trim().slice(0, 2000);
    if (!clean) fail('Nothing to read aloud.');
    const heading = String(title ?? '').trim().slice(0, 80);
    this.push({ type: 'narration', title: heading, text: clean });
    return [{ type: 'narration', title: heading, text: clean }];
  }

  // ── wire format ────────────────────────────────────────────────────────────
  summary() {
    return {
      code: this.code, name: this.name, realm: this.realm, phase: this.phase,
      host: this.playerName(this.hostId),
      players: [...this.players.values()].filter((p) => p.sockets > 0).length,
      combatants: this.combatants.length,
    };
  }

  toJSON() {
    return {
      code: this.code, name: this.name, realm: this.realm, hostId: this.hostId,
      phase: this.phase, round: this.round, turnId: this.turnId, outcome: this.outcome,
      players: [...this.players.values()].map(({ sockets, ...p }) => ({ ...p, online: sockets > 0 })),
      combatants: this.combatants.map(({ tiebreak, ...c }) => ({ ...c, effectiveAc: this.effectiveAc(c) })),
      log: this.log.slice(-120),
      map: this.map && (({ revealed, start, ...m }) => ({
        ...m, doors: m.doors.filter((d) => d.found), revealed: Buffer.from(revealed).toString('base64'),
      }))(this.map),
    };
  }
}
