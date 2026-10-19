// test/content/op_oblvns.test.js — 丰川祥子 (char_4182_oblvns), especially her free-flight notes and S3 dual priority.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const OB = 'char_4182_oblvns';
const SLOT = 'chess_char_6_diy1_a';
const ENEMIES = {
  enemy_note: enemyRec({ key: 'enemy_note', hp: 1e9, speed: 0, def: 0, res: 0 }),
  enemy_res: enemyRec({ key: 'enemy_res', hp: 1e9, speed: 0, def: 10, res: 90 }),
  enemy_def: enemyRec({ key: 'enemy_def', hp: 1e9, speed: 0, def: 300, res: 10 }),
  enemy_mid: enemyRec({ key: 'enemy_mid', hp: 1e9, speed: 0, def: 100, res: 35 }),
};

function field(skillIndex, moduleId = null) {
  const h = makeBattle({
    defs: { enemies: ENEMIES },
    timeLimit: 900,
    autoFinish: false,
    flags: { dpPerSec: 0 },
    hooks: ['damaged', 'skillStart', 'spGain'],
    captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT, charId: OB, skillIndex, ...(moduleId ? { uniEquipId: moduleId } : {}) }, elite: true, row: 10, col: 3 }],
  });
  h.step();
  return { h, u: h.unit(1) };
}

function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('an untargeted ordinary note starts free, then reacquires the closest selectable enemy near its path', () => {
  const { h, u } = field(1);
  const free = u.mem.oblvnsNotes.find((n) => n.tag === 'oblvns:normal');
  assert.ok(free && !free.target, 'the continuous attack produced a real free-flight note');
  u.atkCd = 100;
  const e = h.spawn('enemy_note', { pos: [10, 7] });
  e.x = free.x + 0.45;
  e.y = free.y;
  h.run(0.5);
  assert.equal(free.mode, 'homing');
  assert.equal(free.target, e);
  assert.equal(free.cfg.freeSpeed, 1.3);
  assert.equal(free.cfg.turn, 7 / 30);
  assert.equal(free.cfg.sine, 0.3);
  assert.ok(h.eventsOf('fx').some((ev) => ev[1] === 'oblvnsNote' && ev[4]?.phase === 'target' && ev[4]?.targetId === e.id));
  done(h);
});

test('an ordinary note launched with a target uses the straight target-present flight parameters', () => {
  const { h, u } = field(1);
  const e = h.spawn('enemy_note', { pos: [8, 4] });
  h.b.addBuff(e, { key: 'test:stay', flags: { noMove: true } });
  h.b.addBuff(e, { key: 'test:dodge', mods: { dodgePhys: 1 } });
  u.skill.sp = 0;
  h.step();
  assert.equal(h.b.forceAttack(u), true);
  assert.equal(u.skill.sp, 1, 'attack SP is granted before this projectile reaches its guaranteed dodge');

  const note = u.mem.oblvnsNotes.find((n) => n.tag === 'oblvns:normal' && n.target === e);
  assert.ok(note, 'the ordinary attack captured its in-range target');
  assert.equal(note.cfg.freeSpeed, 2);
  assert.equal(note.cfg.turn, 1 / 6);
  assert.equal(note.cfg.sine, 0);
  done(h);
});

test('a free note grants attack SP on launch without starting an attack animation', () => {
  const { h, u } = field(1);
  u.skill.sp = 0;
  u.atkCd = 0;
  h.events.length = 0;
  const notesBefore = u.mem.oblvnsNotes.length;

  h.step();

  assert.equal(u.mem.oblvnsNotes.length, notesBefore + 1);
  assert.equal(u.skill.sp, 1);
  assert.ok(h.hooksOf('spGain').some((c) => c.unit === u && c.reason === 'attack'));
  assert.equal(h.eventsOf('atk').some((e) => e[1] === u.id), false);
  done(h);
});

test('S3 with no enemies stays in skill idle and emits an untargeted quartet that can reacquire', () => {
  const { h, u } = field(2);
  for (const note of u.mem.oblvnsNotes) note.alive = false;
  u.mem.oblvnsNotes = [];
  u.atkCd = 0;
  h.events.length = 0;
  assert.equal(u.skill.activate('test', { free: true }), true);
  h.step();

  assert.deepEqual(u.mem.oblvnsNotes.map((n) => [n.tag, n.type, n.scale, n.target]), [
    ['oblvns:s3:piano', 'phys', 1.8, null],
    ['oblvns:s3:piano', 'phys', 1.8, null],
    ['oblvns:s3:organ', 'arts', 1.8, null],
    ['oblvns:s3:organ', 'arts', 1.8, null],
  ]);
  assert.ok(h.eventsOf('skill').some((e) => e[1] === u.id && e[2] === 1), 'S3 remains active for the skill-idle pose');
  assert.equal(h.eventsOf('atk').some((e) => e[1] === u.id), false);

  const note = u.mem.oblvnsNotes[0];
  const e = h.spawn('enemy_note', { pos: [10, 7] });
  e.x = note.x + 0.45;
  e.y = note.y;
  u.atkCd = 100;
  h.run(1.2);
  assert.equal(note.mode, 'homing');
  assert.equal(note.target, e);
  done(h);
});

test('S1 emits its eight blackboard-scaled notes in the documented 3.75-degree fan', () => {
  const { h, u } = field(0);
  assert.equal(u.skill.activate('test', { free: true }), true);
  h.run(1.5);
  const notes = u.mem.oblvnsNotes.filter((n) => n.tag === 'oblvns:s1');
  assert.equal(notes.length, 8);
  assert.deepEqual(notes.map((n) => n.scale), [0.8, 0.73, 0.6, 0.47, 0.33, 0.27, 0.13, 0.04]);
  done(h);
});

test('S2 organ notes deal Arts damage; piano notes pierce after the first physical hit', () => {
  {
    const { h, u } = field(1);
    const e = h.spawn('enemy_note', { pos: [8, 4] });
    h.b.addBuff(e, { key: 'test:stay', flags: { noMove: true } });
    h.step();
    assert.equal(u.skill.activate('test', { free: true }), true);
    assert.equal(u.mem.oblvnsMode, 'organ', 'S2 begins in piano and its first switch selects organ');
    assert.equal(h.b.forceAttack(u), true);
    const organ = u.mem.oblvnsNotes.find((n) => n.tag === 'oblvns:s2');
    assert.equal(organ.motion, 'organ');
    assert.equal(organ.type, 'arts');
    h.run(4);
    assert.ok(h.hooksOf('damaged').some((c) => c.target === e && c.dmg.type === 'arts' && c.dmg.tags.includes('oblvns:s2')));
    done(h);
  }
  {
    const { h, u } = field(1);
    const e = h.spawn('enemy_note', { pos: [8, 4] });
    h.b.addBuff(e, { key: 'test:stay', flags: { noMove: true } });
    h.step();
    assert.equal(u.skill.activate('test', { free: true }), true);
    u.skill.end('test');
    assert.equal(u.skill.activate('test', { free: true }), true);
    assert.equal(u.mem.oblvnsMode, 'piano');
    assert.equal(h.b.forceAttack(u), true);
    const piano = u.mem.oblvnsNotes.filter((n) => n.tag === 'oblvns:s2').at(-1);
    assert.equal(piano.motion, 'piano');
    assert.equal(piano.type, 'phys');
    h.run(2);
    assert.ok(piano.hitTargets.has(e), 'piano hits the selected enemy before piercing onward');
    assert.ok(h.hooksOf('damaged').some((c) => c.target === e && c.dmg.type === 'phys' && c.dmg.tags.includes('oblvns:s2')));
    done(h);
  }
});

test('S3 launches two 1.8x physical notes at highest RES and two 1.8x Arts notes at highest DEF', () => {
  const { h, u } = field(2);
  const highRes = h.spawn('enemy_res', { pos: [8, 5] });
  const highDef = h.spawn('enemy_def', { pos: [8, 6] });
  h.spawn('enemy_mid', { pos: [9, 5] });
  h.step();
  assert.equal(u.skill.activate('test', { free: true }), true);
  assert.equal(h.b.forceAttack(u), true);

  const notes = u.mem.oblvnsNotes.filter((n) => n.tag.startsWith('oblvns:s3:'));
  assert.equal(notes.length, 4);
  assert.deepEqual(notes.map((n) => [n.tag, n.type, n.scale, n.target]), [
    ['oblvns:s3:piano', 'phys', 1.8, highRes],
    ['oblvns:s3:piano', 'phys', 1.8, highRes],
    ['oblvns:s3:organ', 'arts', 1.8, highDef],
    ['oblvns:s3:organ', 'arts', 1.8, highDef],
  ]);
  assert.ok(h.eventsOf('fx').some((ev) => ev[1] === 'stageLight'));

  h.run(4);
  const hits = h.hooksOf('damaged').filter((c) => (c.dmg.tags || []).some((tag) => tag.startsWith('oblvns:s3:')));
  assert.ok(hits.some((c) => c.target === highRes && c.dmg.tags.includes('oblvns:s3:piano')), 'piano hits the highest-RES enemy');
  assert.ok(hits.some((c) => c.target === highDef && c.dmg.tags.includes('oblvns:s3:organ')), 'organ hits the highest-DEF enemy');
  done(h);
});

test('LOR-Y grants +12 ASPD only while at least two selectable enemies are in the current range', () => {
  const { h, u } = field(2, 'uniequip_002_oblvns');
  const baseAspd = u.s.aspd;
  assert.equal(u.skill.activate('test', { free: true }), true);
  u.atkCd = 0;
  const tiles = [...u.rangeKeys]
    .map((key) => [Math.floor(key / 21), key % 21])
    .filter(([r, c]) => r !== u.tileR || c !== u.tileC);
  const [aTile, bTile] = tiles;
  const a = h.spawn('enemy_note', { pos: aTile });
  h.b.addBuff(a, { key: `test:stay:${a.id}`, flags: { noMove: true } });
  h.step();
  assert.equal(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).length, 1);
  assert.equal(u.s.aspd, baseAspd, 'one selectable enemy does not meet the module condition');
  assert.ok(h.eventsOf('atk').some((e) => e[1] === u.id), 'a target starts the attack action');

  const b = h.spawn('enemy_note', { pos: bTile });
  h.b.addBuff(b, { key: `test:stay:${b.id}`, flags: { noMove: true } });
  h.step();
  assert.equal(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).length, 2);
  assert.equal(u.s.aspd, baseAspd + 12);

  b.alive = false;
  h.step();
  assert.equal(u.s.aspd, baseAspd);
  done(h);
});

test('Fever gains +3 per note attempt before dodge, without a second post-damage award', () => {
  const { h, u } = field(2);
  u.atkCd = 100;
  for (const note of u.mem.oblvnsNotes) note.alive = false;
  u.mem.oblvnsNotes = [];
  const a = h.spawn('enemy_res', { pos: [10, 4] });
  const b = h.spawn('enemy_def', { pos: [10, 5] });
  for (const e of [a, b]) {
    h.b.addBuff(e, { key: 'test:stay', flags: { noMove: true } });
    h.b.addBuff(e, { key: 'test:dodge', mods: { dodgePhys: 1, dodgeArts: 1 } });
  }
  h.step();
  assert.equal(u.skill.activate('test', { free: true }), true);
  assert.equal(h.b.forceAttack(u), true);
  u.atkCd = 100;
  h.run(4);

  assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target.side === 'enemy').length, 0, 'all four notes were dodged');
  assert.equal(h.b._feverStates.get(u.ownerId)?.points, 12, 'four note hit attempts award 4 × 3, not 4 × 6');
  done(h);
});
