// The installed source records must survive content composition, DIY choices, potential and custom battle kits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource } from '../../server/sim/simdata.js';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const SAKIKO = 'char_x_op_oblvns_oblvns', MAKOTO = 'char_x_op_makoto_makoto';
const set = buildContentSet({ registry: createPluginRegistry(pluginDirs('.')), ids: ['op-oblvns', 'op-makoto'] });
assert.deepEqual(set.problems, []);
const data = new DataSource({ ...set.data, enemies: {
  ...set.data.enemies, enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, speed: 0 }),
} });
const slot = (tier, elite) => `chess_char_${tier}_diy1_${elite ? 'b' : 'a'}`;
const moduleOf = id => id === SAKIKO ? 'uniequip_002_oblvns' : 'uniequip_002_makoto';
function def(id, { tier = 6, elite = true, module = false, potential = 6, skillIndex = 0 } = {}) {
  return data.getDiy(slot(tier, elite), { charId: id, skillIndex, uniEquipId: module ? moduleOf(id) : null }, potential);
}
function field(id, { tier = 6, module = false, skillIndex = 2 } = {}) {
  const h = makeBattle({ data, timeLimit: 120, autoFinish: false, seed: 9,
    flags: { dpInit: 999, dpMax: 999, dpPerSec: 0 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: tier, charId: id, skillIndex, uniEquipId: module ? moduleOf(id) : null }, elite: true, row: 10, col: 4 }],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function activate(u) { u.skill.charges = u.skill.maxCharges; u.skill.sp = u.skill.spCost; assert.equal(u.skill.activate('test'), true); }

test('installed records retain three training statuses and the actual rank-4/rank-7 skills', () => {
  for (const id of [SAKIKO, MAKOTO]) {
    assert.deepEqual(Object.keys(set.data.backups.units[id].forms).sort(), ['2/1/4/0', '2/60/7/1', '2/60/7/3']);
    assert.equal(def(id, { elite: false }).raw.skill.level, 4);
    assert.equal(def(id).raw.skill.level, 7);
  }
  assert.equal(def(SAKIKO, { elite: false }).raw.skill.bb.atk_scale, 0.65);
  assert.equal(def(SAKIKO).raw.skill.bb.atk_scale, 0.8);
  assert.equal(def(MAKOTO, { elite: false }).raw.skill.bb['attack@atk_scale'], 1.5);
  assert.equal(def(MAKOTO).raw.skill.bb['attack@atk_scale'], 2.1);
});

for (const id of [SAKIKO, MAKOTO]) test(`${id}: stage 1/3 modules and potential 1/6 survive real DIY loadouts`, () => {
  for (const tier of [5, 6]) for (const module of [false, true]) {
    const full = def(id, { tier, module }), low = def(id, { tier, module, potential: 1 });
    assert.ok(full && low, 'module must be a valid selectable DIY option');
    assert.equal(full.raw.stats.atk - low.raw.stats.atk, id === SAKIKO ? 26 : 34);
    assert.equal(low.raw.stats.cost - full.raw.stats.cost, 2);
    assert.equal(low.raw.stats.respawnTime - full.raw.stats.respawnTime, id === SAKIKO ? 4 : 0);
    if (module) {
      assert.equal(full.raw.module.active, true);
      assert.equal(full.raw.module.level, tier === 5 ? 1 : 3);
      assert.ok(full.raw.stats.atk > def(id, { tier }).raw.stats.atk);
      assert.ok(full.raw.module.name);
      const baseTalent = low.raw.talents[0].bb;
      if (id === MAKOTO) assert.equal(baseTalent.atk, tier === 5 ? 0.8 : 0.95);
      else assert.equal(baseTalent.max_cnt, tier === 5 ? 10 : 12);
    } else assert.equal(full.raw.module.active, false);
  }
});

test('LOR-Y only removes skill ranged reduction when equipped and grants crowd ASPD', () => {
  for (const module of [false, true]) {
    const { h, u } = field(SAKIKO, { module });
    h.spawn('enemy_test', { pos: [10, 6] }); h.spawn('enemy_test', { pos: [10, 7] });
    activate(u); u.atkCd = 0; h.step();
    const notes = u.mem.oblvnsNotes.filter(n => n.tag.startsWith('oblvns:s3:'));
    assert.ok(notes.length > 0);
    assert.ok(notes.every(n => n.dmgMul === (module ? 1 : 0.8)));
    h.run(0.6);
    const crowd = u.buffs.find(b => b.key === 'module:oblvns:crowd');
    assert.equal(crowd?.mods.aspd ?? 0, module ? 12 : 0);
    checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
  }
});

test('PUM-Y stage 1/3 changes Persona HP; stage 3 unlocks the modified S3 form', () => {
  for (const [tier, module, hpPct, modified] of [[5, false, 0.35, false], [5, true, 0.55, false], [6, true, 0.6, true]]) {
    const { h, u } = field(MAKOTO, { tier, module });
    activate(u);
    assert.ok(Math.abs(u.findBuff('makoto:persona')?.mods.hpPct - hpPct) < 1e-9);
    assert.equal(u.profile.canHitFly, modified);
    assert.equal(u.mem.makoto.recastGranted, modified);
    activate(u); h.run(1.6);
    assert.equal(u.form, modified ? 'makotoS3OrpheusModified' : 'makotoS3Orpheus');
    checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
  }
});
