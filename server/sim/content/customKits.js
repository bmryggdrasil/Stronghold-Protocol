// Only the two opt-in plugin identities use these kits. Official IDs and Forge-derived
// operators retain the upstream kit / DSL lookup order.
import oblvns from './custom/op-oblvns.js';
import makoto from './custom/op-makoto.js';

export const CUSTOM_KITS = Object.freeze({
  char_x_op_oblvns_oblvns: oblvns['char_4182_oblvns'],
  char_x_op_makoto_makoto: makoto['char_4217_makoto'],
});
