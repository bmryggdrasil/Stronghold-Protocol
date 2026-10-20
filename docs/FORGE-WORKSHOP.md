# 本服 Forge 工坊包安装记录

2026-10-20 根据 [官方 v0.3.1 发布说明](https://github.com/sganggs/Stronghold-Protocol/releases/tag/v0.3.1)，
使用本项目的 `import-forge` 导入器检查了
[Forge 作者模组仓库](https://github.com/XiaMo233M/Stronghold-Protocol-Forge-Mods)
的现行已发布包。来源固定为 commit `93ae0ffc60b428516f8491b525f1128de7c85d23`，
逐个验证 `mods/index.json` 中的 ZIP 大小和 SHA256。

官方发布说明中的「34 个包、24 个可导出」是发布前的旧审计结果；上述来源现有 58 个已发布包。
本次 58 个全部完成 dry-run，56 个没有硬错误，2 个严格校验失败。
通过检查并不表示原包全部功能已实现，因此逐项检查了丢弃字段、脚本、面板与通用 kit 降级，
只安装其中可完整提供目标功能且适合当前服务器的 10 个来源，生成 11 个插件。
其余包的来源、版本、SHA256、生成产品、跳过内容和不安装原因保存在
[forge-workshop-lock.json](forge-workshop-lock.json)。来源中的 `demo/`、`incoming/` 和旧版本均没有安装。

## 已安装的可选功能

| 插件目录 | 类型 | 功能 | 使用位置 |
|---|---|---|---|
| `plugins/morph-plus/` | content | 变形同构体加强规则 | 房间 → 插件，房主选择 |
| `plugins/prep-loadout/` | content | 休整期调整技能与模组 | 房间 → 插件，房主选择 |
| `plugins/shop-bond-bias/` | content | 商店装备偏向已激活盟约 | 房间 → 插件，房主选择 |
| `plugins/unequip/` | content | 休整期卸下装备 | 房间 → 插件，房主选择 |
| `plugins/boss-fixed-pool/` | content | 原工坊包的领袖固定生命配置 | 房间 → 插件，房主选择；改变官方对局规则 |
| `plugins/fanpack-skillful-items/` | content | 两件工坊装备 | 房间 → 插件，房主选择 |
| `plugins/fanpack-skillful-items-look/` | cosmetic | 上述装备的配套图标 | 房间插件或设置 → 外观插件 |
| `plugins/theme-night/` | cosmetic | 夜间文字和边框颜色 | 设置 → 外观插件，个人选择 |
| `plugins/dmg-board/` | ui | 结算统计只读面板 | 设置 → 界面插件，个人选择 |
| `plugins/net-panel/` | ui | 连接状态只读面板 | 设置 → 界面插件，个人选择 |
| `plugins/voice-lang/` | ui | 房间内的语音提示面板 | 设置 → 界面插件，个人选择；沿用官方语音设置 |

工坊安装器不修改 `plugins/config.json` 或环境变量。官方默认策略是 `rooms: host`、`default: []`。
本服另外将 `official-skins-01`、`official-skins-02` 设为新房间的默认外观包，开放时装入口；
新房间从官方玩法规则开始，外观与 UI 也可使用浏览器已有的个人插件开关。房主选择内容插件之后，
该房间按官方插件系统标记为非官方玩法。这里没有新增 script/trusted 插件，不需要开启代码插件执行。
自制丰川祥子和结城理仍来自 `op-oblvns` 与 `op-makoto`，没有再安装重复的 `makoto-yuki`。

## 未安装内容与功能边界

- Forge 的 `s7-zj-chess`、`s8-chess-extras` 生成的干员素材引用不合法，被严格检查拒绝。
- `fanpack-kazdel`、`fanpack-kazdel-rhodes`、`fanpack-rhodes` 等存在机制、驻守、召唤物或技能损失。
  部分其它干员扩充包虽未标记 `partial`，仍在报告中丢弃模组、驻守或改用通用 kit，也没有安装。
- `skin-picker` 使用 Forge 专有的 appearance/send 接口及调配界面挂载点，无法完整导入；
  `skin-catalogue` 没有可导入的模型素材；`sp-skins-index` 仅有部分产品，均没有安装。
  本服时装由官方 v0.3.1 的时装机制与本服时装外观插件提供。
- 聊天气泡、CDN 切换、服务端经济/对赌、名字过滤、扩容、资源容器与宿主界面替换需要额外接口，
  没有把仅剩公告或空面板的产物作为完整功能安装。
- 单独的公告包、特定模式面板、会直接覆盖官方词条的旧语言补丁及已有结城理语音没有重复安装。

原包内 `PROVENANCE.md`、README、测试脚本等未被 `pack.json` 引用的附属文件不会被官方导入器复制。
它们的原件仍能通过锁定的 commit/path 追溯。导入器保留来源作者、许可及其支持的公告字段，
原始脚本没有在导入过程中执行。完整逐项原因见锁清单的 `skipped` 和 `manualReasons`。

## 重放安装与部署

在项目根目录运行以下命令，仅下载锁定清单中决定安装的来源。下载文件逐个校验 SHA256，
先 dry-run，再按 `--install` 决定是否写入；不覆盖已有来源不匹配的插件。

```sh
node tools/forge-workshop.mjs --download --dry-run
node tools/forge-workshop.mjs --download --install
node tools/plugin.mjs check morph-plus prep-loadout shop-bond-bias unequip boss-fixed-pool fanpack-skillful-items fanpack-skillful-items-look theme-night dmg-board net-panel voice-lang --strict
```

已有 Forge 仓库下载副本时，可改用本地来源（副本必须含上述锁定版本的原始 ZIP）：

```sh
node tools/forge-workshop.mjs --source /path/to/Stronghold-Protocol-Forge-Mods --install
```

重复运行会核对本次安装回执、`plugin.lock.json` 和锁内文件的哈希后复用插件。来源或本地文件改变时会停止，
不会自动更新或覆盖手工修改。安装回执为 `plugins/_forge-installation.json`；原始下载缓存为
`.cache/forge/<commit>/mods/.../mod.zip`。这些文件与上述 11 个插件目录均不进入 Git。
各来源正式导入后的完整 `IMPORT-REPORT.md` 保存在其主要插件目录。

生产部署可以在服务器运行同一安装命令，或者同步上述 11 个插件目录及安装回执。
不要用空的 `plugins/` 覆盖整个生产插件目录。代码部署需要包含导入器的 Windows 目录链接修复、
安装工具与两份本记录文件；游戏图片、原始工坊 ZIP 和插件本体按服务器资源单独同步。

安装后的服务器应在 `/plugins/index.json` 列出以上 11 个产品；房间默认仍为官方规则，
内容插件选中后才生效。UI 面板只在该玩家启用对应插件时展示。卸载时先从房间/个人选择中取消，
再将对应目录移入 `plugins/_removed/`；保留来源锁与回执便于恢复。

## 本次环境修复

Windows 普通权限下，导入器验证阶段用未指定类型的 `fs.symlinkSync` 建立目录链接会返回 `EPERM`，
导致原本可导入的包也全部失败。`server/plugins/forgeImport.js` 现在在 Windows 使用 directory junction，
其它平台显式使用目录符号链接。导入目录边界、校验流程、来源文件和玩法没有因此改变。
