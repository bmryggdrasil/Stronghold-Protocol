# 历史自定义干员备份（丰川祥子 & 结城理）

> **归档说明**：在 Stronghold-Protocol 官方升级至 v0.3.1（支持官方扩展包与 Forge pack 派生机制）后，根据维护决议，游戏主体全面转向官方干员体系。此处归档保存了我们此前自主复刻制作的丰川祥子（Oblivionis，`char_4182_oblvns`）与结城理（Makoto Yuki，`char_4217_makoto`）全部机制与回归测试代码。

## 目录结构

- `server/op-oblvns.js`：丰川祥子【旋律的主人】联动皮肤全套机制实现（常态正弦音符、S1八音符齐奏、S2钢琴/风琴双音色切换、S3四音符齐奏与锁血守护、Ave Mujica 450点全队 Fever 机制与 0xff4bb8 玫粉色 SP 条）；
- `server/op-makoto.js`：结城理 P3R Persona DIY、S1 俄耳甫斯、S2 塔纳托斯恐惧处决、S3 弱点伤害与双人格转换、PUM-Y 模组与 S.E.E.S. 盟约总攻击机制；
- `test/op_oblvns.test.js`：丰川祥子全套机制单元测试；
- `test/op_makoto.test.js`：结城理机制单元测试；
- `test/fxoblvns.test.js`：祥子音符弹道与粒子渲染测试；
- `test/makoto-forms.test.js`：结城理 Persona 与 Front Spine 动作形态测试。
