import * as vscode from 'vscode';
import { parseDocument, visit, isAlias, isMap, isSeq, stringify, Alias, Document } from 'yaml';

const CONFIG_SECTION = 'yaml-anchor-resolver';
const DISPLAY_KEY = 'display';

type DisplayMode = 'tooltip' | 'inline';

function getDisplayMode(): DisplayMode {
	const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(DISPLAY_KEY, 'tooltip');
	return value === 'inline' ? 'inline' : 'tooltip';
}

function parseSafely(text: string): Document | undefined {
	try {
		return parseDocument(text);
	} catch {
		return undefined;
	}
}

function findAliasAt(doc: Document, offset: number): Alias | undefined {
	let hit: Alias | undefined;
	visit(doc, (_key, node) => {
		if (isAlias(node) && node.range) {
			const [start, , end] = node.range;
			if (offset >= start && offset < end) {
				hit = node;
				return visit.BREAK;
			}
		}
		return undefined;
	});
	return hit;
}

function renderResolved(alias: Alias, doc: Document, flow = false): string | undefined {
	const resolved = alias.resolve(doc);
	if (!resolved) {
		return undefined;
	}
	const value = resolved.toJSON();
	if (!flow) {
		return stringify(value, { lineWidth: 0 }).trimEnd();
	}
	const flowDoc = new Document(value);
	visit(flowDoc, (_key, node) => {
		if (isMap(node) || isSeq(node)) {
			node.flow = true;
		}
	});
	return flowDoc.toString({ lineWidth: 0 }).trimEnd();
}

function registerDefinitionProvider(selector: vscode.DocumentSelector): vscode.Disposable {
	return vscode.languages.registerDefinitionProvider(selector, {
		provideDefinition(document, position) {
			const doc = parseSafely(document.getText());
			if (!doc) {
				return undefined;
			}
			const hit = findAliasAt(doc, document.offsetAt(position));
			if (!hit) {
				return undefined;
			}
			const resolved = hit.resolve(doc);
			if (!resolved || !resolved.range) {
				return undefined;
			}
			const [start, , end] = resolved.range;
			return new vscode.Location(
				document.uri,
				new vscode.Range(document.positionAt(start), document.positionAt(end)),
			);
		},
	});
}

function registerHoverMode(selector: vscode.DocumentSelector): vscode.Disposable {
	return vscode.languages.registerHoverProvider(selector, {
		provideHover(document, position) {
			const doc = parseSafely(document.getText());
			if (!doc) {
				return undefined;
			}
			const hit = findAliasAt(doc, document.offsetAt(position));
			if (!hit || !hit.range) {
				return undefined;
			}

			const md = new vscode.MarkdownString();
			const rendered = renderResolved(hit, doc);
			if (rendered === undefined) {
				md.appendMarkdown(`**Unresolved anchor:** \`&${hit.source}\``);
			} else {
				md.appendCodeblock(rendered, 'yaml');
			}

			const [start, , end] = hit.range;
			return new vscode.Hover(
				md,
				new vscode.Range(document.positionAt(start), document.positionAt(end)),
			);
		},
	});
}

function registerInlineMode(): vscode.Disposable {
	const decorationType = vscode.window.createTextEditorDecorationType({
		after: {
			color: new vscode.ThemeColor('editorCodeLens.foreground'),
			fontStyle: 'italic',
			margin: '0 0 0 2em',
		},
	});

	const refresh = (editor: vscode.TextEditor | undefined): void => {
		if (!editor) {
			return;
		}
		if (editor.document.languageId !== 'yaml') {
			editor.setDecorations(decorationType, []);
			return;
		}
		const doc = parseSafely(editor.document.getText());
		if (!doc) {
			editor.setDecorations(decorationType, []);
			return;
		}
		type Entry = { line: number; source: string; rendered: string };
		const entries: Entry[] = [];
		visit(doc, (_key, node) => {
			if (!isAlias(node) || !node.range) {
				return undefined;
			}
			const rendered = renderResolved(node, doc, true);
			if (rendered === undefined) {
				return undefined;
			}
			const line = editor.document.positionAt(node.range[0]).line;
			entries.push({ line, source: node.source, rendered });
			return undefined;
		});

		const perLineCount = new Map<number, number>();
		for (const e of entries) {
			perLineCount.set(e.line, (perLineCount.get(e.line) ?? 0) + 1);
		}

		const decorations: vscode.DecorationOptions[] = entries.map(e => {
			const trimmed = e.rendered.length > 200 ? e.rendered.slice(0, 200) + '…' : e.rendered;
			const prefix = (perLineCount.get(e.line) ?? 0) > 1 ? `*${e.source} → ` : '→ ';
			const lineEnd = editor.document.lineAt(e.line).range.end;
			return {
				range: new vscode.Range(lineEnd, lineEnd),
				renderOptions: { after: { contentText: `${prefix}${trimmed}` } },
			};
		});

		editor.setDecorations(decorationType, decorations);
	};

	vscode.window.visibleTextEditors.forEach(refresh);

	const subscriptions: vscode.Disposable[] = [
		decorationType,
		vscode.window.onDidChangeActiveTextEditor(refresh),
		vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(refresh)),
		vscode.workspace.onDidChangeTextDocument(event => {
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document === event.document) {
					refresh(editor);
				}
			}
		}),
	];

	return {
		dispose: () => {
			for (const editor of vscode.window.visibleTextEditors) {
				editor.setDecorations(decorationType, []);
			}
			subscriptions.forEach(s => s.dispose());
		},
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const selector: vscode.DocumentSelector = { language: 'yaml' };

	context.subscriptions.push(registerDefinitionProvider(selector));

	let displayModeDisposable: vscode.Disposable = applyMode();

	function applyMode(): vscode.Disposable {
		return getDisplayMode() === 'inline' ? registerInlineMode() : registerHoverMode(selector);
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(`${CONFIG_SECTION}.${DISPLAY_KEY}`)) {
				displayModeDisposable.dispose();
				displayModeDisposable = applyMode();
			}
		}),
		{ dispose: () => displayModeDisposable.dispose() },
	);
}

export function deactivate(): void {}
