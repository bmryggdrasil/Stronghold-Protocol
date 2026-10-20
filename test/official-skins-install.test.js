import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_BACK_CHAR_IDS, installOfficialSkins, planOfficialSkins, splitSkinPacks } from '../tools/install-official-skins.mjs';
import { readPluginFolder } from '../server/plugins/registry.js';
import { prepareVisualDoc, layVisualOps } from '../shared/plugins/visual.js';
import { createPluginRegistry } from '../server/plugins/registry.js';
import { createVisualSets } from '../server/plugins/visualSet.js';
import { spineEntry } from '../public/js/assets.js';
import { png, skel, atlas } from './helpers/pluginFixtures.js';

const OP = 'char_102_texas', SKIN = `${OP}@winter#1`, STEM = `${OP}_winter_1`;
const write = (root, rel, content) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), content); };
const json = (root, rel, content) => write(root, rel, JSON.stringify(content));
const fixture = (root, { operators = [OP], back = false, directionless = true } = {}) => {
  const files = {}, charSkins = {}, chars = {};
  for (const charId of operators) {
    const stem = `${charId}_winter_1`, skinId = `${charId}@winter#1`;
    for (const side of [directionless ? 'Spine' : 'Front', ...(back ? ['Back'] : [])]) {
      const base = `spine/${charId}/${stem}/${side}/`;
      Object.assign(files, { [`${base}${stem}.skel`]: skel(), [`${base}${stem}.atlas`]: atlas([`${stem}.png`]),
        [`${base}${stem}.png`]: png(4, 4) });
    }
    Object.assign(files, { [`avatar/ASSISTANT/${stem}.png`]: png(2, 2), [`charpor/${stem}.png`]: png(2, 4) });
    charSkins[skinId] = { skinId, charId, avatarId: stem, portraitId: stem,
      battleSkin: { skinOrPrefabId: `${charId}_winter#1` }, displaySkin: { skinName: '寒冬信使', skinGroupName: '寒武纪/I' } };
    chars[charId] = { avatar: '/base.png' };
  }
  const tree = { sha: 'test-source-revision', truncated: false, tree: Object.entries(files).map(([rel, bytes]) => ({ type: 'blob', path: rel, size: bytes.length,
    sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') })) };
  const table = { charSkins };
  json(root, '.cache/fexli-tree.json', tree); json(root, '.cache/gamedata/excel/skin_table.json', table);
  json(root, 'data/assets.json', { chars });
  for (const [rel, bytes] of Object.entries(files)) write(root, '.cache/official-skins/files/' + rel, bytes);
  return { tree, table, files, base: `spine/${OP}/${STEM}/Spine/` };
};

test('offline owner install packs verified directionless battle outfits and preserves clothing in both directions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-outfits-'));
  try {
    fixture(root);
    const before = fs.readFileSync(path.join(root, 'data/assets.json'));
    const result = await installOfficialSkins(root, { only: [OP], offline: true, log: () => {} });
    assert.equal(result.outfits, 1);
    const dir = path.join(root, 'plugins/official-skins-01');
    const checked = readPluginFolder(dir, { vanilla: { manifest: { chars: { [OP]: {} } }, sha256: null } });
    assert.deepEqual(checked.problems, []);
    assert.deepEqual(checked.warnings, []);
    const art = JSON.parse(fs.readFileSync(path.join(dir, 'assets.json'))).chars[OP].skins[SKIN];
    assert.deepEqual(art.spine.back, art.spine.front, 'rear-facing units retain their chosen clothing');
    const registry = createPluginRegistry({ publicDir: path.join(root, 'public'), dataDir: path.join(root, 'data'),
      packsDir: path.join(root, 'packs'), pluginsDir: path.join(root, 'plugins') });
    const visual = createVisualSets({ registry });
    const resolved = visual.resolve(['official-skins-01']);
    assert.ok(resolved.set, JSON.stringify(resolved));
    const doc = JSON.parse((await visual.doc(resolved.set.vs.slice(0, 16))).body);
    const manifest = layVisualOps({ chars: { [OP]: {} } }, [prepareVisualDoc(doc)]).manifest;
    assert.equal(spineEntry(manifest, OP, { skin: SKIN, back: true }).skel,
      spineEntry(manifest, OP, { skin: SKIN }).skel);
    assert.deepEqual(fs.readFileSync(path.join(root, 'data/assets.json')), before, 'no generated data write');
    await installOfficialSkins(root, { only: [OP], offline: true, log: () => {} });
    assert.equal(fs.readdirSync(path.join(root, 'plugins/_replaced')).length, 1, 'reinstall preserves the previous plugin');
    void visual; void registry;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('default installation retains true rear models for both integrated operators without expanding the whole catalogue', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-outfits-'));
  try {
    const operators = [...DEFAULT_BACK_CHAR_IDS, OP];
    const { tree, table } = fixture(root, { operators, back: true, directionless: false });
    const defaultPlan = planOfficialSkins(table, tree, operators);
    assert.deepEqual(defaultPlan.skins.filter(skin => skin.models.back).map(skin => skin.charId), DEFAULT_BACK_CHAR_IDS);
    assert.equal(planOfficialSkins(table, tree, operators, { back: true }).skins.filter(skin => skin.models.back).length, 3,
      '--back opts the whole selected subset into available rear models');
    const result = await installOfficialSkins(root, { only: operators, offline: true, log: () => {} });
    assert.equal(result.trueBackOutfits, 2);
    assert.deepEqual(result.trueBackOperators, DEFAULT_BACK_CHAR_IDS);
    const registry = createPluginRegistry({ publicDir: path.join(root, 'public'), dataDir: path.join(root, 'data'),
      packsDir: path.join(root, 'packs'), pluginsDir: path.join(root, 'plugins') });
    const visual = createVisualSets({ registry });
    const resolved = visual.resolve(['official-skins-01']);
    assert.ok(resolved.set, JSON.stringify(resolved));
    const doc = JSON.parse((await visual.doc(resolved.set.vs.slice(0, 16))).body);
    const vanilla = { chars: Object.fromEntries(operators.map(id => [id, { spine: { back: { skel: '/default-back.skel' } } }])) };
    const composed = layVisualOps(vanilla, [prepareVisualDoc(doc)]);
    assert.deepEqual(composed.dropped, []);
    for (const charId of DEFAULT_BACK_CHAR_IDS) {
      const skin = `${charId}@winter#1`;
      const front = spineEntry(composed.manifest, charId, { skin });
      const rear = spineEntry(composed.manifest, charId, { skin, back: true });
      assert.match(front.skel, /\/Front\//);
      assert.match(rear.skel, /\/Back\//, 'upward view uses the selected outfit\'s true rear model');
      assert.notEqual(rear.skel, front.skel);
    }
    assert.equal(spineEntry(composed.manifest, OP, { skin: SKIN, back: true }).skel,
      spineEntry(composed.manifest, OP, { skin: SKIN }).skel, 'ordinary outfits keep their clothing with Front reuse');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an altered cached asset is rejected before an installed outfit is replaced', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-outfits-'));
  try {
    const { base } = fixture(root);
    const target = path.join(root, 'plugins/official-skins-01/README.md');
    write(root, 'plugins/official-skins-01/README.md', 'An existing custom plugin');
    fs.appendFileSync(path.join(root, '.cache/official-skins/files', base, STEM + '.skel'), 'changed');
    await assert.rejects(installOfficialSkins(root, { only: [OP], offline: true, log: () => {} }), /Git blob checksum mismatch/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'An existing custom plugin');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('outfits are split below plugin limits; incomplete source indexes and building-only skins are refused', () => {
  assert.deepEqual(splitSkinPacks([{ bytes: 6 }, { bytes: 5 }, { bytes: 4 }], 10).map(b => b.bytes), [6, 9]);
  assert.throws(() => splitSkinPacks([{ skinId: SKIN, bytes: 11 }], 10), /budget/);
  assert.throws(() => planOfficialSkins({ charSkins: {} }, { truncated: true, tree: [] }, [OP]), /Incomplete/);
  const plan = planOfficialSkins({ charSkins: { [SKIN]: { skinId: SKIN, charId: OP } } }, { tree: [] }, [OP]);
  assert.equal(plan.skins.length, 0);
  assert.equal(plan.skipped.length, 1);
});
