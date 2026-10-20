// Exercise the installed plugin records through the real DIY -> DataSource -> Battle path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource } from '../../server/sim/simdata.js';
import { CUSTOM_KITS } from '../../server/sim/content/customKits.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { fxForm } from '../../shared/protocol.js';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const SAKIKO = 'char_x_op_oblvns_oblvns';
const MAKOTO = 'char_x_op_makoto_makoto';
const set = buildContentSet({ registry: createPluginRegistry(pluginDirs('.')), ids: ['op-oblvns', 'op-makoto'] });

function field(charId, skillIndex, others = []) {
  const data = new DataSource({ ...set.data, enemies: {
    ...set.data.enemies, enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, speed: 0 }),
  } });
  const h = makeBattle({ data, timeLimit: 120, autoFinish: false, seed: 9,
    flags: { dpInit: 999, dpMax: 999, dpPerSec: 0 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId, skillIndex }, elite: true, row: 10, col: 4 }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function activate(u) {
  u.skill.charges = u.skill.maxCharges;
  u.skill.sp = u.skill.spCost;
  assert.equal(u.skill.activate('test'), true);
}
function done(h) {
  checkInvariants(h.b);
  assert.deepEqual(h.b.errors, []);
}

test('custom kits are isolated to the two plugin identities', () => {
  assert.deepEqual(Object.keys(CUSTOM_KITS).sort(), [MAKOTO, SAKIKO].sort());
});

for (const charId of [SAKIKO, MAKOTO]) for (const skillIndex of [0, 1, 2]) {
  test(`${charId} S${skillIndex + 1} runs the authored skill in a real plugin battle`, () => {
    const { h, u } = field(charId, skillIndex);
    const enemy = h.spawn('enemy_test', { pos: [10, 5] });
    assert.equal(u.kit.skillSource, 'skills');
    activate(u);
    h.run(4);
    assert.ok(enemy.hp < enemy.s.maxHp, 'the selected skill deals damage');
    if (charId === MAKOTO) {
      assert.equal(u.mem.makoto.persona, skillIndex === 0 ? 'orpheus' : 'thanatos');
      assert.ok(u.form.startsWith('makotoS'));
    } else assert.ok(h.eventsOf('fx').some(e => e[1] === 'oblvnsNote'));
    done(h);
  });
}

test('Sakiko S1 reads all eight multipliers from the namespaced skill blackboard', () => {
  const { h, u } = field(SAKIKO, 0);
  activate(u);
  h.run(1.5);
  const bb = u.def.raw.skill.bb;
  const want = Array.from({ length: 8 }, (_, i) => bb[i ? `atk_scale_${i + 1}` : 'atk_scale']);
  assert.deepEqual(u.mem.oblvnsNotes.filter(n => n.tag === 'oblvns:s1').map(n => n.scale), want);
  done(h);
});

test('Sakiko S2 uses the declared ASPD and the aura uses the actual board width', () => {
  const { h, u } = field(SAKIKO, 1, [{ uid: 2, chessId: 'chess_char_1_01_a', row: 10, col: 5 }]);
  h.run(0.6);
  const ally = h.unit(2);
  const aura = ally.buffs.find(b => b.key === 'talent:oblvns:courage');
  assert.ok(aura, 'an allied operator in range receives the talent aura');
  activate(u);
  assert.equal(u.mem.oblvnsMode, 'organ');
  assert.equal(u.form, 'oblvnsS2Organ');
  assert.equal(unitInfo(u).form, 'oblvnsS2Organ', 'late observers receive the current instrument');
  assert.ok(h.eventsOf('fx').some(e => fxForm(e) === 'oblvnsS2Organ'));
  assert.equal(u.buffs.find(b => b.key === 'skill:oblvns:dance')?.mods.aspd,
    u.def.raw.skill.bb.attack_speed ?? u.def.raw.skill.bb['attack@attack_speed']);
  u.skill.stop();
  assert.equal(u.form, null);
  assert.ok(h.eventsOf('fx').some(e => fxForm(e) === null), 'skill end restores the default model roles');
  activate(u);
  assert.equal(u.mem.oblvnsMode, 'piano');
  assert.equal(u.form, 'oblvnsS2Piano');
  assert.ok(h.eventsOf('fx').some(e => fxForm(e) === 'oblvnsS2Piano'));
  done(h);
});

test('Sakiko S3 uses its declared damage scale for all four untargeted notes', () => {
  const { h, u } = field(SAKIKO, 2);
  u.mem.oblvnsNotes.length = 0;
  u.atkCd = 0;
  activate(u);
  h.step();
  const notes = u.mem.oblvnsNotes.filter(n => n.tag.startsWith('oblvns:s3:'));
  assert.equal(notes.length, 4);
  assert.deepEqual(notes.map(n => [n.type, n.scale]), [
    ['phys', u.def.raw.skill.bb['attack@atk_scale']], ['phys', u.def.raw.skill.bb['attack@atk_scale']],
    ['arts', u.def.raw.skill.bb['attack@atk_scale']], ['arts', u.def.raw.skill.bb['attack@atk_scale']],
  ]);
  done(h);
});

test('Makoto returns from her substitute and performs the S.E.E.S. total attack', () => {
  const { h, u } = field(MAKOTO, 2);
  h.spawn('enemy_test', { pos: [10, 6] });
  activate(u);
  assert.ok(u.trait.doll);
  assert.ok(h.runUntil(() => !u.trait.doll, 22));
  assert.ok(h.hooksOf('damaged').some(c => c.source === u && c.dmg.tags?.includes('makotoTotal')));
  assert.equal(u.form, 'makotoAllOut');
  h.run(1.8);
  assert.equal(u.form, null);
  done(h);
});
