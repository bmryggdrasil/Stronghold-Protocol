#!/usr/bin/env node
// Refresh the two built-in plugin sources from local official tables; never downloads or rewrites data/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../server/data.js';
import { localOfficialUnits } from '../server/plugins/officialUnits.js';
import { statusKey } from '../shared/standIn.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = getData(), derive = localOfficialUnits(path.join(root, 'data'));
const slots = Object.values(data.backups.diy.slots);
const statuses = [...new Map(Object.keys(data.backups.diy.slots).flatMap(id => [data.chess[id].status,
  data.chess[data.backups.diy.slots[id].goldenId].status]).map(s => [statusKey(s), s])).values()];
const normal = statuses.find(s => s.equipLevel === 0);
const elite = data.chess[slots.find(s => s.tier === 6).goldenId].status;

for (const [id, short, official] of [['op-oblvns', 'oblvns', 'char_4182_oblvns'], ['op-makoto', 'makoto', 'char_4217_makoto']]) {
  const file = path.join(root, 'plugins', id, 'operators', `${short}.json`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { unit } = derive(official, statuses);
  const skills = new Map(record.skills.map(s => [s.iconId, s]));
  const forms = Object.fromEntries(Object.entries(unit.forms).map(([key, form]) => [key, {
    ...form,
    skills: form.skills.map(s => {
      const original = skills.get(s.skillId);
      if (!original) throw new Error(`missing custom skill alias for ${s.skillId}`);
      return { ...s, skillId: original.skillId, default: original.default };
    }),
  }]));
  record.forms = { normal: forms[statusKey(normal)], elite: forms[statusKey(elite)],
    ...Object.fromEntries(Object.entries(forms).filter(([key]) => key !== statusKey(normal) && key !== statusKey(elite))) };
  // Top-level fallbacks remain valid for compact-record consumers; exact forms retain per-status skill values.
  record.trait = record.forms.normal.trait;
  record.talents = record.forms.normal.talents;
  record.skills = record.forms.normal.skills;
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  console.log(`${id}: ${Object.keys(forms).length} statuses, official module stages and lower-potential data`);
}
