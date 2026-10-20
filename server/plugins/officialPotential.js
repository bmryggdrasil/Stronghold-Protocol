// Pure potential annotations shared by the generated-data and import-only official builders.
import { isDeepStrictEqual } from 'node:util';
import { FULL_RANK, atRank, stripPotential } from '../../shared/potential.js';

export function createPotentialAnnotator(warn = () => {}) {
/** Keys of the talent lists whose entries chain their lower-rank values (shared/potential.js talentAtRank). */
const POTENTIAL_TALENT_LISTS = new Set(['talents', 'talentsBase', 'talentChanges']);
const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A talent entry built at ranks 0 … `hi` (`vals[r]`) as one chained entry: the rank-`hi` entry, with `potMin` (the
 * lowest rank that builds the same entry) and `potBelow` (the entry below it — only the fields it changes, `desc` /
 * `descRaw` / `bb` …, chained the same way) when a lower rank builds another one: the candidates by
 * `requiredPotentialRank`.
 */
function chainTalent(vals, hi) {
  const node = vals[hi];
  let m = hi;
  while (m > 0 && isDeepStrictEqual(vals[m - 1], node)) m--;
  if (m === 0) return node;
  const below = chainTalent(vals, m - 1);
  const part = {};
  for (const [k, v] of Object.entries(below)) if (k === 'potMin' || k === 'potBelow' || !isDeepStrictEqual(v, node[k])) part[k] = v;
  return { ...node, potMin: m, potBelow: part };
}

/**
 * The full-rank value `vals[FULL_RANK]` annotated with what the lower ranks change: talent lists chain their entries
 * (chainTalent), every other differing leaf — or a value whose shape changes — records its exact value at each rank where
 * it differs from the rank above in `potDown[rank][dotted.path]`.
 */
function annotatePotential(vals, path, potDown, label) {
  const full = vals[FULL_RANK];
  if (vals.every((v) => isDeepStrictEqual(v, full))) return full;
  const key = path[path.length - 1];
  if (POTENTIAL_TALENT_LISTS.has(key) && vals.every((v) => Array.isArray(v) && v.length === full.length)) {
    return full.map((_, i) => chainTalent(vals.map((v) => v[i]), FULL_RANK));
  }
  if (isPlainObj(full) && vals.every((v) => isPlainObj(v) && isDeepStrictEqual(Object.keys(v), Object.keys(full)))) {
    const o = {};
    for (const k of Object.keys(full)) o[k] = annotatePotential(vals.map((v) => v[k]), [...path, k], potDown, label);
    return o;
  }
  if (Array.isArray(full) && vals.every((v) => Array.isArray(v) && v.length === full.length)) {
    return full.map((_, i) => annotatePotential(vals.map((v) => v[i]), [...path, i], potDown, label));
  }
  if (!path.length || path.some((k) => String(k).includes('.'))) {
    warn(`${label}: a potential-dependent value at "${path.join('/')}" cannot be written as a potDown path`);
    return full;
  }
  for (let r = FULL_RANK - 1; r >= 0; r--) {
    if (!isDeepStrictEqual(vals[r], vals[r + 1])) (potDown[r] ||= {})[path.join('.')] = vals[r];
  }
  return full;
}

/**
 * One record / form / variant built at every rank (`vals[r]`, r = 0 … FULL_RANK) as its full-rank build annotated for
 * the lower ranks (annotatePotential; `potDown` last, only when something differs), checked: shared/potential.js
 * atRank must rebuild every rank exactly (an error otherwise).
 * @returns {object} the annotated full-rank value
 */
function withPotentialData(vals, label, errors) {
  const potDown = {};
  const out = annotatePotential(vals, [], potDown, label);
  const res = Object.keys(potDown).length && isPlainObj(out) ? { ...out, potDown } : out;
  for (let r = 0; r <= FULL_RANK; r++) {
    if (!isDeepStrictEqual(stripPotential(atRank(res, r)), stripPotential(vals[r]))) errors.push(`potential ${label}: shared/potential.js atRank does not rebuild rank ${r}`);
  }
  return res;
}

return { withPotentialData };
}
