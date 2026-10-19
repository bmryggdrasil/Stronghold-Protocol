// test/content/op_makoto.test.js — 結城理 (char_4217_makoto), the P3R collab DIY pick and its dollkeeper / Persona states.
// Official records: .cache/gamedata/excel/character_table.json, skill_table.json, battle_equip_table.json; mechanics: PRTS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { OPERATOR_KITS, KITTED_CHARS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess'), BACKUPS = load('backups');
const MAKOTO = 'char_4217_makoto';
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const PUMY = 'uniequip_002_makoto';
const FORMS = BACKUPS.units[MAKOTO].forms;
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const moduleOf = (tier, id) => id ? formOf(tier, true).modules.find((m) => m.uniEquipId === id) : null;
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_character: { ...dummy('enemy_character'), isCharacter: true },
  enemy_weak_arts: dummy('enemy_weak_arts', { def: 5000, res: 0 }),
  enemy_weak_phys: dummy('enemy_weak_phys', { def: 0, res: 80 }),
  enemy_killer: dummy('enemy_killer', { atk: 1e9, bat: 0.5, range: 1 }),
};

function field({ tier = 6, elite = true, module = null, skill = 2, others = [], enemies = [] } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 120, autoFinish: false, seed: 9,
    flags: { dpInit: 999, dpPerSec: 0, dpMax: 999 },
    hooks: ['damaged', 'heal', 'hit', 'statusApplied', 'fatal', 'death', 'skillStart', 'skillEnd', 'deploy'],
    captureNoisy: true,
    units: [
      { uid: 1, diy: { slot: SLOT[tier], charId: MAKOTO, skillIndex: skill, uniEquipId: module }, elite, row: 10, col: 4 },
      ...others,
    ],
    enemies,
  });
  h.step();
  return { h, u: h.unit(1) };
}

function ready(u) {
  u.skill.charges = u.skill.maxCharges;
  u.skill.sp = u.skill.spCost;
  assert.equal(u.skill.activate('test'), true, `${u.skill.id} should activate`);
}

function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('结城理 is a kit-backed tier-5 / tier-6 自选 pick assigned to 协防, with every official skill and PUM-Y form', () => {
  assert.equal(OPERATOR_KITS[MAKOTO], KITS[MAKOTO]);
  assert.ok(KITTED_CHARS.includes(MAKOTO));
  for (const tier of [5, 6]) assert.ok(diyPool(tier, { data: { chess: CHESS, backups: BACKUPS }, kitted: KITTED_CHARS }).includes(MAKOTO));
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: MAKOTO, skillIndex: 2, uniEquipId: PUMY } },
    { data: { chess: CHESS, backups: BACKUPS }, kitted: KITTED_CHARS }),
  { ok: true, picks: { [SLOT[6]]: { charId: MAKOTO, skillIndex: 2, uniEquipId: PUMY } } });
  assert.equal(BACKUPS.units[MAKOTO].assets.skinId, 'char_4217_makoto@p3r#1');
  assert.deepEqual(BACKUPS.diy.operators[MAKOTO].bonds, ['emptyShip']);

  const forms = [[5, false, null], [6, false, null], [5, true, null], [5, true, PUMY], [6, true, null], [6, true, PUMY]];
  for (const [tier, elite, mod] of forms) for (const skillIndex of [0, 1, 2]) {
    const { h, u } = field({ tier, elite, module: mod, skill: skillIndex });
    const rec = formOf(tier, elite), m = moduleOf(tier, mod);
    assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource],
      [MAKOTO, SLOT[tier], rec.skills[skillIndex].skillId, false, 'skills']);
    assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [rec.stats.maxHp + (m?.attr.maxHp || 0), rec.stats.atk + (m?.attr.atk || 0), rec.stats.def + (m?.attr.def || 0)]);
    assert.deepEqual([u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.s.blockCnt], ['melee', 'phys', false, 2]);
    assert.equal(u.skill.rule, rec.skills[skillIndex].trigger.rule);
    done(h);
  }
});

test('S1: Orpheus trades arts attacks for the lowest-HP <50% ally heal, then attacks normally when none qualifies', () => {
  const { h, u } = field({ tier: 6, skill: 0, others: [{ uid: 2, chessId: 'chess_char_1_01_a', row: 10, col: 5 }] });
  const ally = h.unit(2);
  const enemy = h.spawn('enemy_dummy', { pos: [10, 6] });
  ally.hp = ally.s.maxHp * 0.4;
  ready(u);
  assert.equal(u.mem.makoto.persona, 'orpheus');
  assert.ok(u.trait.doll);
  assert.equal(u.s.blockCnt, 0, 'S1 Orpheus does not inherit S3 block +2');
  assert.ok(h.runUntil(() => h.hooksOf('heal').some((c) => c.source === u && c.target === ally), 3));
  h.run(1.7);
  const hit = h.hooksOf('damaged').find((c) => c.source === u && c.target === enemy);
  assert.equal(hit?.type, 'arts', 'after the ally rises above 50%, Orpheus resumes its arts attack');
  assert.equal(hit?.dmg?.isAttack, true);
  ally.hp = ally.s.maxHp * 0.5;
  const healsAtHalf = h.hooksOf('heal').length;
  h.run(2.2);
  assert.equal(h.hooksOf('heal').length, healsAtHalf, 'exactly 50% HP is not below the S1 threshold');
  done(h);
});

test('S2: Thanatos attacks up to four targets, fears on the official 35% roll, and executes a feared low-HP target', () => {
  const { h, u } = field({ tier: 5, elite: true, skill: 1 });
  const enemy = h.spawn('enemy_dummy', { pos: [10, 5] });
  h.b.rng.chance = (p) => { assert.equal(p, 0.35); return true; };
  ready(u);
  assert.equal(u.mem.makoto.persona, 'thanatos');
  assert.equal(u.profile.maxTargets, 4);
  assert.equal(u.profile.atkScale, 2.2);
  enemy.hp = u.s.atk * 2.4;
  assert.ok(h.runUntil(() => !enemy.alive, 4), 'fear-triggered 2.5× ATK execution');
  assert.ok(h.hooksOf('statusApplied').some((c) => c.target === enemy && c.status === 'fear'));
  assert.ok(h.hooksOf('damaged').some((c) => c.dmg?.tags?.includes('makotoExecute')));
  done(h);
});

test('S2 fear execution aura hits air units once with credited, sourceless true damage', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 1 });
  const flyer = h.spawn('enemy_fly', { pos: [10, 5], route: 2 });
  u.atkCd = 100;
  ready(u);
  flyer.hp = u.s.atk * 2;
  h.b.applyStatus(flyer, 'fear', { duration: 3, source: u });
  assert.ok(h.runUntil(() => !flyer.alive, 0.3), 'the 0.1 s execution scan includes flying enemies');
  const execution = h.hooksOf('damaged').find((c) => c.dmg?.tags?.includes('makotoExecute'));
  assert.equal(execution?.source, null, 'the hit is sourceless');
  assert.equal(execution?.credit, u, 'damage and kill credit remain with Makoto');
  assert.equal(execution?.type, 'true');
  done(h);
});

test('S3 base cycle: Thanatos lethal transition → Orpheus support → 本体, followed by S.E.E.S. total attack', () => {
  const { h, u } = field({ tier: 5, elite: true, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_01_a', row: 10, col: 5 }] });
  const enemy = h.spawn('enemy_dummy', { pos: [10, 6] });
  const ally = h.unit(2);
  ally.hp = ally.s.maxHp * 0.5;
  ready(u);
  assert.equal(u.mem.makoto.persona, 'thanatos');
  assert.equal(u.profile.maxTargets, 4);
  h.run(1.1);
  h.b.dealDamage(enemy, u, { amount: u.s.maxHp * 2, type: 'phys' });
  assert.equal(u.mem.makoto.persona, 'orpheus', 'a lethal hit while Thanatos is present calls Orpheus');
  assert.equal(u.s.blockCnt, 2);
  assert.equal(u.profile.noAttack, false, 'base Orpheus keeps S3 attacks');
  assert.ok(ally.s.dodgePhys >= 0.35 && ally.s.dodgeArts >= 0.35);
  assert.ok(h.runUntil(() => !u.trait.doll, 22), 'the shared 20 s substitute duration returns to the body');
  assert.ok(h.hooksOf('damaged').some((c) => c.source === u && c.target === enemy && c.dmg?.tags?.includes('makotoTotal')));
  assert.equal(u.form, 'makotoAllOut', 'the second talent enters its own protected form');
  assert.ok(u.s.flags.invulnerable && u.s.flags.untargetable && u.s.flags.disarm && u.s.flags.silence);
  const attacks = u.stats.attacks;
  h.run(0.5);
  assert.equal(u.stats.attacks, attacks, 'the All-Out form does not perform normal attacks');
  h.run(1.7);
  assert.equal(u.form, null);
  assert.ok(!u.s.flags.invulnerable);
  done(h);
});

test('S3 weakpoint hits choose physical or arts by DEF / RES mitigation', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  const arts = h.spawn('enemy_weak_arts', { pos: [10, 5], route: 2 });
  const phys = h.spawn('enemy_weak_phys', { pos: [9, 3], route: 2 });
  ready(u);
  assert.equal(u.profile.dmgType, 'arts');
  h.b.dealDamage(u, arts, { amount: 1000, type: 'arts' });
  h.b.dealDamage(u, phys, { amount: 1000, type: 'arts' });
  assert.equal(h.hooksOf('damaged').find((c) => c.target === arts)?.type, 'arts');
  assert.equal(h.hooksOf('damaged').find((c) => c.target === phys)?.type, 'phys');
  done(h);
});

test('S.E.E.S. total attack follows the second talent after S1 or S2 substitute time too', () => {
  for (const skill of [0, 1]) {
    const { h, u } = field({ tier: 6, elite: true, skill });
    const enemy = h.spawn('enemy_dummy', { pos: [10, 6] });
    ready(u);
    assert.ok(h.runUntil(() => !u.trait.doll, 22));
    const hit = h.hooksOf('damaged').find((c) => c.source === u && c.target === enemy && c.dmg?.tags?.includes('makotoTotal'));
    assert.ok(hit, `${u.skill.id} substitute return must trigger the S.E.E.S. total attack`);
    done(h);
  }
});

test('S3 PUM-Y stage 3: Thanatos改 can hit air; Orpheus改 protects all in range and delays capped heals', () => {
  const { h, u } = field({ tier: 6, elite: true, module: PUMY, skill: 2, others: [
    { uid: 2, chessId: 'chess_char_1_01_a', row: 10, col: 5 },
    { uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 4 },
  ] });
  const flyer = h.spawn('enemy_dummy', { pos: [10, 5], route: 2 });
  const ally = h.unit(2);
  const fullAlly = h.unit(3);
  ally.hp = ally.s.maxHp * 0.4;
  ready(u);
  assert.equal(u.profile.canHitFly, true, 'Thanatos改 retains its flyer selector');
  assert.equal(u.findBuff('makoto:persona')?.mods?.atkPct, 1, 'PUM-Y stage 3 replaces the talent-1 ATK bonus with +100%');
  assert.ok(Math.abs(u.findBuff('makoto:persona')?.mods?.hpPct - 0.6) < 1e-9, 'PUM-Y +20% trait and +40% module talent both apply');
  assert.ok(h.runUntil(() => u.mem.makoto.persona === 'orpheus', 6), 'PUM-Y S3 recast switches forms despite 阻回');
  assert.equal(u.s.blockCnt, 2);
  assert.equal(u.profile.noAttack, true, 'Orpheus改 stops normal attacks');
  assert.ok(u.s.flags.silence, 'Orpheus改 carries the documented self-silence state');
  assert.ok(ally.s.dodgePhys < 0.35 && ally.s.dodgeArts < 0.35, '改-form support waits for its 1.5 s Persona transition');
  assert.ok(fullAlly.s.dodgePhys < 0.35 && fullAlly.s.dodgeArts < 0.35);
  const hp = ally.hp;
  h.run(0.4);
  assert.equal(ally.hp, hp, 'the modified heal does not land during the Persona transition');
  h.run(1.1);
  assert.ok(ally.s.dodgePhys >= 0.35 && ally.s.dodgeArts >= 0.35, 'rank-7 S3 blackboard: dodge begins at switch completion');
  assert.ok(fullAlly.s.dodgePhys >= 0.35 && fullAlly.s.dodgeArts >= 0.35, 'evasion reaches full-HP allies too');
  const hpAtSwitch = ally.hp;
  h.run(0.6);
  assert.ok(ally.hp > hpAtSwitch, 'the first delayed heal lands 0.5 s after switch completion');
  assert.ok(flyer.alive);
  done(h);
});
