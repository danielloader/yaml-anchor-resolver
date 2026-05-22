import * as assert from 'assert';
import * as vscode from 'vscode';

async function openYaml(content: string): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument({ language: 'yaml', content });
	await vscode.window.showTextDocument(doc);
	return doc;
}

async function hoverAt(doc: vscode.TextDocument, line: number, character: number): Promise<vscode.Hover[]> {
	return (await vscode.commands.executeCommand<vscode.Hover[]>(
		'vscode.executeHoverProvider',
		doc.uri,
		new vscode.Position(line, character),
	)) ?? [];
}

async function definitionAt(doc: vscode.TextDocument, line: number, character: number): Promise<vscode.Location[]> {
	return (await vscode.commands.executeCommand<vscode.Location[]>(
		'vscode.executeDefinitionProvider',
		doc.uri,
		new vscode.Position(line, character),
	)) ?? [];
}

function hoverText(hovers: vscode.Hover[]): string {
	return hovers
		.flatMap(h => h.contents)
		.map(c => {
			if (typeof c === 'string') {
				return c;
			}
			if (c instanceof vscode.MarkdownString) {
				return c.value;
			}
			return 'value' in c ? c.value : '';
		})
		.join('\n');
}

suite('YAML Anchor Resolver', () => {
	suite('hover', () => {
		test('resolves a scalar alias', async () => {
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const text = hoverText(await hoverAt(doc, 1, 10));
			assert.ok(text.includes('db.prod:5432'), `expected scalar value, got: ${text}`);
		});

		test('resolves a sequence alias', async () => {
			const doc = await openYaml('tags: &t\n  - a\n  - b\ncopy: *t\n');
			const text = hoverText(await hoverAt(doc, 3, 7));
			assert.ok(text.includes('- a') && text.includes('- b'), `expected sequence, got: ${text}`);
		});

		test('resolves a mapping alias via merge key', async () => {
			const doc = await openYaml('defaults: &d\n  x: 1\n  y: 2\nclone:\n  <<: *d\n');
			const text = hoverText(await hoverAt(doc, 4, 7));
			assert.ok(text.includes('x: 1') && text.includes('y: 2'), `expected mapping, got: ${text}`);
		});

		test('renders mappings in block style in the tooltip', async () => {
			const doc = await openYaml('defaults: &d\n  x: 1\n  y: 2\nclone:\n  <<: *d\n');
			const text = hoverText(await hoverAt(doc, 4, 7));
			assert.ok(text.includes('x: 1\ny: 2'), `expected block-style YAML, got: ${text}`);
			assert.ok(!text.includes('{ x: 1'), `tooltip should not use flow style, got: ${text}`);
		});

		test('follows chained aliases', async () => {
			const doc = await openYaml(
				'a: &a 42\n' +
				'b: &b\n' +
				'  value: *a\n' +
				'c: *b\n',
			);
			const text = hoverText(await hoverAt(doc, 3, 4));
			assert.ok(text.includes('value: 42'), `expected chained resolution, got: ${text}`);
		});

		test('resolves multiple aliases on the same line', async () => {
			const doc = await openYaml(
				'net: &net\n  vpc: vpc-1\n' +
				'sec: &sec\n  role: r1\n' +
				'merged:\n  <<: [*net, *sec]\n',
			);
			const netHover = hoverText(await hoverAt(doc, 5, 9));
			const secHover = hoverText(await hoverAt(doc, 5, 15));
			assert.ok(netHover.includes('vpc: vpc-1'), `expected net mapping, got: ${netHover}`);
			assert.ok(secHover.includes('role: r1'), `expected sec mapping, got: ${secHover}`);
		});

		test('reports an unresolved alias', async () => {
			const doc = await openYaml('broken: *missing\n');
			const text = hoverText(await hoverAt(doc, 0, 10));
			assert.ok(text.toLowerCase().includes('unresolved'), `expected unresolved message, got: ${text}`);
		});

		test('no hover when cursor is not on an alias', async () => {
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const text = hoverText(await hoverAt(doc, 0, 1));
			assert.ok(
				!text.toLowerCase().includes('unresolved') && !text.includes('db.prod:5432'),
				`expected no anchor hover content, got: ${text}`,
			);
		});
	});

	suite('go to definition', () => {
		test('jumps from a scalar alias to its anchor', async () => {
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const locations = await definitionAt(doc, 1, 10);
			assert.strictEqual(locations.length, 1, `expected one location, got ${locations.length}`);
			assert.strictEqual(locations[0].uri.toString(), doc.uri.toString());
			assert.strictEqual(locations[0].range.start.line, 0, 'expected target on the anchor line');
		});

		test('jumps from a sequence alias to its anchor', async () => {
			const doc = await openYaml('tags: &t\n  - a\n  - b\ncopy: *t\n');
			const locations = await definitionAt(doc, 3, 7);
			assert.strictEqual(locations.length, 1);
			assert.strictEqual(locations[0].range.start.line, 0);
		});

		test('jumps from a mapping alias (merge key) to its anchor', async () => {
			const doc = await openYaml('defaults: &d\n  x: 1\nclone:\n  <<: *d\n');
			const locations = await definitionAt(doc, 3, 7);
			assert.strictEqual(locations.length, 1);
			assert.strictEqual(locations[0].range.start.line, 0);
		});

		test('returns nothing for an unresolved alias', async () => {
			const doc = await openYaml('broken: *missing\n');
			const locations = await definitionAt(doc, 0, 10);
			assert.strictEqual(locations.length, 0);
		});

		test('returns nothing when cursor is not on an alias', async () => {
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const locations = await definitionAt(doc, 0, 0);
			assert.strictEqual(locations.length, 0);
		});
	});

	suite('configuration', () => {
		const config = () => vscode.workspace.getConfiguration('yaml-anchor-resolver');

		async function setDisplay(value: string | undefined): Promise<void> {
			await config().update('display', value, vscode.ConfigurationTarget.Global);
			// Give the extension's onDidChangeConfiguration listener a tick to swap providers.
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		teardown(async () => {
			await setDisplay(undefined);
		});

		test('hover provider is disabled when display is inline', async () => {
			await setDisplay('inline');
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const text = hoverText(await hoverAt(doc, 1, 10));
			assert.ok(!text.includes('db.prod:5432'), `expected no hover in inline mode, got: ${text}`);
		});

		test('hover provider returns after switching back to tooltip', async () => {
			await setDisplay('inline');
			await setDisplay('tooltip');
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const text = hoverText(await hoverAt(doc, 1, 10));
			assert.ok(text.includes('db.prod:5432'), `expected hover after reset, got: ${text}`);
		});

		test('definition provider works in both modes', async () => {
			await setDisplay('inline');
			const doc = await openYaml('host: &h db.prod:5432\nprimary: *h\n');
			const locations = await definitionAt(doc, 1, 10);
			assert.strictEqual(locations.length, 1, `definition should work in inline mode`);
		});
	});
});
