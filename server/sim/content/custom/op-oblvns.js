// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit:
// 6★ 领主 (近卫), 联动干员 (Ave Mujica AM01), 联动皮肤【旋律的主人】.
// 全技能、双天赋、特性与模组 (LOR-Y) 完整实现及 Fever 狂热机制复刻.
// Note flight and S3 priorities: https://prts.wiki/w/丰川祥子 (notes under 天赋 and S1–S3 remarks).

import { num, talentBb, traitBb, skillRec, up, installAura, moduleOn } from '../kits/shared/tier1.js';
import { sortEnemyTargets, canTargetEnemy } from '../../targeting.js';
import { hasHp } from '../../damage.js';
import { dirVec } from '../../dir.js';
import { COLS } from '../../constants.js';
import { cos, hypot, sin } from '../../detmath.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';
const S1_X = 'skx_op_oblvns_1';
const S2_X = 'skx_op_oblvns_2';
const S3_X = 'skx_op_oblvns_3';
const isS1 = (id) => id === S1 || id === S1_X;
const isS2 = (id) => id === S2 || id === S2_X;
const isS3 = (id) => id === S3 || id === S3_X;
const moduleY = (chess) => moduleOn(chess) && chess.module.id === 'uniequip_002_oblvns';

const FEVER_CAP = 450;
const FEVER_DURATION = 20;
const S2_BUFF = 'skill:oblvns:dance';
const S3_STAGE_BUFF = 'skill:oblvns:echo';
const ASPD_AURA_KEY = 'talent:oblvns:courage';
const T1_PEN_KEY = 'talent:oblvns:notes:pen';
const MODULE_ASPD_KEY = 'module:oblvns:crowd';
const NOTE_PI = 3.141592653589793;
const NOTE_TAU = 6.283185307179586;
const NOTE_COLLISION_RADIUS = 0.24; // [ASSUMED] PRTS describes collision only for S2 piano's 0.8 radius.
// Update interval / minimum free flight / sine motion / homing speed and turn weight, read from PRTS.
const NOTE_MOTION = Object.freeze({
  normal: Object.freeze({ update: 0.4, freeTime: 0.1, freeSpeed: 1.3, targetedFreeSpeed: 2, trackSpeed: 2, turn: 1 / 6, untargetedTurn: 7 / 30, seek: 1, sine: 0.3 }),
  s1: Object.freeze({ update: 0.2, freeTime: 0.6, freeSpeed: 1.7, trackSpeed: 2.2, turn: 1 / 6, seek: 1, sine: 0.3 }),
  piano: Object.freeze({ update: 0.2, freeTime: 0.4, freeSpeed: 1.9, trackSpeed: 3.5, turn: 1 / 2, seek: 0.8, sine: 0.4 }),
  organ: Object.freeze({ update: 0.4, freeTime: 0.4, freeSpeed: 0.7, trackSpeed: 1, turn: 1 / 12, seek: 1, sine: 0.15 }),
  s3: Object.freeze({ update: 0.4, freeTime: 0.8, freeSpeed: 0.8, trackSpeed: 1.3, turn: 1 / 4, seek: 1, sine: 0.5 }),
});

const AIR = Object.freeze({ canHitFly: true });

const R3_21 = Object.freeze([
  [2, 0], [2, 1],
  [1, 0], [1, 1], [1, 2], [1, 3],
  [0, 0], [0, 1], [0, 2], [0, 3],
  [-1, 0], [-1, 1], [-1, 2], [-1, 3],
  [-2, 0], [-2, 1]
]);

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const noteCanTarget = (unit, target) => !!target && canTargetEnemy(unit, target, AIR);

function noteDirection(unit, degrees) {
  const [dr, dc] = dirVec(unit.dir);
  const a = degrees * NOTE_PI / 180;
  const c = cos(a), s = sin(a);
  return { x: dc * c - dr * s, y: dr * c + dc * s };
}

function emitNote(battle, unit, {
  target = null, visual = 'sonicNote', type = 'arts', scale = 1, isSkill = false,
  tag = 'oblvns:note', motion = 'normal', angle = null, rangedScale = 0.8, impactFx = false, announce = false,
  recoverSpOnLaunch = false,
}) {
  const cfg = NOTE_MOTION[motion] || NOTE_MOTION.normal;
  const targetable = noteCanTarget(unit, target) ? target : null;
  const noteCfg = motion === 'normal'
    ? {
        ...cfg,
        freeSpeed: targetable ? cfg.targetedFreeSpeed : cfg.freeSpeed,
        turn: targetable ? cfg.turn : cfg.untargetedTurn,
        sine: targetable ? 0 : cfg.sine,
      }
    : cfg;
  const direction = noteDirection(unit, angle == null ? battle.rng.range(-20, 20) : angle);
  const notes = unit.mem.oblvnsNotes ??= [];
  unit.mem.oblvnsNoteSeq ??= 0;
  const note = {
    id: ++unit.mem.oblvnsNoteSeq,
    x: unit.x, y: unit.y,
    vx: direction.x, vy: direction.y,
    freeX: unit.x, freeY: unit.y, freeDistance: 0,
    sineSign: battle.rng() < 0.5 ? -1 : 1,
    mode: 'free', target: targetable,
    age: 0, createdAt: battle.time, trackAt: battle.time + noteCfg.freeTime, nextCheck: battle.time + noteCfg.update,
    outsideAt: null, alive: true, piercingUntil: 0, hitTargets: new Set(),
    visual, type, scale, attack: unit.s.atk * unit.s.atkScaleMul, impactFx,
    dmgMul: unit.blocking.length || (unit.skill?.active && moduleY(unit.def?.raw)) ? 1 : rangedScale,
    isSkill, tag, motion, cfg: noteCfg, rangeKeys: new Set(unit.rangeKeys || []),
  };
  notes.push(note);
  if (recoverSpOnLaunch && unit.skill?.spType === 'attack') unit.skill.gainSp(1, 'attack');
  if (announce) battle._ev(['atk', unit.id, targetable?.id ?? null, 'oblvnsSilent']);
  battle.fx('oblvnsNote', {
    x: note.x, y: note.y, id: unit.id, phase: 'launch', noteId: note.id, visual,
    dx: note.vx, dy: note.vy, freeSpeed: noteCfg.freeSpeed, trackSpeed: noteCfg.trackSpeed,
    turn: noteCfg.turn, update: noteCfg.update, freeTime: noteCfg.freeTime, sine: noteCfg.sine,
    sineSign: note.sineSign, sound: motion,
  });
  return note;
}

function moveFree(note, dt) {
  note.freeDistance += note.cfg.freeSpeed * dt;
  const periods = Math.min(3, Math.floor(note.freeDistance / NOTE_TAU) + 1);
  const lateral = note.sineSign * note.cfg.sine * periods * sin(note.freeDistance);
  const leftX = -note.vy, leftY = note.vx;
  note.x = note.freeX + note.vx * note.freeDistance + leftX * lateral;
  note.y = note.freeY + note.vy * note.freeDistance + leftY * lateral;
}

function setNoteTarget(battle, unit, note, target) {
  note.target = target;
  note.mode = target ? 'homing' : 'free';
  if (!target) {
    note.freeX = note.x; note.freeY = note.y; note.freeDistance = 0;
    note.trackAt = battle.time + note.cfg.freeTime;
    note.nextCheck = battle.time + note.cfg.update;
  }
  battle.fx('oblvnsNote', {
    x: note.x, y: note.y, id: unit.id, phase: 'target', noteId: note.id,
    targetId: target?.id ?? null, dx: note.vx, dy: note.vy,
  });
}

function dealNoteDamage(battle, unit, note, target) {
  if (!target || !target.alive || !hasHp(target)) return;
  battle.dealDamage(unit, target, {
    amount: note.attack * note.scale * note.dmgMul,
    type: note.type, isSkill: note.isSkill, tags: note.isSkill ? ['skill', note.tag] : [note.tag],
  });
  if (note.impactFx) battle.fx('musicBurst', { x: target.x, y: target.y, id: target.id, r: 1.8 });
}

function finishNote(battle, unit, note, target = null) {
  if (!note.alive) return;
  note.alive = false;
  dealNoteDamage(battle, unit, note, target);
  battle.fx('oblvnsNote', {
    x: note.x, y: note.y, id: unit.id, phase: target ? 'hit' : 'end',
    noteId: note.id, targetId: target?.id ?? null, visual: note.visual,
  });
}

function tickNotes(battle, unit, dt) {
  const notes = unit.mem.oblvnsNotes || [];
  const now = battle.time;
  for (const note of notes) {
    if (!note.alive) continue;
    if (!up(unit) && note.mode !== 'homing') { finishNote(battle, unit, note); continue; }
    if (note.mode === 'homing') {
      if (!noteCanTarget(unit, note.target)) {
        setNoteTarget(battle, unit, note, null);
      } else {
        const dx = note.target.x - note.x, dy = note.target.y - note.y;
        const d = hypot(dx, dy);
        if (d > 1e-8) {
          const vx = note.vx * (1 - note.cfg.turn) + (dx / d) * note.cfg.turn;
          const vy = note.vy * (1 - note.cfg.turn) + (dy / d) * note.cfg.turn;
          const v = hypot(vx, vy);
          if (v > 1e-8) { note.vx = vx / v; note.vy = vy / v; }
        }
        const step = note.cfg.trackSpeed * dt;
        note.x += note.vx * step; note.y += note.vy * step;
        const hit = battle.enemiesInRadius(note.x, note.y, note.motion === 'piano' ? 0.8 : NOTE_COLLISION_RADIUS)
          .find((e) => e === note.target && canTargetEnemy(unit, e, AIR));
        if (hit) {
          if (note.motion === 'piano') {
            dealNoteDamage(battle, unit, note, hit);
            note.hitTargets.add(hit);
            note.mode = 'piercing'; note.target = null; note.piercingUntil = now + 0.5;
            battle.fx('oblvnsNote', {
              x: note.x, y: note.y, id: unit.id, phase: 'pierce', noteId: note.id,
              dx: note.vx, dy: note.vy,
            });
            battle.fx('oblvnsNote', { x: note.x, y: note.y, id: unit.id, phase: 'impact', noteId: note.id, targetId: hit.id });
          } else {
            finishNote(battle, unit, note, hit);
            continue;
          }
        }
      }
    }

    if (note.mode === 'piercing') {
      note.x += note.vx * 3 * dt; note.y += note.vy * 3 * dt;
      for (const e of battle.enemiesInRadius(note.x, note.y, 0.8)) {
        if (note.hitTargets.has(e) || !canTargetEnemy(unit, e, AIR)) continue;
        note.hitTargets.add(e);
        dealNoteDamage(battle, unit, note, e);
      }
      if (now >= note.piercingUntil - 1e-9) finishNote(battle, unit, note);
      continue;
    }

    if (note.mode === 'free') {
      moveFree(note, dt);
      if (now + 1e-9 >= note.nextCheck) {
        note.nextCheck += note.cfg.update;
        let target = note.target;
        if (!noteCanTarget(unit, target)) {
          const candidates = battle.enemiesInRadius(note.x, note.y, note.cfg.seek)
            .filter((e) => noteCanTarget(unit, e));
          candidates.sort((a, b) => hypot(a.x - note.x, a.y - note.y) - hypot(b.x - note.x, b.y - note.y) || a.spawnSeq - b.spawnSeq);
          target = candidates[0] || null;
        }
        if (target && now + 1e-9 >= note.trackAt) setNoteTarget(battle, unit, note, target);
        else note.target = target;
      }
    }

    const key = Math.round(note.y) * COLS + Math.round(note.x);
    if (!note.rangeKeys.has(key) && note.mode !== 'homing') note.outsideAt ??= now;
    else note.outsideAt = null;
    if (note.outsideAt != null && now - note.outsideAt >= 1 - 1e-9) finishNote(battle, unit, note);
  }
  unit.mem.oblvnsNotes = notes.filter((n) => n.alive);
}

export const isMujica = (a) => {
  if (!a || a.kind !== 'op') return false;
  const raw = a.def?.raw;
  const team = raw?.teamId ?? a.def?.teamId;
  if (team === 'mujica') return true;
  const id = String(raw?.charId ?? a.def?.charId ?? a.id ?? '');
  if (id.includes('oblvns') || id.includes('amoris') || id.includes('dolris') || id.includes('tmoris') || id.includes('mortis')) return true;
  const disp = String(raw?.displayNumber ?? a.def?.displayNumber ?? '');
  return disp.startsWith('AM');
};

function getFeverState(battle, ownerId) {
  let m = battle._feverStates;
  if (!m) battle._feverStates = m = new Map();
  let s = m.get(ownerId);
  if (!s) {
    s = { points: 0, active: false, timer: 0, protectedUnits: new Set() };
    m.set(ownerId, s);
  }
  return s;
}

function triggerFever(battle, ownerId) {
  const s = getFeverState(battle, ownerId);
  s.active = true;
  s.points = FEVER_CAP;
  s.timer = FEVER_DURATION;
  s.protectedUnits.clear();

  battle.fx('feverStart', { x: 0, y: 0, id: null });
  const allies = battle.allyUnits.filter((a) => a.ownerId === ownerId && isMujica(a));
  for (const a of allies) {
    battle.applyStatus(a, 'fever', { duration: FEVER_DURATION });
    if (a.skill && !a.skill.active && !a.skill.noSkill && a.skill.kind !== 'passive') {
      a.skill.sp = a.skill.spCost;
      a.skill.charges = a.skill.maxCharges;
      a.skill.activate('fever', { free: true });
    }
  }
}

function addFever(battle, unit, n) {
  if (!unit || unit.side !== 'ally') return;
  const s = getFeverState(battle, unit.ownerId);
  if (s.active) return;
  s.points += n;
  if (s.points >= FEVER_CAP) {
    triggerFever(battle, unit.ownerId);
  }
}

export default {
  char_4182_oblvns: (bb, chess) => {
    const t0 = talentBb(chess, 0); // 颂乐音符
    const t1 = talentBb(chess, 1); // 毋畏遗忘
    const tb = traitBb(chess);
    const b1 = { ...bbOf(chess, S1), ...bbOf(chess, S1_X) };
    const b2 = { ...bbOf(chess, S2), ...bbOf(chess, S2_X) };
    const b3 = { ...bbOf(chess, S3), ...bbOf(chess, S3_X) };

    const grid3 = (skillRec(chess, S3_X) ?? skillRec(chess, S3))?.rangeGrid ?? R3_21;
    const rangedScale = num(tb.atk_scale, 0.8);
    const hasModuleY = moduleY(chess);

    // T1 values (base: def 3%, res 2%, max 10; module: def 5%, res 2.5%, max 12)
    const defPenPerNote = num(t0.def_penetrate_ratio, 0.03);
    const resPenPerNote = num(t0.magic_resist_penetrate_ratio, 0.02);
    const maxNoteStacks = Math.max(1, Math.floor(num(t0.max_cnt, 10)));
    const moduleAspd = num(tb.attack_speed, 12);

    // T2 values (aspd aura: 16 pot, 12 base; fever gain: 3)
    const aspdAura = num(t1.attack_speed, 16);
    const feverPerHit = num(t1.cnt, 3);

    // S1 scales
    const s1Scales = [
      num(b1.atk_scale, 0.8),
      num(b1.atk_scale_2, 0.73),
      num(b1.atk_scale_3, 0.6),
      num(b1.atk_scale_4, 0.47),
      num(b1.atk_scale_5, 0.33),
      num(b1.atk_scale_6, 0.27),
      num(b1.atk_scale_7, 0.13),
      num(b1.atk_scale_8, 0.04)
    ];

    // S2 parameters
    const s2AtkPct = num(b2['attack@atk'], 0.75);
    const s2Aspd = num(b2.attack_speed ?? b2['attack@attack_speed'], 110);

    // S3 parameters
    const s3AtkScale = num(b3['attack@atk_scale'], 1.8);

    return {
      trait: {
        profile: {
          projectile: 'oblvnsSilent',
          canHitFly: true,
          attack: 'ranged',
          hitsFn: () => 0,
        },
        dmgMul: (battle, unit, target) => {
          // If in skill and carrying LOR-Y module: "技能期间远程攻击不再降低攻击力"
          if (unit.skill?.active && hasModuleY) return 1;
          if (target.blockedBy === unit) return 1;
          const [dr, dc] = dirVec(unit.dir);
          const fr = unit.tileR + dr, fc = unit.tileC + dc;
          const onTile = (target.tileR === unit.tileR && target.tileC === unit.tileC) || (target.tileR === fr && target.tileC === fc);
          return onTile ? 1 : rangedScale;
        },
      },

      skills: (() => {
        const s1Spec = {
          kind: 'instant',
          onStart({ battle, unit }) {
            const list = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
            sortEnemyTargets(battle, unit, list, null);
            battle.fx('sonicStream', { x: unit.x, y: unit.y, id: unit.id });
            unit.mem.oblvnsS1At = battle.time;

            for (let i = 0; i < s1Scales.length; i++) {
              battle.after(i * 0.2, () => {
                if (!up(unit) || !unit.alive) return;
                let t = list.find((e) => e && e.alive && hasHp(e));
                if (!t) {
                  const refreshed = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
                  sortEnemyTargets(battle, unit, refreshed, null);
                  t = refreshed.find((e) => e && e.alive && hasHp(e));
                }
                emitNote(battle, unit, {
                  target: t, visual: 'sonicNote', type: 'arts', scale: s1Scales[i], isSkill: true,
                  tag: 'oblvns:s1', motion: 's1', angle: (i - 3.5) * 3.75, rangedScale, announce: true,
                });
              }, { owner: unit });
            }
          }
        };
        const s2Spec = {
          kind: 'toggle',
          onStart({ battle, unit }) {
            const curMode = unit.mem.oblvnsMode === 'organ' ? 'piano' : 'organ';
            unit.mem.oblvnsMode = curMode;
            unit.form = curMode === 'organ' ? 'oblvnsS2Organ' : 'oblvnsS2Piano';
            battle.fx('swap', { x: unit.x, y: unit.y, id: unit.id, form: unit.form });

            battle.removeBuff(unit, S2_BUFF);
            if (curMode === 'piano') {
              battle.addBuff(unit, {
                key: S2_BUFF,
                mods: { atkPct: s2AtkPct },
                tags: ['skill']
              });
              unit.profile.dmgType = 'phys';
            } else {
              battle.addBuff(unit, {
                key: S2_BUFF,
                mods: { aspd: s2Aspd },
                tags: ['skill']
              });
              unit.profile.dmgType = 'arts';
            }
            battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id });
          },
          onEnd({ battle, unit }) {
            unit.form = null;
            battle.fx('swap', { x: unit.x, y: unit.y, id: unit.id, form: null });
            battle.removeBuff(unit, S2_BUFF);
            unit.profile.projectile = 'oblvnsSilent';
            unit.profile.dmgType = 'phys';
          }
        };
        const s3Spec = {
          kind: 'duration',
          targeting: { rangeGrid: grid3 },
          onStart({ battle, unit, skill }) {
            battle.fx('stageLight', { x: unit.x, y: unit.y, id: unit.id, dur: skill.duration, r: 2.5 });
            battle.addBuff(unit, {
              key: S3_STAGE_BUFF,
              duration: skill.duration,
              tags: ['skill']
            });
          },
          onEnd({ battle, unit }) {
            battle.removeBuff(unit, S3_STAGE_BUFF);
          }
        };
        return {
          [S1]: s1Spec,
          [S1_X]: s1Spec,
          [S2]: s2Spec,
          [S2_X]: s2Spec,
          [S3]: s3Spec,
          [S3_X]: s3Spec,
        };
      })(),

      talents: [
        // T1: 颂乐音符 — continuous attack / floating notes & DEF/RES penetration
        {
          install(battle, unit) {
            unit.mem.oblvnsNotes = [];

            battle.on('tick', ({ dt }) => {
              tickNotes(battle, unit, dt);
              if (!up(unit)) {
                for (const a of battle.allyUnits) if (a.ownerId === unit.ownerId && isMujica(a)) battle.removeBuff(a, T1_PEN_KEY);
                battle.removeBuff(unit, MODULE_ASPD_KEY);
                return;
              }
              const moduleAspdBuff = unit.findBuff(MODULE_ASPD_KEY);
              const hasModuleCrowd = hasModuleY && moduleAspd > 0
                && battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile).length >= 2;
              if (hasModuleCrowd && !moduleAspdBuff) {
                battle.addBuff(unit, { key: MODULE_ASPD_KEY, mods: { aspd: moduleAspd }, tags: ['module'] });
              } else if (!hasModuleCrowd && moduleAspdBuff) {
                battle.removeBuff(unit, MODULE_ASPD_KEY);
              }
              const notes = unit.mem.oblvnsNotes || [];

              const count = Math.min(maxNoteStacks, notes.length);
              const allies = battle.allyUnits.filter((a) => a.ownerId === unit.ownerId && isMujica(a));

              for (const a of allies) {
                if (count > 0) {
                  battle.addBuff(a, {
                    key: T1_PEN_KEY,
                    mods: {
                      defIgnorePct: count * defPenPerNote,
                      resIgnorePct: count * resPenPerNote
                    },
                    tags: ['talent']
                  });
                } else {
                  battle.removeBuff(a, T1_PEN_KEY);
                }
              }

              // Free notes drift without an attack animation; S3 stays in its skill-idle pose until it has a target.
              if (unit.atkCd <= 0 && unit.canAct && !unit.s.flags.disarm && !unit.s.flags.stun && !unit.s.flags.sleep) {
                const enemies = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
                const s3 = unit.skill?.active && isS3(unit.skill.id);
                if (!enemies.length) {
                  unit.atkCd = unit.s.interval;
                  if (s3) {
                    for (let i = 0; i < 2; i++) emitNote(battle, unit, {
                      visual: 'pianoBeam', type: 'phys', scale: s3AtkScale, isSkill: true,
                      tag: 'oblvns:s3:piano', motion: 's3', rangedScale, impactFx: i === 0,
                    });
                    for (let i = 0; i < 2; i++) emitNote(battle, unit, {
                      visual: 'organNote', type: 'arts', scale: s3AtkScale, isSkill: true,
                      tag: 'oblvns:s3:organ', motion: 's3', rangedScale, impactFx: i === 0,
                    });
                  } else {
                    const s2 = unit.skill?.active && isS2(unit.skill.id);
                    const mode = s2 ? unit.mem.oblvnsMode : null;
                    emitNote(battle, unit, {
                      target: null,
                      visual: mode === 'organ' ? 'organNote' : mode === 'piano' ? 'pianoBeam' : 'sonicNote',
                      type: mode === 'organ' ? 'arts' : 'phys',
                      isSkill: !!s2,
                      tag: s2 ? 'oblvns:s2' : 'oblvns:normal',
                      motion: mode || 'normal', rangedScale, recoverSpOnLaunch: true,
                    });
                  }
                }
              }
            });
          }
        },

        // T2: 毋畏遗忘 — Fever +3 on damage dealt & ASPD aura in range
        {
          install(battle, unit) {
            installAura(battle, unit, {
              key: ASPD_AURA_KEY,
              value: aspdAura,
              select: (a) => a.kind === 'op' && a.ownerId === unit.ownerId && unit.rangeKeySet && unit.rangeKeySet.has(a.tileR * COLS + a.tileC),
              mods: { aspd: aspdAura },
              interval: 0.5
            });

            battle.on('hit', (c) => {
              if (c.source === unit && c.target?.side === 'enemy') {
                addFever(battle, unit, feverPerHit);
              }
            }, { owner: unit });
          }
        }
      ],

      install(battle, unit) {
        // Module LOR-Y Trait: when >= 2 enemies in range, aspd +12
        unit.mem.oblvnsMode = 'piano'; // default piano
        unit.profile.projectile = 'oblvnsSilent';
        unit.profile.hitsFn = () => 0;

        // The engine attack cadence / target selection triggers these cached homing notes.
        battle.on('attack', ({ attacker, targets }) => {
          if (attacker !== unit) return;
          const s = getFeverState(battle, unit.ownerId);

          if (isS1(unit.skill?.id) && unit.mem.oblvnsS1At === battle.time) return;

          if (unit.skill?.active && isS3(unit.skill.id)) {
            const list = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
            if (!list.length) return;
            const byStat = (key) => list.slice().sort((a, b) => b.s[key] - a.s[key] || a.spawnSeq - b.spawnSeq)[0];
            const resTarget = byStat('res');
            const defTarget = byStat('def');
            for (let i = 0; i < 2; i++) emitNote(battle, unit, {
              target: resTarget, visual: 'pianoBeam', type: 'phys', scale: s3AtkScale, isSkill: true,
              tag: 'oblvns:s3:piano', motion: 's3', rangedScale, impactFx: i === 0, announce: true,
            });
            for (let i = 0; i < 2; i++) emitNote(battle, unit, {
              target: defTarget, visual: 'organNote', type: 'arts', scale: s3AtkScale, isSkill: true,
              tag: 'oblvns:s3:organ', motion: 's3', rangedScale, impactFx: i === 0, announce: true,
            });
            return;
          }

          const s2 = unit.skill?.active && isS2(unit.skill.id);
          const mode = s2 ? unit.mem.oblvnsMode : 'normal';
          const target = targets.find((e) => e && e.alive && hasHp(e)) || null;
          const visual = mode === 'organ' ? 'organNote' : mode === 'piano' ? 'pianoBeam' : 'sonicNote';
          const type = mode === 'organ' ? 'arts' : 'phys';
          const scale = 1;
          emitNote(battle, unit, {
            target, visual, type, scale, isSkill: !!s2,
            tag: s2 ? 'oblvns:s2' : 'oblvns:normal', motion: mode, rangedScale,
          });

          // S2 Double strike in Fever
          if (s2 && s.active) {
            battle.after(0.12, () => {
              if (!up(unit) || !unit.alive) return;
              const t = targets[0];
              emitNote(battle, unit, {
                target: t && t.alive && hasHp(t) ? t : null, visual, type, scale,
                isSkill: true, tag: 'oblvns:s2', motion: mode, rangedScale, announce: true,
              });
            }, { owner: unit });
          }
        }, { owner: unit });

        // Fever Management Tick: hold SP full, handle S3 lethal protection
        battle.on('tick', ({ dt }) => {
          const s = getFeverState(battle, unit.ownerId);
          if (s.active) {
            s.timer -= dt;
            const allies = battle.allyUnits.filter((a) => a.ownerId === unit.ownerId && isMujica(a));

            for (const a of allies) {
              if (a.skill && a.skill.active) {
                // Keep timed skills active throughout Fever
                if (Number.isFinite(a.skill.timeLeft)) {
                  a.skill.timeLeft = Math.max(a.skill.timeLeft, 5);
                }
                a.skill.sp = a.skill.spCost;
              }
            }

            if (s.timer <= 0) {
              // Fever ends!
              s.active = false;
              s.points = 0;
              for (const a of allies) {
                battle.removeStatus(a, 'fever');
              }
              // S3: protected Ave Mujica units retreat upon Fever end
              for (const pid of s.protectedUnits) {
                const victim = battle.allyUnits.find((a) => a.id === pid);
                if (victim && victim.alive) {
                  battle.kill(victim);
                }
              }
              s.protectedUnits.clear();
            }
          }
        }, { owner: unit });

        // S3 during Fever: Ave Mujica lethal damage protection (免死锁血，结束后退场)
        battle.on('fatal', (c) => {
          const s = getFeverState(battle, unit.ownerId);
          if (s.active && unit.skill?.active && isS3(unit.skill.id)) {
            if (c.unit && isMujica(c.unit) && c.unit.ownerId === unit.ownerId) {
              c.prevented = true;
              s.protectedUnits.add(c.unit.id);
            }
          }
        }, { owner: unit, priority: -50 });
      }
    };
  }
};
