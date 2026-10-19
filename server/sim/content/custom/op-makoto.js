// server/sim/content/kits/ops/op-makoto.js — 结城理 (char_4217_makoto), the owner-approved 协防 DIY pick.
// Sources: PRTS 结城理 (talents, skill notes, PUM-Y); cached official character_table / skill_table / battle_equip_table.
// The engine's dollkeeper trait owns the 本体 ⇄ 替身 timer / switch / death rules; this kit owns Persona-specific combat.

import { absoluteRangeKeys } from '../../targeting.js';
import { bodyInKeys } from '../../body.js';
import { COLS } from '../../constants.js';
import { weaknessRetype } from '../items/battle.js';
import { batMod, moduleOn, num, skillBbOf, skillRec, talentBb, traitBb } from '../kits/shared/tier1.js';

const MAKOTO = 'char_4217_makoto';
const S1 = 'skchr_makoto_1';
const S2 = 'skchr_makoto_2';
const S3 = 'skchr_makoto_3';
const S1_X = 'skx_op_makoto_1';
const S2_X = 'skx_op_makoto_2';
const S3_X = 'skx_op_makoto_3';
const isS1 = (id) => id === S1 || id === S1_X;
const isS2 = (id) => id === S2 || id === S2_X;
const isS3 = (id) => id === S3 || id === S3_X;
const PERSONA = 'makoto:persona';
const AIR = Object.freeze({ canHitFly: true });
const TEAM_POWER = 'sees';
const HALF_HP = 0.5;
const ORPHEUS_BLOCK_RESTORE = 99; // dollkeeper applies -99; S3 Orpheus' +2 restores her normal 2 block.
const ALL_OUT_DURATION = 1.6; // Spine: 0.167 s loop + 1.433 s end.
// [ASSUMED] The current official enemy export does not expose the role-unit category; exclude it when a future data source does.
const isCharacterUnit = (enemy) => enemy?.def?.isCharacter === true || enemy?.def?.unitType === 'CHARACTER'
  || enemy?.def?.type === 'CHARACTER' || enemy?.def?.tags?.includes('character');

const personasFor = (skillId) => isS1(skillId) ? 'orpheus' : 'thanatos';
const personaForm = (skillId, persona, modifiedS3) => isS1(skillId) ? 'makotoS1Orpheus'
  : isS2(skillId) ? 'makotoS2Thanatos'
    : persona === 'orpheus' ? (modifiedS3 ? 'makotoS3OrpheusModified' : 'makotoS3Orpheus') : 'makotoS3Thanatos';

function lowestInjured(battle, unit, hpAtMost = 1) {
  return battle.injuredAlliesInKeys(unit.rangeKeySet || unit.rangeKeys, unit)
    .filter((a) => a.kind === 'op' && a.hpRatio < hpAtMost - 1e-9)
    .sort((a, b) => a.hpRatio - b.hpRatio || a.id - b.id)[0] ?? null;
}

/**
 * The body and all three selected skills use the same instant cast in the original mode. In this auto-cast sim an
 * activation from the body requests the dollkeeper's official switch; an S3 activation while Thanatos is active is the
 * documented Thanatos → Orpheus transition. PUM-Y stage 3 grants the one no-SP recast described on PRTS; the sim's normal
 * 3 s auto-operation cooldown delays that automatic activation until after the 1 s switch animation.
 */
function skillSpec(skillId, switchToDoll) {
  return {
    kind: 'instant',
    onEnd({ battle, unit, reason }) {
      if (reason === 'death' || reason === 'substitute' || !unit.alive || !unit.deployed) return;
      const state = unit.mem.makoto;
      if (unit.trait.doll) {
        if (isS3(skillId) && state?.persona === 'thanatos') switchToDoll(battle, unit, 'orpheus', 'skill');
        return;
      }
      unit.mem.makoto.pendingPersona = personasFor(skillId);
      battle.emit('dollSwitch', { unit, reason: 'skill', done: false });
    },
  };
}

export default {
  [MAKOTO]: (bb, chess, def) => {
    const t0 = talentBb(chess, 0);
    const t1 = talentBb(chess, 1);
    const tb = traitBb(chess);
    const b1 = { ...skillBbOf(chess, S1), ...skillBbOf(chess, S1_X) };
    const b2 = { ...skillBbOf(chess, S2), ...skillBbOf(chess, S2_X) };
    const b3 = { ...skillBbOf(chess, S3), ...skillBbOf(chess, S3_X) };
    const s3Rec = skillRec(chess, S3) || skillRec(chess, S3_X);
    const dollGrid = chess?.trait?.rangeGrid ?? def?.trait?.rangeGrid ?? s3Rec?.rangeGrid ?? def?.rangeGrid;
    const s3Range = s3Rec?.rangeGrid ?? dollGrid;
    const hasModule = moduleOn(chess);
    const moduleLevel = hasModule ? Number(chess?.module?.level) || 0 : 0;
    const moduleTalent = (index) => chess?.module?.talentChanges?.find((t) => t?.talentIndex === index)?.bb ?? null;
    const talent0 = hasModule && moduleTalent(0) ? { ...t0, ...moduleTalent(0) } : t0;
    const talent1 = hasModule && moduleTalent(1) ? { ...t1, ...moduleTalent(1) } : t1;
    const modifiedS3 = moduleLevel >= 3;
    const slowDuration = Math.max(0, num(talent0.sluggish));
    const dollAtk = num(talent0.atk);
    const dollHp = num(talent0.max_hp_t1) + num(tb.max_hp);
    const dollBat = batMod(talent0.base_attack_time, chess);
    const s3Targets = Math.max(1, Math.floor(num(b3['attack@max_target'], 1)));
    const auraTargets = Math.max(1, Math.floor(num(b3['attack@max_target_heal'], 1)));

    const switchPersona = (battle, unit, persona, reason) => {
      const state = unit.mem.makoto;
      if (!state || !unit.alive || !unit.deployed || !unit.trait.doll) return false;
      const previousPersona = state.persona;
      const previousHp = unit.hp;
      state.persona = persona;
      state.reason = reason;
      battle.addBuff(unit, {
          key: PERSONA, refresh: 'replace', tags: ['talent'],
          flags: { ...(modifiedS3 && persona === 'orpheus' && isS3(state.skillId) ? { silence: true } : null) },
          mods: {
          atkPct: dollAtk,
          hpPct: dollHp,
          batPct: dollBat,
          ...(persona === 'orpheus' && isS3(state.skillId) ? { blockCnt: ORPHEUS_BLOCK_RESTORE } : null),
          ...(isS3(state.skillId) && persona === 'thanatos' ? { aspd: num(b3['talent@attack_speed']) } : null),
        },
      });
      unit.markDirty();
      unit.hp = Math.min(previousHp, unit.s.maxHp);
      applyPersonaProfile(unit, state, b1, b2, b3, modifiedS3, s3Targets);
      if (dollGrid && unit.rangeGrid !== dollGrid) { unit.rangeGrid = dollGrid; battle.refreshRange(unit); }
      const targetForm = personaForm(state.skillId, persona, modifiedS3);
      const transitioning = modifiedS3 && isS3(state.skillId) && previousPersona === 'thanatos' && persona === 'orpheus';
      const transitionForm = 'makotoS3ThanatosToOrpheus';
      const viewForm = transitioning ? transitionForm : targetForm;
      state.viewForm = viewForm;
      unit.form = viewForm;
      battle.fx('makotoPersona', {
        x: unit.x, y: unit.y, id: unit.id, form: viewForm,
        ...(transitioning ? { dur: 1.5 } : null), persona, reason, skill: `makoto:${persona}`,
      });
      if (transitioning) {
        const formChange = ++state.formChange;
        battle.after(1.5, () => {
          if (!unit.alive || !unit.deployed || !unit.trait.doll || state.persona !== 'orpheus' || state.formChange !== formChange) return;
          state.viewForm = targetForm;
          unit.form = targetForm;
          battle.fx('swap', { x: unit.x, y: unit.y, id: unit.id, form: targetForm });
        }, { owner: unit });
      }
      if (persona === 'orpheus' && isS3(state.skillId)) {
        const startSupport = () => {
          if (!unit.alive || !unit.deployed || !unit.trait.doll || state.persona !== 'orpheus') return;
          pulseOrpheus(battle, unit, state, b3, auraTargets, modifiedS3, true);
          scheduleOrpheusPulse(battle, unit, state, b3, auraTargets, modifiedS3);
        };
        if (transitioning) battle.after(1.5, startSupport, { owner: unit });
        else startSupport();
      }
      return true;
    };

    const totalAttack = (battle, unit) => {
      const scale = num(talent1.atk_scale);
      if (!(scale > 0)) return;
      const team = battle.alliesFor(unit).filter((a) => a.alive && a.deployed && a.kind === 'op'
        && (a.def?.powers?.includes(TEAM_POWER) || a.def?.charId === MAKOTO || a.def?.charId === 'char_x_op_makoto_makoto'));
      for (const member of team) {
        const keys = absoluteRangeKeys(s3Range ?? dollGrid ?? unit.rangeGrid, member.tileR, member.tileC, member.dir, 0);
        const targets = battle.enemiesInKeys(keys, unit, AIR);
        if (!targets.length) continue;
        if (member.id !== unit.id) battle.fx('makotoAllOut', {
          x: member.x, y: member.y, id: unit.id, r: 1.5,
          tiles: keys.map((key) => [Math.floor(key / COLS), key % COLS]), member: member.id, skill: 'makoto:allOut',
        });
        for (const enemy of targets) {
          battle.dealDamage(unit, enemy, { amount: unit.s.atk * scale, type: 'true', isSkill: true, tags: ['talent', 'makotoTotal'] });
        }
      }
    };

    const enterDoll = (battle, unit) => {
      const state = unit.mem.makoto;
      if (!state) return;
      state.skillId = unit.skill?.id ?? chess?.skill?.skillId ?? null;
      state.baseRangeGrid ??= unit.rangeGrid;
      const persona = state.pendingPersona || personasFor(state.skillId);
      state.pendingPersona = null;
      state.executed = new Set();
      switchPersona(battle, unit, persona, 'doll');
      if (slowDuration > 0) {
        for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, AIR)) {
          battle.addBuff(e, { key: `makoto:slow:${unit.id}`, duration: slowDuration, refresh: 'replace', mods: { moveMul: 0.2 } });
        }
        battle.fx('makotoStagger', { x: unit.x, y: unit.y, id: unit.id, r: 1.5, dur: slowDuration, skill: 'makoto:stagger' });
      }
      // PRTS: the modified S3 can be tapped again after Thanatos·改's switch despite 阻回. This one granted
      // recast is consumed by the ordinary auto-operation path; no SP regenerates during either doll form.
      if (modifiedS3 && isS3(state.skillId) && !state.recastGranted && unit.skill && unit.skill.maxCharges === 1) {
        state.recastGranted = true;
        unit.skill.charges = 1;
        unit.skill.sp = unit.skill.spCost;
      }
    };

    return {
      skills: {
        [S1]: skillSpec(S1, switchPersona),
        [S1_X]: skillSpec(S1_X, switchPersona),
        [S2]: skillSpec(S2, switchPersona),
        [S2_X]: skillSpec(S2_X, switchPersona),
        [S3]: skillSpec(S3, switchPersona),
        [S3_X]: skillSpec(S3_X, switchPersona),
      },
      trait: {
        canAttack(battle, unit) {
          const state = unit.mem.makoto;
          if (!state || !unit.trait.doll || state.persona !== 'orpheus' || !isS1(state.skillId)) return true;
          const patient = lowestInjured(battle, unit, HALF_HP);
          this.dmgType = patient ? 'heal' : 'arts';
          this.heal = patient ? { mode: 'single', hpAtMost: HALF_HP - 2e-9 } : null;
          this.healScale = patient ? num(b1['attack@heal_scale']) : 1;
          this.atkScale = patient ? 1 : num(b1['attack@atk_scale'], 1);
          this.canHitFly = false;
          return true;
        },
      },
      talents: [
        { install(battle, unit) { // S2: fear chance per normal hit; the feared executioner is checked every 0.1 s in x-1.
          battle.on('hit', (c) => {
            const state = unit.mem.makoto;
            if (c.source !== unit || !state || !unit.trait.doll || state.persona !== 'thanatos' || !isS2(state.skillId)
              || !c.target?.alive || c.target.side !== 'enemy' || !c.dmg?.isAttack) return;
            // The enemy records do not currently carry an official role-unit discriminator; honor it when supplied.
            if (!isCharacterUnit(c.target) && battle.rng.chance(num(b2['attack@prob'])) && c.target.alive) {
              battle.applyStatus(c.target, 'fear', { duration: num(b2['attack@fear']), source: unit });
              battle.fx('makotoFear', { x: c.target.x, y: c.target.y, id: c.target.id, r: 0.75, dur: num(b2['attack@fear']), skill: 'makoto:fear' });
            }
          }, { owner: unit });
          battle.every(0.1, () => {
            const state = unit.mem.makoto;
            if (!unit.alive || !unit.deployed || !unit.trait.doll || state?.persona !== 'thanatos' || !isS2(state.skillId)) return;
            const range = new Set(unit.rangeKeys);
            for (const id of [...(state.executed || [])]) {
              const e = battle.units.find((x) => x.id === id);
              if (!e?.alive || !bodyInKeys(e, range)) state.executed.delete(id);
            }
              for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, AIR)) {
                if (state.executed.has(e.id) || isCharacterUnit(e) || !e.s.flags.fear || e.hp > unit.s.atk * num(b2['attack@kill_atk_scale'])) continue;
               state.executed.add(e.id);
               battle.fx('makotoExecute', { x: e.x, y: e.y, id: e.id, skill: 'makoto:execute' });
               battle.dealDamage(unit, e, {
                 amount: num(b2['attack@kill_damage'], 9999999), type: 'true', canDodge: false, sourceless: true,
                 isSkill: true, tags: ['skill', 'makotoExecute'],
               });
            }
          }, { owner: unit });
        } },
        { install(battle, unit) { // S3: base-mode weakpoint attacks become Orpheus support; modified mode delays the heal 0.5 s.
          battle.on('hit', (c) => {
            const state = unit.mem.makoto;
            if (c.source === unit && c.target?.side === 'enemy' && isS3(state?.skillId) && state.persona !== null
              && state.persona && c.dmg && (state.persona === 'thanatos' || !modifiedS3)) {
              weaknessRetype(c.dmg, unit, c.target);
            }
          }, { owner: unit, priority: -10 });
        } },
      ],
      install(battle, unit) {
        const originalRange = unit.rangeGrid;
        unit.mem.makoto = {
          persona: null, pendingPersona: null, skillId: unit.skill?.id ?? null, baseRangeGrid: originalRange,
          executed: new Set(), recastGranted: false, formChange: 0, viewForm: null,
        };
        unit.profile.dollForm = () => {
          const state = unit.mem.makoto;
          return personaForm(state?.skillId, state?.pendingPersona || personasFor(state?.skillId), modifiedS3);
        };
        battle.on('deploy', (c) => {
          if (c.unit !== unit || c.move) return;
          unit.mem.makoto = {
            persona: null, pendingPersona: null, skillId: unit.skill?.id ?? null, baseRangeGrid: originalRange,
            executed: new Set(), recastGranted: false, formChange: 0, viewForm: null,
          };
        }, { owner: unit });
        battle.on('dollSwap', (c) => {
          if (c.unit !== unit) return;
          const state = unit.mem.makoto;
          if (c.form === 'doll') { enterDoll(battle, unit); return; }
           if (c.form !== null || !state?.persona) return;
           const endedPersona = state.persona;
           battle.removeBuff(unit, PERSONA);
           for (const ally of battle.allyUnits) battle.removeBuff(ally, `makoto:orchestra:${unit.id}`);
          Object.assign(unit.profile, unit.mem.makotoBaseProfile || {});
          if (state.baseRangeGrid && unit.rangeGrid !== state.baseRangeGrid) { unit.rangeGrid = state.baseRangeGrid; battle.refreshRange(unit); }
          unit.markDirty();
          unit.hp = Math.min(unit.hp, unit.s.maxHp);
          state.persona = null;
          state.executed?.clear();
           unit.form = null;
           state.viewForm = null;
           if (unit.alive && unit.deployed) {
             battle.addBuff(unit, {
               key: 'makoto:allOut', duration: ALL_OUT_DURATION, source: unit, tags: ['talent'],
               flags: { invulnerable: true, untargetable: true, noSp: true, disarm: true, silence: true },
             });
             unit.form = 'makotoAllOut';
             battle.fx('makotoAllOut', { x: unit.x, y: unit.y, id: unit.id, form: 'makotoAllOut', dur: ALL_OUT_DURATION, r: 1.5, skill: 'makoto:allOut' });
             totalAttack(battle, unit);
             battle.after(ALL_OUT_DURATION, () => {
               if (!unit.alive) return;
               unit.form = null;
               battle.fx('swap', { x: unit.x, y: unit.y, id: unit.id, form: null });
             }, { owner: unit });
           }
           battle.fx('makotoPersona', { x: unit.x, y: unit.y, id: unit.id, persona: 'body', from: endedPersona, skill: 'makoto:body' });
        }, { owner: unit });
        battle.on('fatal', (c) => {
          const state = unit.mem.makoto;
           if (c.unit !== unit || c.prevented || !unit.trait.doll || state?.persona !== 'thanatos' || !isS3(state.skillId)) return;
           c.prevented = true;
           switchPersona(battle, unit, 'orpheus', 'fatal');
           unit.hp = Math.max(1, unit.hp);
        }, { owner: unit, priority: 20 });
        battle.on('death', (c) => {
          if (c.unit !== unit) return;
          battle.removeBuff(unit, PERSONA);
         if (unit.mem.makoto) { unit.mem.makoto.persona = null; unit.mem.makoto.executed?.clear(); unit.mem.makoto.formChange++; unit.mem.makoto.viewForm = null; }
          unit.rangeGrid = originalRange;
          Object.assign(unit.profile, unit.mem.makotoBaseProfile || {});
        }, { owner: unit });
        const profile = unit.profile;
        unit.mem.makotoBaseProfile = {
          attack: profile.attack, dmgType: profile.dmgType, canHitFly: profile.canHitFly,
          maxTargets: profile.maxTargets, noAttack: profile.noAttack, projectile: profile.projectile,
          atkScale: profile.atkScale, heal: profile.heal, healScale: profile.healScale,
        };
        if (dollGrid) unit.mem.makotoDollGrid = dollGrid;
      },
    };
  },
};

function applyPersonaProfile(unit, state, b1, b2, b3, modifiedS3, s3Targets) {
  const p = unit.profile;
  p.attack = 'melee';
  p.projectile = 'none';
  p.dmgType = 'arts';
  p.canHitFly = false;
  p.noAttack = false;
  p.heal = null;
  p.healScale = 1;
  p.atkScale = 1;
  p.maxTargets = 1;
  if (isS1(state.skillId)) {
    p.atkScale = num(b1['attack@atk_scale'], 1);
    return;
  }
  if (isS2(state.skillId)) {
    p.atkScale = num(b2['attack@atk_scale'], 1);
    p.maxTargets = Math.max(1, Math.floor(num(b2['attack@max_target'], 1)));
    return;
  }
  if (isS3(state.skillId)) {
    p.atkScale = num(b3['attack@atk_scale'], 1);
    p.maxTargets = s3Targets;
    p.canHitFly = modifiedS3;
    if (state.persona === 'orpheus' && modifiedS3) p.noAttack = true;
  }
}

function scheduleOrpheusPulse(battle, unit, state, bb, maxTargets, modifiedS3) {
  battle.after(1, () => {
    if (!unit.alive || !unit.deployed || !unit.trait.doll || !isS3(state.skillId) || state.persona !== 'orpheus') return;
    pulseOrpheus(battle, unit, state, bb, maxTargets, modifiedS3, false);
    scheduleOrpheusPulse(battle, unit, state, bb, maxTargets, modifiedS3);
  }, { owner: unit });
}

function pulseOrpheus(battle, unit, state, bb, maxTargets, modifiedS3, entering) {
  if (!unit.alive || !unit.deployed || !unit.trait.doll || state.persona !== 'orpheus') return;
  const keys = unit.rangeKeySet || new Set(unit.rangeKeys || []);
  const dodge = num(bb['attack@prob']);
  if (dodge > 0) {
    for (const ally of battle.allyUnits) {
      if (!ally.alive || !ally.deployed || ally.hidden || ally.kind !== 'op' || !battle.allySelectable(ally, unit)
        || !keys.has(ally.tileR * COLS + ally.tileC)) continue;
      battle.addBuff(ally, {
        key: `makoto:orchestra:${unit.id}`, duration: 1.1, refresh: 'replace', source: unit,
        mods: { dodgePhys: dodge, dodgeArts: dodge }, tags: ['skill'],
      });
    }
  }
  const injured = battle.injuredAlliesInKeys(unit.rangeKeySet || unit.rangeKeys, unit)
    .filter((a) => a.kind === 'op' && battle.allySelectable(a, unit) && a.hp < a.s.maxHp - 1e-9)
    .sort((a, b) => a.hpRatio - b.hpRatio || a.id - b.id)
    .slice(0, maxTargets);
  const scale = num(bb['attack@heal_scale']);
  for (const ally of injured) {
    const heal = () => {
      if (!ally.alive || !ally.deployed || !unit.alive || !unit.deployed || !unit.trait.doll || state.persona !== 'orpheus') return;
      battle.heal(unit, ally, unit.s.atk * scale, { tags: ['skill', 'makotoOrpheus'] });
      battle.fx('makotoAura', { x: ally.x, y: ally.y, id: ally.id, persona: 'orpheus', skill: 'makoto:orpheusHeal' });
    };
    if (modifiedS3) battle.after(0.5, heal, { owner: unit });
    else heal();
  }
  if (entering) battle.fx('makotoAura', { x: unit.x, y: unit.y, id: unit.id, r: 1.5, persona: 'orpheus', skill: 'makoto:orpheusAura' });
}
