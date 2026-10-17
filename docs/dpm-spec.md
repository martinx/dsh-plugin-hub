# dpm 规范（Draft）

> 状态：设计稿，未开发  
> 目标读者：插件作者、后续实现者  
> 关联仓库：`dsh-plugin-hub`（市场索引）、`dsh-usage-analytics` / `dsh-workspace-status` / `dsh-chat-clock`（插件包）

---

## 1. 背景

当前 DSH 插件安装有三条路径，但都不完整：

1. **官方插件页/发现页**：只接受声明了 `dsh.bundle` 的包（`installBundle()` 会检查），普通插件包会报 `not-bundle`。
2. **`dsh plugin --profile <name> add <spec>`**：只是把参数转发给 profile 目录里的 pnpm，**不会**维护 `cordis.patch.yml`，装完插件不会自动挂载。
3. **各仓库的 `install.sh`**：手动 symlink + 追加 patch + 提示重启，能跑，但每个仓库重复一份脚本，没有版本管理、更新、诊断、回滚。

结果：用户要么用官方市场（但我们的包还不是 bundle、市场索引也刚成型），要么手动 clone + `bash install.sh`。插件一多就无法管理版本、更新和卸载。

`dpm` 的目标是补上"插件生命周期管理"这一层。

## 2. 目标与非目标

### 目标

- `dpm install <spec>` 支持 **npm 包**与 **GitHub 仓库**两种来源，版本/commit 可固定
- 维护 `$DSH_HOME/profiles/<profile>` 下的依赖与 `cordis.patch.yml`，做到幂等、可回滚
- `list / update / uninstall / doctor / link / market` 覆盖完整生命周期
- 从市场索引读取版本与来源，支持 npm source 与 git source
- 一条命令完成安装，输出明确的重启提示

### 非目标

- 不重写插件加载器、不接管 DSH profile 的 compose 逻辑
- 不替代 pnpm；npm 安装仍调用 profile 内 pnpm
- 不做通用包管理器（不管理非 DSH 插件）
- 不做插件沙箱/权限模型（DSH 现有机制不变）

## 3. 关键约束（已确认）

| 事实 | 来源 |
|---|---|
| 插件页/市场安装调用 `installBundle()`，要求包声明 `dsh.bundle`，否则 `not-bundle` | `packages/boot/plugin-manager/src/index.ts` |
| `dsh plugin` 只是 `pnpm` 的转发器，不写 patch | `dsh plugin --help` |
| 市场索引 format 1，每个版本只有一个 `source`，允许 `npm` 或 `git`（git 需 40 位 commit） | `packages/util/plugin-market-index/src/types.ts` |
| 市场 UI 由实验性 bundle 提供，默认不启用；本机已启用 | `@deepseek-ai/dsh-experimental-plugin-market-bundle` |
| 市场索引源可通过 `plugin-market` 条目的 `config.indexes` 配置 | bundle 的 `cordis.patch.yml` |
| 当前 npm CLI 未登录（401），`@bitey/*` 未发布 | `npm whoami` / `npm view` |
| 插件数据目录独立于包目录（`$DSH_HOME/storages/...`），卸载不应删除数据 | 各插件实现 |

## 4. 命名与发布位置

- npm scope：`@bitey`（用户 org：https://www.npmjs.com/org/bitey）
- 包名：

| 包 | 用途 | bin |
|---|---|---|
| `@bitey/dsh-usage-analytics` | 用量分析插件 | — |
| `@bitey/dsh-workspace-status` | 工作区 Git/PR 状态插件 | — |
| `@bitey/dsh-chat-clock` | 时间戳常显插件 | — |
| `@bitey/dpm` | 插件生命周期 CLI | `dpm` |

- GitHub 仓库名保持不变（`dsh-*`），npm 包名与仓库名解耦
- 版本号遵循 SemVer；npm dist-tag：`latest`（稳定）、`next`（预发）
- 每个仓库 tag `v<version>`，与 npm 版本一致

## 5. 插件包规范

### 5.1 `package.json`

```jsonc
{
  "name": "@bitey/dsh-usage-analytics",
  "version": "0.2.5",
  "description": "…",
  "license": "MIT",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "engines": { "dsh": ">=0.2.0-rc.2" },
  "repository": { "type": "git", "url": "git+https://github.com/martinx/dsh-usage-analytics.git" },
  "homepage": "https://github.com/martinx/dsh-usage-analytics#readme",
  "keywords": ["deepseek-harness", "dsh", "plugin"],
  "dsh": {
    "client": { "platform": "web" },
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

要点：

- 去掉 `private: true`
- `files` 必须包含 `lib/`（**预构建**的 host/client bundle，npm 安装后不再构建）
- `dsh.bundle.patch` 指向包内 `cordis.patch.yml`
- `dsh.client.platform = "web"` 保留浏览器半包加载
- `engines.dsh` 用于 DSH 兼容性检查

### 5.2 `cordis.patch.yml`

```yaml
# 插件名 — 一行说明
- insert:
    - id: usage-analytics
      name: '@bitey/dsh-usage-analytics'
```

- `id` 稳定，不随版本变化
- `name` 使用 npm 包名（安装后可由 profile node_modules 解析）
- 不写 `order`/`config` 除非必要

### 5.3 bundle 自插入风险

DSH 现有 bundle 都是"bundle 包 + 独立插件包"（bundle 的 patch 插入其他包）。让 patch 插入**自身**是否被 loader 接受，需要一次实验验证：

- **实验通过**：一个包同时承担 bundle 与插件，发布最简单
- **实验失败**：采用 wrapper 方案
  - `@bitey/bundle-usage-analytics`（只含 `cordis.patch.yml` 与 `dsh.bundle`）
  - 依赖 `@bitey/dsh-usage-analytics`
  - 市场条目指向 wrapper；用户也可以直接 `dpm install @bitey/dsh-usage-analytics`（dpm 自己写 patch）

决策：P0 先做自插入实验，结论写回本文档。

## 6. 市场索引规范

- 地址：`https://plugins.bitey.ai/market.json`（format 1）
- 版本来源二选一（每版本一个 source）：
  - **npm（推荐）**：`{ "type": "npm" }`，安装 spec 为 `@bitey/dsh-usage-analytics@0.2.5`
  - **git（镜像/回退）**：`{ "type": "git", "url": "...", "commit": "<40hex>" }`
- 推荐产物：
  - `market.json`：npm source，面向普通用户
  - `market-git.json`：git source，面向锁 commit / 无法访问 npm 的场景
- `metadata.categories` 至少包含：`ui`（界面）、`analytics`（统计）
- `publishTimestamp` 取 npm publish 时间或 git commit 时间（Unix 秒）
- 索引由 hub 的 `scripts/build.mjs` 生成；npm 发布后重新生成并部署

## 7. CLI 规范

### 7.1 安装与运行环境

- 包：`@bitey/dpm`，`bin: { dpm: "./lib/cli.js" }`
- Node `>= 20`，ESM
- 依赖尽量少：`yaml`（patch 编辑）、Node 内置 `child_process/fs/promises/fetch`
- 全局安装：`npm i -g @bitey/dpm`
- 引导脚本（可选）：`curl -fsSL https://plugins.bitey.ai/dpm.sh | sh`

### 7.2 全局参数

```
--profile <name>    默认 desktop；也接受绝对路径
--home <dir>        覆盖 $DSH_HOME（测试/多实例）
--dry-run           只打印将执行的命令与文件变更
--json              机器可读输出
--yes / -y          跳过确认
--exact             固定精确版本（传给 pnpm --save-exact）
--market <url|name> 指定市场索引（默认 https://plugins.bitey.ai/market.json）
--verbose
--no-color
```

### 7.3 命令

| 命令 | 行为 |
|---|---|
| `dpm install <spec>` | 解析来源 → pnpm add → 写 patch → 校验 → 提示重启 |
| `dpm uninstall <name>` | pnpm remove → 删除对应 patch entry → 保留数据目录 |
| `dpm list [--json]` | 合并 profile 依赖、patch 条目、市场信息，输出表格 |
| `dpm update [name]` | 按市场/npm 最新兼容版本重装；未指定 name 时更新全部 dpm 管理的插件 |
| `dpm search <kw>` | 拉取市场索引，按名称/描述/关键词过滤 |
| `dpm info <name>` | 包信息、版本历史、来源、兼容性、安装状态 |
| `dpm link <path>` | 本地开发模式：symlink + patch（替代 `install.sh`） |
| `dpm doctor` | 检查 profile、patch、node_modules、重复安装、client bundle、版本兼容性 |
| `dpm market add <url>` | 写 `plugin-market` 的 `config.indexes`（幂等） |
| `dpm market list` | 列出已配置索引源 |
| `dpm market remove <url>` | 移除索引源 |
| `dpm profile list` | 列出 `$DSH_HOME/profiles/*` 及当前选择 |

### 7.4 spec 语法

```
@bitey/dsh-usage-analytics              # npm latest
@bitey/dsh-usage-analytics@0.2.5        # npm 精确版本
@bitey/dsh-usage-analytics@^0.2          # npm range（需 --exact 固定）
github:martinx/dsh-usage-analytics#v0.2.5
git+https://github.com/martinx/dsh-usage-analytics.git#<40hex>
./dsh-usage-analytics                   # 本地目录 → 等价 link
```

解析优先级：

1. `./`、`/`、`file:` 开头 → 本地路径
2. `github:` / `git+` / `https://github.com/...` → git 来源，解析 ref → commit（40 hex）
3. 含 `@scope/name@version` 或纯包名 → npm
4. 其他 → 报错

### 7.5 安装流程（伪代码）

```
profile = resolveProfile(--profile)
spec    = resolveSpec(input, market)          # npm version / git commit / path
assertCompatible(spec)                        # engines.dsh
printPlan(spec)                               # dry-run 时到此为止
backup([package.json, pnpm-lock.yaml, cordis.patch.yml])

run('dsh', ['plugin', '--profile', profile, 'add', spec])
pkg = readProfilePackage(spec.name)
assertBundleOrLink(pkg)                       # dsh.bundle 或本地 link
writePatchInsert(pkg.dshEntryId, spec.name)   # 幂等、保留注释、原子写
pnpmInstallLocked()                           # 由 dsh plugin add 已完成，无需重复
printRestartHint()
```

失败时：恢复三个备份文件，输出 pnpm 诊断，非零退出。

### 7.6 patch 编辑规则

- 只操作 `- insert:` 下的条目，按 `name` 匹配；`id` 从包 manifest 推导（缺省用包名最后一段）
- 幂等：已存在同名 entry 且内容一致 → 不写文件
- 保留注释与格式：使用 `yaml` 的 `parseDocument`
- 原子写：临时文件 + rename
- 备份：`cordis.patch.yml.bak-<timestamp>`
- 卸载时：只删除 dpm 自己插入且属于该包的 entry；不碰用户手写配置

### 7.7 doctor 检查项

- profile 是否存在、是否被 Electron 管理（desktop）
- `node_modules/<pkg>` 是否存在、symlink 是否断链
- patch entry 与依赖是否一致（孤儿 entry / 有包无 entry）
- 重复安装（同一插件 symlink + pnpm 依赖同时存在）
- 插件 `engines.dsh` 是否满足
- client bundle 是否存在（`dsh.client` 包）
- 市场索引是否可访问、是否有更新
- 数据目录是否存在但插件已卸载（提示，不删除）

### 7.8 输出与退出码

| 退出码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 通用错误 |
| 2 | 参数/用法错误 |
| 3 | 网络或 registry 错误 |
| 4 | 兼容性不满足 |
| 5 | profile 文件冲突/回滚失败 |

人类输出示例：

```
✓ 解析 @bitey/dsh-usage-analytics@0.2.5 (npm)
✓ 已写入 profile desktop 依赖
✓ 已添加 cordis.patch.yml 条目 usage-analytics
提示：重启 DeepSeek Harness 后生效
```

`--json` 输出固定结构（`ok/action/target/version/source/warnings/restartRequired`）。

## 8. 安全

- git 来源只允许 `https://`；commit 必须是 40 位小写 hex；拒绝 `git://`、`ssh://`、带凭据 URL
- 不自动执行第三方 `postinstall`；如遇 build 审批，交给 DSH 的 build-approval 机制
- 所有 package.json/patch 修改先备份，失败自动恢复
- 默认不删除数据目录；`dpm uninstall --purge-data` 需显式确认
- 命令输出不打印 npm token；发布流程用 CI token

## 9. 发布流水线

每个插件仓库新增 `.github/workflows/release.yml`：

```yaml
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: 'https://registry.npmjs.org' }
      - run: npm ci
      - run: npm test
      - run: npm publish --access public --provenance
        env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }
```

- npm org `bitey` 需要先把 scope 权限授予发布 token
- 本地发布前：`npm login`（当前 CLI 未登录）
- 建议 2FA + granular access token（Automation），不把个人 token 放 CI
- 发布后：更新 hub `plugins.json` 版本 → `node scripts/build.mjs` → push（触发 Pages 部署）

## 10. 迁移计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 包规范化 + npm 登录/2FA + CI 发布 3 个插件 | `npm view @bitey/... version` 成功；`npm i @bitey/...` 可装 |
| P1 | `dpm` 核心命令（install/uninstall/list/update/link/doctor/market） | 在本机 profile 上完成 npm 与 github 两种安装、更新、卸载、doctor 全绿 |
| P2 | bundle 自插入实验 / wrapper 方案；market 切 npm source | DSH 插件页「发现」可安装并启用 |
| P3 | 文档与落地页：`npm i -g @bitey/dpm`；`install.sh` 标记 deprecated | 新用户按文档一条命令完成安装 |

迁移现有本地安装：

```bash
dpm adopt --profile desktop   # 把现有 symlink + patch 登记为 dpm 管理的本地链接
dpm list
```

## 11. 风险与未决问题

1. **bundle 自插入**是否被 loader 接受（P0 实验）
2. npm scope 权限/2FA 是否就绪（当前未登录）
3. DSH market UI 是否在正式版继续保留实验性市场入口
4. `@bitey/*` 包被 DSH 插件页安装后，client bundle 的加载路径是否与本地一致（需实测）
5. 多 profile（desktop/web/tui）下 patch 文件的差异
6. 是否支持 `dpm publish`（作者侧发布）；初版不做，交给 `npm version` + CI

## 12. 决策记录

| 日期 | 决策 | 备注 |
|---|---|---|
| 2026-10-17 | CLI 名称定为 `dpm`，包 `@bitey/dpm` | |
| 2026-10-17 | npm scope 使用 `@bitey` | org 已注册 |
| 2026-10-17 | 市场索引优先 npm source，另生成 git 镜像 | 待 P2 实施 |
| 2026-10-17 | dpm 定位为薄壳，安装仍走 profile 内 pnpm | |
