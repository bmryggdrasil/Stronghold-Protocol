import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxFixture } from './helpers/fxFixtures.js';
import { pluginOperatorExtras, parseArgs } from '../tools/fetch-assets.mjs';
import { buildPlan, onlyOperatorPlan } from '../tools/assets/plan.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { mergeOperatorManifest } from '../tools/assets/manifest.mjs';
import { pluginArtGap } from '../server/plugins/artReferences.js';

test('installed plugin references plan official portraits, models, skill icons and LINKAGE voice without executing code', async t => {
  const f = fxFixture(t), id = 'char_9001_guard';
  f.put('data/chess.json', {});
  f.put('data/backups.json', { units: {} });
  f.put('.cache/gamedata/excel/character_table.json', { [id]: { name: 'Guard', subProfessionId: 'lord', nationId: 'test', skills: [{ skillId: 'skchr_guard_1' }] } });
  f.put('.cache/gamedata/excel/skill_table.json', { skchr_guard_1: { iconId: 'guard_one' } });
  f.put('plugins/guard/plugin.json', { operators: ['operators/guard.json'] });
  f.put('plugins/guard/operators/guard.json', { art: { ref: id + '_2' }, unknown: { charId: 'char_9002_unknown' } });
  f.put('plugins/guard/must-not-run.js', Buffer.from('throw new Error("never execute plugin code");'));
  const extras = await pluginOperatorExtras(f.root);
  assert.deepEqual(Object.keys(extras), [id], 'official membership is required; art phase suffixes resolve to the base');
  const plan = onlyOperatorPlan(buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, modelsData: {}, audio: indexAudio({}),
    extraOperators: extras, optionalVoice: true, charword: {
      charWords: { select: { charId: id, wordKey: id, voiceId: 'CN_021', voiceAsset: id + '/CN_021', placeType: 'BATTLE_SELECT' } },
      voiceLangDict: { [id]: { dict: { LINKAGE: { wordkey: id } } } },
    } }), id, 'lord');
  assert.ok(plan.template.chars[id].avatar && plan.template.chars[id].portraitE2);
  assert.equal(plan.models.size, 2, 'front and back models are planned');
  assert.ok(plan.template.skills.guard_one);
  assert.match(plan.template.audio.voiceJp[id].select.alts[0].urls[0], /\/voice\/char_9001_guard\/cn_021\.mp3$/);
  assert.equal(plan.template.audio.voice, undefined, 'a LINKAGE-only operator must not advertise Chinese voice files');
  assert.equal(plan.template.audio.voiceEn, undefined);
});

test('selective operator installation preserves other dubs and official SFX pool controls', () => {
  const id = 'char_9001_guard';
  const current = { chars: { char_1_old: {} }, audio: { voiceEn: { char_1_old: { select: '/old.mp3' } },
    sfx: { units: {}, pools: { old: { maxSoundAllowed: 1 } } } } };
  const partial = { chars: { [id]: {} }, audio: { voiceEn: { [id]: { select: '/new.mp3' } },
    sfx: { units: { [id]: { attack: '/attack.mp3', pools: { attack: 'new' } } }, pools: { new: { maxSoundAllowed: 2 } } } } };
  const merged = mergeOperatorManifest(current, partial, id);
  assert.equal(merged.audio.voiceEn.char_1_old.select, '/old.mp3');
  assert.equal(merged.audio.voiceEn[id].select, '/new.mp3');
  assert.deepEqual(Object.keys(merged.audio.sfx.pools).sort(), ['new', 'old']);
  assert.equal(current.audio.voiceEn[id], undefined, 'the prior manifest is not mutated');
  assert.equal(parseArgs(['--only-operator=' + id]).onlyOperator, id);
  assert.throws(() => parseArgs(['--only-operator=' + id, '--prune']), /preserves unrelated/);
  assert.throws(() => parseArgs(['--only-operator=../../outside']), /official charId/);
});

test('complete downloaded official plugin art closes the setup extraction gap and missing files reopen it', t => {
  const f = fxFixture(t), id = 'char_9001_guard';
  f.put('data/chess.json', {});
  f.put('data/backups.json', { units: {} });
  f.put('.cache/gamedata/excel/character_table.json', { [id]: { phases: [{}, {}, {}] } });
  f.put('plugins/guard/plugin.json', { assets: { chars: { char_x_guard_one: { ref: id } } } });
  const picture = '/assets/char/avatar/guard.png', file = '/assets/spine/op/guard/guard';
  const model = { skel: file + '.skel', atlas: file + '.atlas', textures: [file + '.png'] };
  f.put('data/assets.json', { chars: { [id]: { avatar: picture, portrait: picture, avatarE2: picture, portraitE2: picture, spine: { front: model, back: model } } } });
  for (const url of [picture, model.skel, model.atlas, ...model.textures]) f.put('public' + url, Buffer.from('fixture'));
  assert.deepEqual(pluginArtGap(f.root), [], 'already installed mirrors need no redundant extraction prompt');
  f.put('data/assets.json', { chars: { [id]: { avatar: '/assets/char/avatar/missing.png' } } });
  assert.deepEqual(pluginArtGap(f.root), [id], 'the manifest alone is insufficient');
});
