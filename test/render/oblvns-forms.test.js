import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const assets = JSON.parse(fs.readFileSync(new URL('../../data/assets.json', import.meta.url)));
const base = assets.chars.char_4182_oblvns.spine;
const lockFile = new URL('../../plugins/official-skins-02/plugin.lock.json', import.meta.url);
const skinModels = fs.existsSync(lockFile) ? Object.entries(JSON.parse(fs.readFileSync(lockFile)).spine)
  .filter(([name]) => name.includes('/char_4182_oblvns/')).map(([skel, meta]) => ({ skel, ...meta })) : [];
let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
async function view(entry, info = {}) {
  const store = { picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: Object.keys(entry.animations).map(name => ({ name })) }), release() {} } };
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), { id: 1, side: 'ally', kind: 'op',
    defId: 'chx_op_oblvns_oblvns_6', spine: 'char_4182_oblvns', skillIndex: 1,
    tier: 6, x: 4, y: 10, maxHp: 1000, ...info });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(v.actor);
  return v;
}
const clip = v => v.actor.current;

for (const [side, entry] of Object.entries(base)) test(`Sakiko S2 ${side}: organ and piano use their own transitions, idle and hit clips`, async () => {
  const v = await view(entry);
  try {
    v.setSkill(true);
    v.setForm('oblvnsS2Organ');
    assert.equal(clip(v), 'Skill_2_Trans_A', 'the actual A→B transition');
    v.actor.update(0.5);
    assert.equal(clip(v), 'Skill_2_Idle_B');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Skill_2_Loop_B');
    v.actor.update(3);
    v.setForm('oblvnsS2Piano');
    assert.equal(clip(v), 'Skill_2_Trans_B', 'the actual B→A transition');
    v.actor.update(0.5);
    assert.equal(clip(v), 'Skill_2_Idle_A');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Skill_2_Loop_A');
    v.actor.update(3);
    v.setForm(null);
    v.setSkill(false);
    assert.equal(clip(v), 'Idle');
  } finally { v.destroy(); }
});

test('Sakiko S2 late view starts on the instrument without replaying its transition', async () => {
  const v = await view(base.front, { form: 'oblvnsS2Organ' });
  try {
    assert.equal(clip(v), 'Skill_2_Idle_B');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Skill_2_Loop_B');
  } finally { v.destroy(); }
});

test('a cosmetic model missing the instrument clips retains its own idle and attack roles', async () => {
  const entry = structuredClone(base.front);
  for (const name of ['Skill_2_Idle_B', 'Skill_2_Loop_B', 'Skill_2_Trans_A']) delete entry.animations[name];
  const v = await view(entry, { form: 'oblvnsS2Organ' });
  try {
    assert.equal(clip(v), 'Idle');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Attack');
  } finally { v.destroy(); }
});

test('installed Sakiko outfit Front/Back share the instrument mapping', { skip: skinModels.length !== 2 }, async () => {
  for (const entry of skinModels) {
    const v = await view(entry, { form: 'oblvnsS2Organ' });
    try {
      assert.equal(clip(v), 'Skill_2_Idle_B');
      v.onAttack(null, 2);
      assert.equal(clip(v), 'Skill_2_Loop_B');
      v.actor.update(3);
      v.setForm('oblvnsS2Piano');
      assert.equal(clip(v), 'Skill_2_Trans_B');
      v.actor.update(0.5);
      assert.equal(clip(v), 'Skill_2_Idle_A');
    } finally { v.destroy(); }
  }
});
