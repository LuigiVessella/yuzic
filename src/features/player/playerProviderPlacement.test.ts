import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

function ancestorsOf(file: string, component: string): string[][] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: string[][] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === component) {
      const ancestors: string[] = [];
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxElement(parent)) ancestors.push(parent.openingElement.tagName.getText(source));
      }
      matches.push(ancestors);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return matches;
}

const root = resolve(__dirname, '../../app/_layout.tsx');
const home = resolve(__dirname, '../../app/(home)/_layout.tsx');

it.each(['PlayerHost', 'Stack', 'SongActionSheetProvider'])('%s shares the root external resolution provider', component => {
  const matches = ancestorsOf(root, component);
  expect(matches).toHaveLength(1);
  expect(matches[0]).toContain('ExternalResolutionProvider');
});

it('keeps the source picker inside the bottom-sheet host without a route-local duplicate', () => {
  const providers = ancestorsOf(root, 'ExternalResolutionProvider');
  expect(providers).toHaveLength(1);
  expect(providers[0]).toContain('BottomSheetModalProvider');
  expect(ancestorsOf(home, 'ExternalResolutionProvider')).toHaveLength(0);
});
