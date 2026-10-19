#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const target = new URL('documentation/docs/types/typedefs.mdx', root);
const sourcePath = 'src/types/tournamentTypes.ts';
const source = ts.createSourceFile(
  sourcePath,
  readFileSync(new URL(sourcePath, root), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const declarations = source.statements.filter(
  (node) =>
    (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
);
const groups = [
  ['Common', ['Extension', 'TimeItem']],
  ['Generic', ['Address', 'Category', 'Entry', 'OnlineResource']],
  ['tournament', ['Tournament', 'Organisation', 'RegistrationProfile']],
  ['participant', ['Participant', 'Contact', 'Penalty', 'Person', 'BiographicalInformation']],
  ['event', ['Event']],
  [
    'drawDefinition',
    [
      'DrawDefinition',
      'Structure',
      'StructureBase',
      'ItemStructure',
      'ContainerStructure',
      'PositionAssignment',
      'SeedAssignment',
      'DrawLink',
      'DrawLinkBase',
      'RoundDrawLink',
      'PositionDrawLink',
      'DrawLinkSource',
      'DrawLinkTarget',
      'Interleave',
    ],
  ],
  [
    'matchUp',
    [
      'MatchUp',
      'MatchUpSchedule',
      'SideExitProvenance',
      'SideExitProvenanceEntry',
      'MatchUpStatusCodeRecord',
      'MatchUpFinishingPositionRange',
      'Score',
      'Set',
      'Game',
      'Point',
      'Side',
      'Team',
      'TeamCompetitor',
      'CollectionAssignment',
    ],
  ],
  ['tieFormat', ['TieFormat', 'CollectionDefinition', 'CollectionGroup', 'CollectionValueProfile', 'WinCriteria']],
  ['venue', ['Venue', 'Court', 'Availability', 'Booking']],
];
const byName = new Map(declarations.map((node) => [node.name.text, node]));
const used = new Set();
let content = `---\ntitle: Type Definitions\n---\n\n## Overview\n\nThis reference is generated from the factory's canonical TypeScript tournament model, including\noptional markers, arrays, unions and comments. Import the published types instead of copying these\ndeclarations into your application. Referenced enum names are described in [Enums](../enums.mdx).\nReferenced types imported from other modules retain their source names. TypeScript declarations and\nruntime JSON-schema validation are separate contracts: schema acceptance alone does not describe every\noperational field (including exit provenance).\n\n:::info Discriminated unions since 7.7.0\n\`Structure\` is \`ItemStructure | ContainerStructure\`, discriminated by \`structureType\`: a \`CONTAINER\`\nholds child \`structures\`, not its own \`matchUps\` or \`positionAssignments\`. An \`ITEM\` has no child\nstructures; its discriminator remains optional for stored-record compatibility. \`DrawLink\` is\n\`RoundDrawLink | PositionDrawLink\`: WINNER/LOSER links name a source round, POSITION links name\nsource finishing positions. The soft unions allow reads before narrowing while rejecting malformed\nconstruction. This is a type contract, not a runtime conversion.\n:::\n\nMaintainers: run \`node scripts/generateModelDocs.mjs\` after model changes, and\n\`node scripts/generateModelDocs.mjs --check\` to verify this page has not drifted.\n`;
function render(names) {
  return names
    .map((name) => {
      const node = byName.get(name);
      if (!node) throw new Error(`Missing canonical declaration: ${name}`);
      used.add(name);
      return `\n#### ${name}\n\n\`\`\`ts\n${node.getFullText(source).trim()}\n\`\`\`\n`;
    })
    .join('');
}
for (const [title, names] of groups) content += `\n### ${title}\n` + render(names);
content += '\n### Supporting declarations\n' + render([...byName.keys()].filter((name) => !used.has(name)));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content)
    throw new Error('Model reference drift: run node scripts/generateModelDocs.mjs');
  console.log(`[docs-model] ${declarations.length} canonical declarations match ${fileURLToPath(target)}`);
} else {
  writeFileSync(target, content);
  console.log(`[docs-model] wrote ${declarations.length} declarations`);
}
