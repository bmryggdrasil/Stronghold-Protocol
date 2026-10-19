// test/render/fxoblvns.test.js — free-flight / homing Ave Mujica notes and the S3 crystal impact.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, FX;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
});
after(() => fake.restore());

const DT = 1 / 120;
const cam = presetCamera('normal', { width: 1600, height: 900 });
const unit = (id, x, y) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, info: { defId: 'x' } });

function makeFx(views) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  const map = new Map(views.map((v) => [v.id, v]));
  const fx = new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0,
    settings: { quality: 'high', damageNumbers: true },
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null,
    view: (id) => map.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
  return { fx, map };
}
const run = (fx, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) fx.update(DT); };

test('the note is a moving projectile, follows its retarget event, and releases on hit', () => {
  const caster = unit(1, 3, 10), target = unit(2, 8, 10);
  const { fx } = makeFx([caster, target]);
  assert.equal(FX.FX_KINDS.oblvnsNote.a, 'none', 'launch records do not also draw a generic burst');
  fx.simFx('oblvnsNote', 3, 10, {
    id: 1, phase: 'launch', noteId: 7, visual: 'organNote', dx: 1, dy: 0,
    freeSpeed: 0.7, trackSpeed: 1, turn: 1 / 12, sine: 0.15, sineSign: 1,
  });
  const note = fx.projs.find((p) => p.noteSim);
  assert.ok(note, 'launch event created a live note');
  run(fx, 0.2);
  assert.ok(note.noteX > 3.1, 'free note moved forward');
  const x0 = note.noteX;
  fx.simFx('oblvnsNote', note.noteX, note.noteY, {
    id: 1, phase: 'target', noteId: 7, targetId: 2, dx: 1, dy: 0,
  });
  assert.equal(note.noteState, 'homing');
  run(fx, 0.15);
  assert.ok(note.noteX > x0, 'homing note continues along its corrected heading');
  fx.simFx('oblvnsNote', target.x, target.y, {
    id: 1, phase: 'hit', noteId: 7, targetId: 2,
  });
  assert.equal(fx.projs.some((p) => p.noteSim), false, 'hit event releases the note');
  assert.ok(fx.counts.particles > 0, 'note hit drew its music impact');
});

test('S3 impact uses a crimson crystal field and red-violet shards', () => {
  const target = unit(2, 8, 10);
  const { fx } = makeFx([target]);
  assert.equal(FX.FX_KINDS.musicBurst.a, 'crystal');
  assert.equal(FX.FX_KINDS.stageLight.c, 0xf52269);
  fx.simFx('musicBurst', target.x, target.y, { id: target.id, r: 1.8 });
  run(fx, 0.05);
  assert.equal(fx.tileFlashes.length, 1, 'the target tile and surrounding diamond flash');
  assert.ok(fx.rings.length >= 2, 'two expanding rings define the impact');
  assert.ok(fx.counts.particles >= 3, 'glow and shard bursts are drawn');
});
