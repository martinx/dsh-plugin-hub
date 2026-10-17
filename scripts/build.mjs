// Generate index.html and market.json from plugins.json.
//
// When a sibling plugin checkout exists (../<plugin name>), its package.json
// version and current git commit are treated as authoritative for the market
// index. Without a checkout the values recorded in plugins.json are used.
//
// Usage: node scripts/build.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(join(ROOT, 'plugins.json'), 'utf8'))
const { site, plugins } = data

function git(repoDir, args) {
  try {
    return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const resolved = plugins.map((plugin) => {
  const dir = join(ROOT, '..', plugin.name)
  const checkout = existsSync(dir)
  let version = plugin.version
  let commit = plugin.commit ?? null
  if (checkout) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (typeof manifest.version === 'string') version = manifest.version
    } catch {
      // Keep the recorded version when the sibling checkout is not readable.
    }
    commit = git(dir, ['rev-parse', 'HEAD']) ?? commit
  }
  return { ...plugin, version, commit, checkout }
})

const market = {
  format: 1,
  title: site.title,
  plugins: resolved.map((plugin) => ({
    name: plugin.name,
    title: plugin.title,
    description: plugin.description.zh,
    author: site.author,
    homepage: `${plugin.repo}#readme`,
    repository: { url: plugin.repo },
    versions: [
      {
        version: plugin.version,
        source: {
          type: 'git',
          url: plugin.repo,
          ...(plugin.commit === null ? {} : { commit: plugin.commit }),
        },
        engines: plugin.engines,
      },
    ],
  })),
}

writeFileSync(join(ROOT, 'market.json'), `${JSON.stringify(market, null, 2)}\n`)

const cards = resolved.map((plugin) => {
  const tags = plugin.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
  return `
      <article class="card" data-plugin="${escapeHtml(plugin.name)}">
        <div class="card-head">
          <h2>${escapeHtml(plugin.title.zh)}</h2>
          <span class="version">v${escapeHtml(plugin.version)}</span>
        </div>
        <p class="en">${escapeHtml(plugin.title.en)}</p>
        <p class="desc">${escapeHtml(plugin.description.zh)}</p>
        <p class="desc en-desc">${escapeHtml(plugin.description.en)}</p>
        <div class="meta">
          <span class="category">${escapeHtml(plugin.category)}</span>
          ${tags}
        </div>
        <pre class="install"><code>${escapeHtml(plugin.install)}</code></pre>
        <p class="notes">${escapeHtml(plugin.notes.zh)}</p>
        <div class="links">
          <a href="${escapeHtml(plugin.repo)}" target="_blank" rel="noreferrer">GitHub</a>
          <a href="${escapeHtml(plugin.repo)}/blob/main/README.md" target="_blank" rel="noreferrer">README</a>
          <a href="${escapeHtml(plugin.repo)}#readme" target="_blank" rel="noreferrer">安装说明</a>
        </div>
      </article>`
}).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(site.title.zh)}</title>
<meta name="description" content="${escapeHtml(site.description.zh)}">
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f7f8;
    --card: #ffffff;
    --text: #1c1c1e;
    --muted: #6b6b72;
    --border: rgba(0, 0, 0, 0.09);
    --accent: #3b6ef5;
    --chip: rgba(59, 110, 245, 0.10);
    --code-bg: #f2f2f4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111113;
      --card: #1a1a1d;
      --text: #f2f2f4;
      --muted: #9a9aa2;
      --border: rgba(255, 255, 255, 0.10);
      --accent: #7fa0ff;
      --chip: rgba(127, 160, 255, 0.14);
      --code-bg: #141416;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 56px 20px 80px;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
  }
  .wrap { max-width: 1040px; margin: 0 auto; }
  header.hero { margin-bottom: 40px; }
  h1 { font-size: 30px; line-height: 1.25; margin: 0 0 10px; letter-spacing: -0.02em; }
  .lede { color: var(--muted); margin: 0 0 18px; max-width: 720px; }
  .market {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--card); color: var(--muted); font-size: 13px;
  }
  .market code { color: var(--text); }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px; display: flex; flex-direction: column; gap: 10px;
  }
  .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .card h2 { font-size: 18px; margin: 0; letter-spacing: -0.01em; }
  .version {
    font-size: 12px; color: var(--accent); background: var(--chip);
    border-radius: 999px; padding: 1px 9px; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .en { margin: -6px 0 0; color: var(--muted); font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase; }
  .desc { margin: 0; }
  .en-desc { color: var(--muted); font-size: 13px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .category { font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--chip); color: var(--accent); }
  .tag { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .install { margin: 4px 0 0; background: var(--code-bg); border-radius: 10px; padding: 12px; overflow-x: auto; }
  .install code { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .notes { margin: 0; color: var(--muted); font-size: 12.5px; }
  .links { display: flex; gap: 14px; margin-top: auto; padding-top: 6px; }
  .links a { color: var(--accent); text-decoration: none; font-size: 13px; }
  .links a:hover { text-decoration: underline; }
  footer { margin-top: 48px; color: var(--muted); font-size: 12px; }
  footer a { color: inherit; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>${escapeHtml(site.title.zh)}</h1>
      <p class="lede">${escapeHtml(site.description.zh)}</p>
      <div class="market">在 DSH 里添加插件市场索引：<code>${escapeHtml(site.marketUrl)}</code></div>
    </header>
    <main class="grid">${cards}
    </main>
    <footer>
      <a href="https://github.com/martinx/dsh-plugin-hub">dsh-plugin-hub</a>
      · 生成于 ${new Date().toISOString().slice(0, 10)}
      · 插件源码遵循各自的许可证
    </footer>
  </div>
</body>
</html>
`

writeFileSync(join(ROOT, 'index.html'), html)
console.log(`built ${resolved.length} plugin(s): index.html, market.json`)
for (const plugin of resolved) {
  console.log(`  ${plugin.name}@${plugin.version}${plugin.checkout ? '' : ' (no sibling checkout)'}`)
}
