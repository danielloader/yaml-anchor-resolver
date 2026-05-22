# Change Log

All notable changes to the **YAML Anchor Resolver** extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.0.1] - 2026-05-22

### Added

- Hover provider: hover a `*alias` to see the value its `&anchor` resolves to.
- Inline display mode: faded end-of-line annotation (git-blame style) showing the resolved value, configurable via `yaml-anchor-resolver.display`.
- Go-to-definition: cmd/ctrl + click on a `*alias` jumps to where the anchor is defined.
- Support for scalar, sequence, and mapping anchors, including merge keys (`<<: *anchor`).
