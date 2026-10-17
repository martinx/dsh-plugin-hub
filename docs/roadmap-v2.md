# V2 路线：DSH 插件平台

V1 是自用插件的展示页 + `market.json`。V2 的目标是把 `plugins.bitey.ai` 做成 DSH 生态里最专业、最全、最权威的插件平台：聚合、搜索、下载统计、排名榜单、评分 Review、教程。

这份文档先定方向与数据模型，避免 V1 的静态结构挡住 V2。

## 1. 产品面

| 模块 | 用户得到什么 | 依赖数据 |
|---|---|---|
| 插件目录 | 浏览、搜索、标签/分类筛选、排序 | Plugin、Version |
| 插件详情 | 说明、截图、README、版本历史、安装命令、兼容性 | Plugin、Version、Repo |
| 排名榜单 | 周榜 / 月榜 / 总榜、分类榜、新星榜 | InstallEvent、Review、Star |
| 评分与 Review | 打分、文字评价、作者回复、举报 | Review |
| 教程 | 入门、开发、最佳实践、插件作者投稿 | Article |
| 作者主页 | 该作者的插件、更新、下载合计 | Author |
| 公开 API | 索引、统计、榜单、搜索 | 全部 |

核心原则：

- **market.json 永远是公开契约**：无论 V2 后端怎么变，DSH 端只依赖这个格式。
- **数据可重建**：所有聚合数据都能从 GitHub / market.json / 安装事件重算，不把源数据锁在私有库里。
- **审核优先**：插件是会被安装执行的代码，目录必须标注可信度与安全状态。

## 2. 数据模型

```ts
interface Plugin {
  id: string                 // 仓库名或 npm 包名
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  author: Author
  repo: string
  homepage?: string
  category: Category
  tags: string[]
  license?: string
  createdAt: string          // 首次收录时间
  updatedAt: string          // 最近一次索引时间
  trust: 'official' | 'verified' | 'community' | 'unreviewed'
  stats: { downloads: number; installs: number; stars: number; reviews: number; rating: number }
}

interface Version {
  pluginId: string
  version: string
  commit?: string            // git 源必需，保证可复现
  engines: { dsh: string }   // 兼容的 DSH 版本范围
  publishedAt: string
  source: { type: 'git' | 'npm'; url?: string; commit?: string; path?: string }
  changelog?: string
  scan: { status: 'pending' | 'pass' | 'warn' | 'fail'; findings: Finding[] }
}

interface InstallEvent {
  pluginId: string
  version: string
  installId: string          // 匿名安装 ID，用于去重与下载量
  at: string
  dshVersion: string
  platform: 'darwin' | 'win32' | 'linux'
}

interface Review {
  id: string
  pluginId: string
  version?: string
  author: { github: string; avatar: string }
  rating: 1 | 2 | 3 | 4 | 5
  body: string
  createdAt: string
  replies: ReviewReply[]
  status: 'visible' | 'hidden' | 'flagged'
}

interface Article {
  id: string
  slug: string
  title: string
  kind: 'guide' | 'tutorial' | 'best-practice' | 'release'
  body: string               // MDX
  author: Author
  publishedAt: string
  tags: string[]
}
```

## 3. 数据从哪来

1. **GitHub 索引器**（GitHub Actions 定时任务）
   - 搜索 `topic:dsh-plugin`、`dsh.client` 的 package.json、以及提交到目录的仓库
   - 抓 README、license、stars、最近提交、release/tag
   - 产出 `index.json` 快照（构建期产物，可全量重建）
2. **market.json 抓取**：已存在的第三方市场索引，直接合并。
3. **安装事件**：插件安装脚本上报匿名 install 事件（opt-out 可关闭）；用于下载量、榜单。
4. **人工审核**：作者认领、代码扫描结果、举报处理记录。

## 4. 排名公式

榜单不能只看下载量（容易被刷），建议加权：

```
score = 0.35 * log10(1 + installs_7d)
      + 0.20 * log10(1 + installs_total)
      + 0.15 * rating_normalized
      + 0.15 * recency_boost
      + 0.10 * author_trust
      - 0.05 * report_penalty
```

- `recency_boost`：最近 14 天有更新加分
- `author_trust`：verified/official 加权
- `report_penalty`：被举报且核实的插件降权
- 刷量检测：同一 installId 重复、异常平台分布、短时间尖峰

## 5. 架构演进

### V2.0（静态优先，零运维）

- GitHub Actions 定时抓取 → 生成 `data/plugins.json`、`data/ranking.json`、`data/reviews.json`
- 前端仍是静态站（Astro/Vite + 客户端搜索索引），托管在 GitHub Pages
- Review 通过 GitHub Issue / Discussion 表单收集，Action 转为 JSON（免后端、天然有 GitHub 身份）
- 教程用 MDX，构建期渲染

### V2.1（加后端，只加必要部分）

- 安装事件与下载统计需要写入 → Cloudflare Workers + D1/KV（或 Supabase）
- GitHub OAuth 登录、Review 提交/回复/举报
- 搜索从客户端索引升级为服务端全文搜索（Meilisearch/Typesense）

### V2.2（平台化）

- 公开 API：`/api/v1/plugins`、`/api/v1/ranking`、`/api/v1/search`
- 作者后台：版本发布、README 同步、认领
- 安全扫描：静态检查（危险 API、网络外联、权限声明）+ 人工复核

## 6. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| V2.0-a | GitHub 索引器 + 插件目录页（搜索/标签/分类） | 自动收录 ≥ 50 个插件 |
| V2.0-b | 插件详情页 + 版本历史 + 安装命令 | 每个收录插件有可复现版本 |
| V2.0-c | 榜单页（周/月/总/新星） | 榜单数据每日更新 |
| V2.0-d | Review（GitHub Discussion 表单） | 提交后 10 分钟内上墙 |
| V2.1 | 安装统计 + 作者认领 + 公开 API | 下载量可查询、API 有文档 |
| V2.2 | 安全扫描 + 教程中心 + 作者后台 | 扫描结果展示、教程 ≥ 10 篇 |

## 7. 风险

- **恶意插件**：目录必须标 `trust`，安装前展示扫描结果；不托管二进制。
- **刷量/刷评**：匿名 installId 去重、GitHub 账号年龄门槛、举报机制。
- **收录版权**：只索引公开仓库，README 摘要注明来源与 license。
- **市场格式演进**：`market.json` 保持向后兼容，新增字段只加不改。
