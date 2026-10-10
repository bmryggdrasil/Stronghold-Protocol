// test/render/makoto-forms.test.js — P3R costume's Persona and All-Out Spine form map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMS } from '../../public/js/render/units.js';

const ASSETS = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
const BACKUPS = JSON.parse(readFileSync(new URL('../../data/backups.json', import.meta.url), 'utf8'));
const ID = 'char_4217_makoto';
const animations = ASSETS.chars[ID].spine.front.animations;

function clips(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) clips(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) if (!['via', 'index', 'next'].includes(key)) clips(item, out);
  }
  return out;
}

test('P3R Persona and All-Out form clips all exist in the equipped costume Front skeleton', () => {
  assert.equal(BACKUPS.units[ID].assets.skinId, 'char_4217_makoto@p3r#1');
  const forms = FORMS[ID];
  assert.deepEqual(Object.keys(forms), [
    'makotoS1Orpheus', 'makotoS2Thanatos', 'makotoS3Thanatos', 'makotoS3ThanatosToOrpheus',
    'makotoS3Orpheus', 'makotoS3OrpheusModified', 'makotoAllOut', 'makotoBody',
  ]);
  for (const [key, form] of Object.entries(forms)) {
    for (const clip of clips(form)) assert.ok(animations[clip] > 0, `${key} references missing ${clip}`);
  }
  assert.equal(animations[forms.makotoS3ThanatosToOrpheus.change], 0.5);
  assert.equal(animations[forms.makotoS3ThanatosToOrpheus.end], 1);
  assert.equal(animations[forms.makotoAllOut.change], 0.167);
  assert.equal(animations[forms.makotoAllOut.end], 1.433);
  assert.equal(forms.makotoS3OrpheusModified.roles.attack, null, 'Orpheus·改 has no attack clip');
});
