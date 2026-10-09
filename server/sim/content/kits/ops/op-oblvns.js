// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit:
// 6★ 领主 (近卫), 联动干员 (Ave Mujica AM01), 联动皮肤【旋律的主人】.
// 全技能、双天赋、特性与模组 (LOR-Y) 完整实现及 Fever 狂热机制复刻.

import { num, talentBb, traitBb, skillRec, up, installAura } from '../shared/tier1.js';
import { absoluteRangeKeys, sortEnemyTargets, canTargetEnemy } from '../../../targeting.js';
import { hasHp } from '../../../damage.js';
import { dirVec } from '../../../dir.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';

const FEVER_CAP = 450;
const FEVER_DURATION = 20;
const S2_BUFF = 'skill:oblvns:dance';
const S3_STAGE_BUFF = 'skill:oblvns:echo';
const ASPD_AURA_KEY = 'talent:oblvns:courage';
const T1_PEN_KEY = 'talent:oblvns:notes:pen';

const AIR = Object.freeze({ canHitFly: true });

const R3_21 = Object.freeze([
  [2, 0], [2, 1],
  [1, 0], [1, 1], [1, 2], [1, 3],
  [0, 0], [0, 1], [0, 2], [0, 3],
  [-1, 0], [-1, 1], [-1, 2], [-1, 3],
  [-2, 0], [-2, 1]
]);

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

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
    const b1 = bbOf(chess, S1);
    const b2 = bbOf(chess, S2);
    const b3 = bbOf(chess, S3);

    const grid3 = skillRec(chess, S3)?.rangeGrid ?? R3_21;
    const rangedScale = num(tb.atk_scale, 0.8);

    // T1 values (base: def 3%, res 2%, max 10; module: def 5%, res 2.5%, max 12)
    const defPenPerNote = num(t0.def_penetrate_ratio, 0.03);
    const resPenPerNote = num(t0.magic_resist_penetrate_ratio, 0.02);
    const maxNoteStacks = Math.max(1, Math.floor(num(t0.max_cnt, 10)));

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
    const s2Aspd = num(b2['attack@attack_speed'], 110);

    // S3 parameters
    const s3AtkScale = num(b3['attack@atk_scale'], 1.8);

    return {
      trait: {
        profile: {
          projectile: 'sonicNote',
          canHitFly: true,
          attack: 'ranged',
        },
        dmgMul: (battle, unit, target) => {
          // If in skill and carrying LOR-Y module: "技能期间远程攻击不再降低攻击力"
          if (unit.skill?.active && unit.def?.hasModuleY) return 1;
          if (target.blockedBy === unit) return 1;
          const [dr, dc] = dirVec(unit.dir);
          const fr = unit.tileR + dr, fc = unit.tileC + dc;
          const onTile = (target.tileR === unit.tileR && target.tileC === unit.tileC) || (target.tileR === fr && target.tileC === fc);
          return onTile ? 1 : rangedScale;
        },
      },

      skills: {
        // S1: 新月的苏醒 (Auto/Manual, 2 charges, 8 falling musical notes)
        [S1]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const list = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
            sortEnemyTargets(battle, unit, list, null);
            battle.fx('sonicStream', { x: unit.x, y: unit.y, id: unit.id });

            for (let i = 0; i < s1Scales.length; i++) {
              battle.after(i * 0.06, () => {
                if (!up(unit) || !unit.alive) return;
                let t = list.find((e) => e && e.alive && hasHp(e));
                if (!t) {
                  const refreshed = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
                  sortEnemyTargets(battle, unit, refreshed, null);
                  t = refreshed.find((e) => e && e.alive && hasHp(e));
                }

                if (t) {
                  battle._ev(['atk', unit.id, t.id, 'sonicNote']);
                  battle.addProjectile({
                    from: unit,
                    target: t,
                    speed: 10,
                    visual: 'sonicNote',
                    source: unit,
                    onHit: () => {
                      if (!up(unit) || !t.alive || !hasHp(t)) return;
                      const dmg = unit.s.atk * s1Scales[i] * unit.s.atkScaleMul;
                      battle.dealDamage(unit, t, {
                        amount: dmg,
                        type: 'arts',
                        isSkill: true,
                        tags: ['skill', 'oblvns:s1']
                      });
                      addFever(battle, unit, feverPerHit);
                    }
                  });
                } else {
                  battle._ev(['atk', unit.id, null, 'sonicNote']);
                }
              }, { owner: unit });
            }
          }
        },

        // S2: 满月的舞会 (Toggle: 钢琴 / 风琴)
        [S2]: {
          kind: 'toggle',
          onStart({ battle, unit }) {
            // Toggle timbre
            const curMode = unit.mem.oblvnsMode === 'organ' ? 'piano' : 'organ';
            unit.mem.oblvnsMode = curMode;

            battle.removeBuff(unit, S2_BUFF);
            if (curMode === 'piano') {
              battle.addBuff(unit, {
                key: S2_BUFF,
                mods: { atkPct: s2AtkPct },
                tags: ['skill']
              });
              unit.profile.projectile = 'pianoBeam';
              unit.profile.dmgType = 'phys';
            } else {
              battle.addBuff(unit, {
                key: S2_BUFF,
                mods: { aspd: s2Aspd },
                tags: ['skill']
              });
              unit.profile.projectile = 'organNote';
              unit.profile.dmgType = 'arts';
            }
            battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id });
          },
          onEnd({ battle, unit }) {
            battle.removeBuff(unit, S2_BUFF);
            unit.profile.projectile = 'sonicNote';
            unit.profile.dmgType = 'phys';
          }
        },

        // S3: 残月的余响 (Range 3-21, 2 Piano physical + 2 Organ arts)
        [S3]: {
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
        }
      },

      talents: [
        // T1: 颂乐音符 — continuous attack / floating notes & DEF/RES penetration
        {
          install(battle, unit) {
            unit.mem.oblvnsNotes = [];

            // Periodic tick to clean expired notes & update Ave Mujica buffs
            battle.on('tick', () => {
              if (!up(unit)) return;
              const now = battle.time;
              let notes = unit.mem.oblvnsNotes || [];
              notes = notes.filter((n) => n.exp > now);
              unit.mem.oblvnsNotes = notes;

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

              // Continuous performance: if no enemies in range and atkCd <= 0, play notes forward!
              if (unit.atkCd <= 0 && unit.canAct && !unit.s.flags.disarm && !unit.s.flags.stun && !unit.s.flags.sleep) {
                const enemies = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
                if (!enemies.length) {
                  unit.atkCd = unit.s.interval;
                  const [dr, dc] = dirVec(unit.dir);
                  const proj = unit.skill?.active && unit.skill.id === S2 && unit.mem.oblvnsMode === 'organ'
                    ? 'organNote'
                    : unit.skill?.active && unit.skill.id === S2 && unit.mem.oblvnsMode === 'piano'
                      ? 'pianoBeam'
                      : 'sonicNote';

                  battle._ev(['atk', unit.id, null, proj]);
                  (unit.mem.oblvnsNotes ??= []).push({ exp: now + 3.0 });
                }
              }
            }, { owner: unit });

            // Record note on each normal/skill attack
            battle.on('attack', ({ attacker }) => {
              if (attacker === unit) {
                (unit.mem.oblvnsNotes ??= []).push({ exp: battle.time + 3.0 });
              }
            }, { owner: unit });
          }
        },

        // T2: 毋畏遗忘 — Fever +3 on damage dealt & ASPD aura in range
        {
          install(battle, unit) {
            installAura(battle, unit, {
              key: ASPD_AURA_KEY,
              value: aspdAura,
              select: (a) => a.kind === 'op' && a.ownerId === unit.ownerId && unit.rangeKeySet && unit.rangeKeySet.has(a.tileR * 16 + a.tileC),
              mods: { aspd: aspdAura },
              interval: 0.5
            });

            battle.on('damaged', (c) => {
              if (c.source === unit && c.target && c.target.side === 'enemy' && (c.amount > 0)) {
                addFever(battle, unit, feverPerHit);
              }
            }, { owner: unit });
          }
        }
      ],

      install(battle, unit) {
        // Module LOR-Y Trait: when >= 2 enemies in range, aspd +12
        unit.mem.oblvnsMode = 'piano'; // default piano
        unit.profile.projectile = 'sonicNote';

        // Custom S2 & S3 attack logic
        battle.on('attack', ({ attacker, targets }) => {
          if (attacker !== unit) return;
          const s = getFeverState(battle, unit.ownerId);

          // S2 Double strike in Fever
          if (unit.skill?.active && unit.skill.id === S2 && s.active) {
            battle.after(0.12, () => {
              if (!up(unit) || !unit.alive) return;
              const mode = unit.mem.oblvnsMode;
              const proj = mode === 'organ' ? 'organNote' : 'pianoBeam';
              const t = targets[0];
              if (t && t.alive && hasHp(t)) {
                battle._ev(['atk', unit.id, t.id, proj]);
                const dmg = unit.s.atk * (mode === 'piano' ? 1 + s2AtkPct : 1) * unit.s.atkScaleMul;
                battle.dealDamage(unit, t, {
                  amount: dmg,
                  type: mode === 'organ' ? 'arts' : 'phys',
                  isSkill: true,
                  tags: ['skill', 'oblvns:s2']
                });
                addFever(battle, unit, feverPerHit);
              }
            }, { owner: unit });
          }

          // S3: 2 Piano (Physical) to highest RES + 2 Organ (Arts) to highest DEF
          if (unit.skill?.active && unit.skill.id === S3) {
            const list = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
            if (list.length > 0) {
              const resTarget = list.slice().sort((a, b) => b.s.res - a.s.res)[0];
              const defTarget = list.slice().sort((a, b) => b.s.def - a.s.def)[0];

              // 2 Piano physical shots to highest RES target
              for (let i = 0; i < 2; i++) {
                battle.after(i * 0.08, () => {
                  if (!up(unit) || !resTarget || !resTarget.alive || !hasHp(resTarget)) return;
                  battle._ev(['atk', unit.id, resTarget.id, 'pianoBeam']);
                  battle.dealDamage(unit, resTarget, {
                    amount: unit.s.atk * s3AtkScale * unit.s.atkScaleMul,
                    type: 'phys',
                    isSkill: true,
                    tags: ['skill', 'oblvns:s3:piano']
                  });
                  battle.fx('musicBurst', { x: resTarget.x, y: resTarget.y, id: resTarget.id });
                  addFever(battle, unit, feverPerHit);
                }, { owner: unit });
              }

              // 2 Organ arts shots to highest DEF target
              for (let i = 0; i < 2; i++) {
                battle.after(i * 0.08 + 0.04, () => {
                  if (!up(unit) || !defTarget || !defTarget.alive || !hasHp(defTarget)) return;
                  battle._ev(['atk', unit.id, defTarget.id, 'organNote']);
                  battle.dealDamage(unit, defTarget, {
                    amount: unit.s.atk * s3AtkScale * unit.s.atkScaleMul,
                    type: 'arts',
                    isSkill: true,
                    tags: ['skill', 'oblvns:s3:organ']
                  });
                  battle.fx('musicBurst', { x: defTarget.x, y: defTarget.y, id: defTarget.id });
                  addFever(battle, unit, feverPerHit);
                }, { owner: unit });
              }
            }
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
          if (s.active && unit.skill?.active && unit.skill.id === S3) {
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
