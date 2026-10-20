# 历史自定义干员备份（丰川祥子 & 结城理）

> **归档与演化说明**：
> 1. 在 Stronghold-Protocol 升级至官方 v0.3.1 后，我们此前自主复刻的丰川祥子（`char_4182_oblvns`）与结城理（`char_4217_makoto`）全部底层机制代码在此永久归档备份；
> 2. **最新状态（方案 A）**：上述两名干员的全部战斗机制、音符弹道、Fever 能量条、Persona 召唤与总攻击特效，已正式升级并重构为**官方 Manifest 2 标准扩展包**，位于：
>    - [`plugins/op-oblvns/`](../../plugins/op-oblvns/)（干员拓展：丰川祥子）
>    - [`plugins/op-makoto/`](../../plugins/op-makoto/)（干员拓展：结城理）
> 3. 房主只需在房间设置中勾选启用对应插件，即可在自选编队（DIY）中自由选用，且不污染官方原版卡池；本目录代码继续保留作为底层核心机制的历史基准与回溯参考。

## 目录结构

- `server/op-oblvns.js`：丰川祥子【旋律的主人】联动全套机制原始实现（常态正弦音符、S1 八音符齐奏、S2 钢琴/风琴双音色切换、S3 四音符齐奏与锁血守护、Ave Mujica 450 点全队 Fever 机制与 `0xff4bb8` 玫粉色 SP 条）；
- `server/op-makoto.js`：结城理 P3R Persona DIY、S1 俄耳甫斯、S2 塔纳托斯恐惧处决、S3 弱点伤害与双人格转换、PUM-Y 模组与 S.E.E.S. 盟约总攻击机制；
- `test/op_oblvns.test.js`：丰川祥子全套机制单元测试；
- `test/op_makoto.test.js`：结城理机制单元测试；
- `test/fxoblvns.test.js`：祥子音符弹道与粒子渲染测试；
- `test/makoto-forms.test.js`：结城理 Persona 与 Front Spine 动作形态测试。
