# dsh-plugin-hub

Landing page + machine-readable index for Martin's DeepSeek Harness plugins.

- **Landing page**: https://martinx.github.io/dsh-plugin-hub/
- **Plugin market index**: https://martinx.github.io/dsh-plugin-hub/market.json

The page is generated: edit `plugins.json`, run the build, commit the generated files.

## Layout

```
plugins.json          # source of truth: title, version, description, tags, repo, install
scripts/build.mjs     # generates index.html + market.json
index.html            # generated landing page (committed, served by GitHub Pages)
market.json           # generated DSH plugin-market index (committed)
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
   git add -A && git commit -m "feat: add <name>"
   git push
   ```

When the sibling checkout is present, `market.json` records the exact commit, so DSH installs the version you built.

## Use the market in DSH

In DSH: **插件 → 更多 → 实验性插件 → 自定义插件市场**, add the index URL above. The Discover tab then lists every plugin in `market.json` with versions and install actions.

## Local preview

```bash
node scripts/build.mjs
open index.html
```

## Notes

- GitHub Pages serves the committed `index.html`; the workflow does not rebuild, so a stale `index.html` means someone forgot to run the build before pushing.
- The plugin repos themselves stay independent; this hub only records versions, descriptions, and links.
