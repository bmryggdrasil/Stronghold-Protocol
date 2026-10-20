// Schema source for schemas/records.schema.json; semantic references are checked after composition.
import { GRID_SCHEMA, MODS_SCHEMA, SKILL_SPEC_SCHEMA } from './skillSpec.js';
const str = { type: 'string', minLength: 1 }, obj = { type: 'object' };
const ids = { type: 'array', items: str };
const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });
const assetId = { ...str, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };
export const OPERATOR_ART_SCHEMA = { type: 'object', minProperties: 1, additionalProperties: false,
  // art.ref is an installed character id, the same pattern as art.assets: never a path or a URL.
  properties: { ref: assetId, assets: { type: 'object', minProperties: 1, additionalProperties: false,
    properties: Object.fromEntries(['avatar', 'portrait', 'spine', 'voice', 'skillIcon', 'subProfIcon'].flatMap(k => [[k, assetId], [`${k}Golden`, assetId]])) } } };
export const OPERATOR_ORIGIN_SCHEMA = { type: 'object', minProperties: 1, additionalProperties: false, properties: { chessId: assetId, charId: assetId } };
const module = { type: 'object', required: ['uniEquipId', 'level', 'attr', 'talentChanges'], additionalProperties: false, properties: {
  uniEquipId: str, name: nullable('string'), typeName: nullable('string'), typeIcon: nullable('string'), icon: str,
  level: { type: 'integer', minimum: 1, maximum: 3 }, attr: { type: 'object', additionalProperties: false,
    properties: Object.fromEntries('maxHp atk def res aspd cost respawnTime blockCnt bat deployLimit deckStack'.split(' ').map(k => [k, { type: 'number' }])) },
  traitOverride: nullable('object'), talentChanges: { type: 'array', items: obj },
} };
const form = { type: 'object', required: ['stats', 'rangeGrid'], properties: {
  stats: obj, rangeGrid: GRID_SCHEMA, skills: { type: 'array' }, modules: { type: 'array', maxItems: 10, items: module },
  immunities: { type: 'object', patternProperties: { '^[A-Za-z][A-Za-z0-9]*$': { type: 'boolean' } }, additionalProperties: false },
  rangeId: nullable('string'), projectile: str, canHitFly: { type: 'boolean' }, targetPriority: nullable('string'),
  potDown: { type: 'object', patternProperties: { '^[0-4]$': { type: 'object', patternProperties: { '^stats\\.[A-Za-z][A-Za-z0-9]*$': { type: 'number' } }, additionalProperties: false } }, additionalProperties: false },
}, additionalProperties: true };
export const RECORD_SCHEMA = {
  anyOf: [
    { type: 'object', required: ['op', 'charId', 'name', 'profession', 'subProfessionId', 'position', 'rarity', 'as', 'forms', 'skills'],
      additionalProperties: false, properties: {
        op: { enum: [1] }, charId: { ...str, pattern: '^char_x_[A-Za-z0-9_-]+$', maxLength: 64 }, name: str, appellation: str,
        profession: { enum: ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'] }, subProfessionId: str, subProfessionName: { type: 'string' },
        position: { enum: ['MELEE', 'RANGED'] }, rarity: { type: 'integer', minimum: 1, maximum: 6 }, as: { enum: ['chess', 'diy', 'both'] },
        forms: { type: 'object', required: ['normal', 'elite'], properties: { normal: form, elite: form },
          patternProperties: { '^[0-2]/[1-9][0-9]*/[1-9][0-9]*/[0-3]$': form }, additionalProperties: false },
        skills: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', required: ['skillId', 'default'], properties: { skillId: str, default: { type: 'boolean' }, skillSpec: SKILL_SPEC_SCHEMA }, additionalProperties: true } },
        chess: { type: 'object', required: ['tier', 'bonds'], properties: { tier: { type: 'integer', minimum: 1, maximum: 6 }, bonds: { ...ids, minItems: 1 },
          hidden: { type: 'boolean' }, ids: { type: 'object', required: ['normal', 'elite'], additionalProperties: false, properties: { normal: str, elite: str } } }, additionalProperties: true },
        kit: { anyOf: [{ enum: ['generic'] }, { type: 'object', required: ['ref'], properties: { ref: str }, additionalProperties: false },
          { type: 'object', required: ['spec'], properties: { spec: { anyOf: [str, SKILL_SPEC_SCHEMA] } }, additionalProperties: false },
          { type: 'object', required: ['dsl'], properties: { dsl: { $ref: 'dsl.schema.json' } }, additionalProperties: false }] },
        talentMods: MODS_SCHEMA, talents: { type: 'array', items: obj }, trait: obj,
        // [ASSUMED] Origin is provenance; art assets are exact manifest ids, not URLs or copied files.
        origin: OPERATOR_ORIGIN_SCHEMA, art: OPERATOR_ART_SCHEMA,
        nationId: { anyOf: [str, { type: 'null' }] }, powers: ids, dmgType: str, attackKind: str, projectile: str, canHitFly: { type: 'boolean' }, targetPriority: str,
      } },
    { type: 'object', required: ['file', 'id'], additionalProperties: false, properties: {
      file: { enum: ['enemies', 'waves', 'stages', 'modes', 'items', 'bands', 'garrisons', 'effects', 'choices', 'tokens'] },
      id: { ...str, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }, base: str, set: obj, value: obj, special: str,
      kind: { enum: ['bounty', 'tactic'] }, effect: obj,
    } },
  ],
};
export const RECORDS_SCHEMA = { $schema: 'http://json-schema.org/draft-07/schema#', title: 'P1b compact records',
  anyOf: [RECORD_SCHEMA, { type: 'array', items: RECORD_SCHEMA },
    { type: 'object', required: ['records', 'entries'], additionalProperties: false, properties: { records: { enum: [1] }, entries: { type: 'array', items: RECORD_SCHEMA } } }],
};
