import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { diyRecord, diyPool } from '../../shared/diy.js';
import { setupUnitKit } from '../../server/sim/content/index.js';
import { checkDiyPicks } from '../../shared/protocol.js';

test('custom operator plugins (op-oblvns and op-makoto) load and play correctly', () => {
  const registry = createPluginRegistry(pluginDirs('.'));
  const loaded = registry.plugins().filter(p => p.class === 'content');
  assert.ok(loaded.some(p => p.id === 'op-oblvns'), 'op-oblvns should be discovered');
  assert.ok(loaded.some(p => p.id === 'op-makoto'), 'op-makoto should be discovered');

  const set = buildContentSet({ registry, ids: ['op-oblvns', 'op-makoto'] });
  assert.equal(set.problems?.length || 0, 0, 'Content set should have 0 problems');
  assert.ok(set.cs, 'cs should be computed');

  assert.ok(set.data.backups.diy.ownedPool.includes('char_x_op_oblvns_oblvns'), 'Sakiko should be in ownedPool');
  assert.ok(set.data.backups.diy.ownedPool.includes('char_x_op_makoto_makoto'), 'Makoto should be in ownedPool');

  const pool6 = diyPool(6, { data: set.data });
  assert.ok(pool6.includes('char_x_op_oblvns_oblvns'), 'Sakiko should be in tier 6 diyPool');
  assert.ok(pool6.includes('char_x_op_makoto_makoto'), 'Makoto should be in tier 6 diyPool');

  const recOblvns = diyRecord('chess_char_6_diy1_a', { charId: 'char_x_op_oblvns_oblvns', skillIndex: 2 }, { elite: true, data: set.data });
  assert.equal(recOblvns.charId, 'char_x_op_oblvns_oblvns');
  assert.equal(recOblvns.name, '丰川祥子');

  const recMakoto = diyRecord('chess_char_6_diy1_a', { charId: 'char_x_op_makoto_makoto', skillIndex: 1 }, { elite: true, data: set.data });
  assert.equal(recMakoto.charId, 'char_x_op_makoto_makoto');
  assert.equal(recMakoto.name, '结城理');

  const mockBattle = {
    on() {},
    addBuff() {},
    after() {},
    every() {},
    _handlerError(ctx, u, e) { throw e; }
  };

  const kitOblvns = setupUnitKit(mockBattle, { uid: 1, kind: 'op', charId: 'char_x_op_oblvns_oblvns', def: recOblvns, mem: {} });
  assert.ok(kitOblvns, 'Sakiko kit should be resolved');
  assert.equal(kitOblvns.skill?.kind, 'duration');

  const kitMakoto = setupUnitKit(mockBattle, { uid: 2, kind: 'op', charId: 'char_x_op_makoto_makoto', def: recMakoto, mem: {} });
  assert.ok(kitMakoto, 'Makoto kit should be resolved');
  assert.equal(kitMakoto.skill?.kind, 'instant');

  // Legacy pick migration
  const legacyPicks = {
    'chess_char_6_diy1_a': { charId: 'char_4182_oblvns', skillIndex: 2 },
    'chess_char_6_diy2_a': { charId: 'char_4217_makoto', skillIndex: 1 },
  };
  const cleaned = checkDiyPicks(legacyPicks, { data: set.data, kitted: set.kitted });
  assert.equal(cleaned.picks['chess_char_6_diy1_a']?.charId, 'char_x_op_oblvns_oblvns');
  assert.equal(cleaned.picks['chess_char_6_diy2_a']?.charId, 'char_x_op_makoto_makoto');
});
