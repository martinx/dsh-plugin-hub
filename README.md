# dsh-plugin-hub

Landing page + machine-readable index for **BITEY DSH plugins**.

- **Site**: https://plugins.bitey.ai
- **Plugin market index**: https://plugins.bitey.ai/market.json
- **GitHub Pages fallback**: https://martinx.github.io/dsh-plugin-hub/ (redirects once the custom domain is live)

## What this is

V1: a curated landing page for Martin's own DeepSeek Harness plugins — versions, descriptions, install steps, and a `market.json` that DSH's Discover tab can consume.

V2 (planned): a full plugin platform for the DSH ecosystem — aggregation, search, download stats, rankings, reviews, tutorials. The data model below is designed to grow into that.

## Layout

```
plugins.json          # source of truth: site copy, roadmap, plugin metadata
scripts/build.mjs     # generates index.html + market.json
index.html            # generated landing page (committed, served by GitHub Pages)
market.json           # generated DSH plugin-market index (committed)
CNAME                 # custom domain: plugins.bitey.ai
.github/workflows/    # Pages deployment
```

## Add a plugin

1. Put the plugin repository under `~/Projects/dsh-plugins/<name>` and push it to GitHub.
2. Append an entry to `plugins.json`:
   - `name` must equal the repository name and the plugin's `package.json` name
   - `version` is a fallback; when `../<name>` exists locally the build reads the real `package.json` version and current `git rev-parse HEAD`
   - keep both `zh` and `en` copy
3. Rebuild and commit:

   ```bash
   node scripts/build.mjs
   git add -A && git commit -m "feat: add <name>" && git push
   ```

When the sibling checkout is present, `market.json` records the exact commit, so DSH installs the version you built.

## Use the market in DSH

In DSH: **插件 → 更多 → 实验性插件 → 自定义插件市场**, add:

```
https://plugins.bitey.ai/market.json
```

The Discover tab lists every plugin with its versions and install actions.

## Custom domain / DNS

GitHub Pages serves this repo at `plugins.bitey.ai` (CNAME file). Required DNS record at the registrar or DNS provider:

| Type | Name | Value |
|---|---|---|
| CNAME | `plugins` | `martinx.github.io` |

With Cloudflare, set the record to **DNS only** (grey cloud) so GitHub can issue the TLS certificate; then enable HTTPS in the repository's Pages settings.

## Local preview

```bash
node scripts/build.mjs
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Notes

- GitHub Pages serves the committed `index.html`; the workflow does not rebuild, so run the build before pushing.
- V2 platform work will likely move data out of `plugins.json` into a database-backed service; `market.json` stays compatible as the public contract.
