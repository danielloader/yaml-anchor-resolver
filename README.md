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

### Visual Studio Code

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=danielloader.yaml-anchor-resolver).

### Other editors (Cursor, VSCodium, Windsurf, code-server, …)

Grab the latest `.vsix` from the [Releases page](https://github.com/danielloader/yaml-anchor-resolver/releases/latest), then:

1. `Cmd/Ctrl + Shift + P` → **Extensions: Install from VSIX…**
2. Pick the downloaded file.

### From source

```sh
npm install
npx @vscode/vsce package   # produces yaml-anchor-resolver-<version>.vsix
```

## How it works

The extension parses the active YAML document with [eemeli/yaml](https://github.com/eemeli/yaml), walks the AST to find an `Alias` node at the cursor position, then resolves it to its anchored target and renders that target back to YAML.

## Limitations

- Resolution is per-document only — anchors do not cross file boundaries (this matches the YAML spec).
- Documents with parse errors may produce partial or no hover results.

## License

MIT — see [LICENSE](LICENSE).
