# YAML Anchor Resolver

A small VS Code extension that makes YAML anchors and aliases easier to read.

- **Hover** over a `*alias` to see the value the matching `&anchor` resolves to.
- Or display the resolved value **inline** at the end of the same line, git-blame style.
- **Cmd/Ctrl + click** on a `*alias` to jump to where the anchor is defined.
- Works with scalar, sequence, and mapping anchors — including merge keys (`<<: *anchor`).

## Example

```yaml
defaults: &defaults
  timeout: 30
  retries: 3

prod:
  <<: *defaults     # hover *defaults → shows the mapping above
  name: prod        # cmd+click *defaults → jumps to line 1
```

Hovering on `*defaults` renders:

```yaml
timeout: 30
retries: 3
```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `yaml-anchor-resolver.display` | `tooltip` | Choose `tooltip` for a hover popup, or `inline` for faded end-of-line text similar to git blame. |

## Installation

Install from the VS Code Marketplace, or build from source:

```sh
npm install
npm run package        # produces dist/extension.js
npx @vscode/vsce package  # produces a .vsix you can install via "Extensions: Install from VSIX..."
```

## How it works

The extension parses the active YAML document with [eemeli/yaml](https://github.com/eemeli/yaml), walks the AST to find an `Alias` node at the cursor position, then resolves it to its anchored target and renders that target back to YAML.

## Limitations

- Resolution is per-document only — anchors do not cross file boundaries (this matches the YAML spec).
- Documents with parse errors may produce partial or no hover results.

## License

MIT — see [LICENSE](LICENSE).
