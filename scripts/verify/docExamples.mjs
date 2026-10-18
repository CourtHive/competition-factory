#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Type-check and execute the actual selected fences, not a second copy of the examples.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const factory = require(join(root, 'dist/tods-competition-factory.development.cjs.js'));
const packageTypes = join(root, 'dist/tods-competition-factory');
const factorySetup = `
tournamentEngine.setState({ tournamentId: 'docs', participants: [
  { participantId: 'player-123', participantName: 'Docs Player', participantType: 'INDIVIDUAL', person: { personId: 'person-docs', standardGivenName: 'Docs' } }
], events: [{ eventId: 'event', eventType: 'SINGLES', entries: [] }] });
const eventId = 'event';`;
const cases = [
  {
    page: 'scoring-engine/event-handlers.md',
    contains: 'const notifications: string[]',
    check: `if (notifications.length !== 1 || scorer.getPointCount() !== 1) throw new Error('no-op event dispatch');`,
  },
  {
    page: 'scoring-engine/scoring-engine-overview.md',
    contains: 'const scoreboard = engine.getScoreboard()',
    check: `if (scoreboard !== '1-0' || pointCount !== 4 || engine.getScoreboard() !== '1-0') throw new Error('opening game/redo');
engine.undo(); if (engine.getScoreboard() !== '0-0 (40-0)') throw new Error('undo scoreboard');`,
  },
  {
    page: 'scoring-engine/visualization-applications.md',
    contains: 'const mixed = new ScoringEngine',
    setup: 'const { ScoringEngine } = scoreGovernor;',
    check: `if (timeline.length !== 2 || timeline[0].game.complete || timeline[1].set.index !== 2) throw new Error('mixed episodes');`,
  },
  {
    page: 'scoring-engine/visualization-applications.md',
    contains: 'const grid = episodes.map',
    setup: `const engine = new scoreGovernor.ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
engine.addPoint({ winner: 0, rallyLength: 9 });`,
    check: `if (grid[0].size !== 9 || grid[0].game !== 0 || grid[0].set !== 0) throw new Error('episode metadata/index');`,
  },
  {
    page: 'scoring-engine/scoring-engine-api.md',
    contains: 'const set1Stats = engine.getStatistics',
    setup: `const engine = new scoreGovernor.ScoringEngine({ matchUpFormat: 'SET1-S:TB1' }); engine.addPoint({ winner: 0 });`,
    check: `if (set1Stats.counters.teams[0].pointsWon.length !== 1) throw new Error('first set statistics');`,
  },
  {
    page: 'concepts/draw-links.mdx',
    contains: 'tournamentEngine.addLinkedConsolationStructure',
    setup: factorySetup,
    check: `if (!result.success) throw new Error('linked consolation');
const { structures } = tournamentEngine.getDrawStructures({ drawId });
if (!structures || structures.length !== 2) throw new Error('attached structures');`,
  },
  {
    page: 'tmx/draws.md',
    contains: 'const structureId = drawDefinition.structures?.[0]?.structureId',
    setup: factorySetup,
    check: `if (!result.success) throw new Error('draw attachment');
const seeded = tournamentEngine.modifySeedAssignment({drawId, structureId, participantId: 'player-123', seedValue: '1'});
if (!('success' in seeded) || !seeded.success) throw new Error('seed assignment');
const positions = tournamentEngine.getPositionAssignments({drawId, structureId});
if (positions.positionAssignments?.length !== 32) throw new Error('positions');`,
  },
  {
    page: 'tmx/participants.md',
    contains: 'person: { contacts:',
    setup: factorySetup + "\nconst participantId = 'player-123';",
    check: `const found = tournamentEngine.getParticipants({participantFilters:{participantIds:[participantId]}}).participants?.[0];
if (found?.person?.contacts?.[0]?.mobileTelephone !== '+1-555-0123') throw new Error('contact persistence');`,
  },
];
// Keep the advertised complete index synchronized with public class methods.
const source = ts.createSourceFile(
  'ScoringEngine.ts',
  readFileSync(join(root, 'src/assemblies/engines/scoring/ScoringEngine.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const scorerClass = source.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === 'ScoringEngine',
);
const api = readFileSync(join(root, 'documentation/docs/scoring-engine/scoring-engine-api.md'), 'utf8');
const headings = new Set([...api.matchAll(/^### (\w+)\s*$/gm)].map((match) => match[1]));
const methods = scorerClass.members.filter(
  (node) =>
    ts.isMethodDeclaration(node) && !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword),
);
const missing = methods.map((node) => node.name.getText(source)).filter((name) => !headings.has(name));
if (missing.length) throw new Error(`Missing ScoringEngine reference entries: ${missing.join(', ')}`);
console.log(`[docs-examples] ${methods.length} public ScoringEngine methods indexed`);

const workdir = mkdtempSync(join(root, '.doc-examples-'));
try {
  const files = cases.map((example, index) => {
    const markdown = readFileSync(join(root, 'documentation/docs', example.page), 'utf8');
    const fences = [...markdown.matchAll(/^```(?:js|javascript|ts|typescript)\s*\n([\s\S]*?)^```/gm)]
      .map((match) => match[1])
      .filter((code) => code.includes(example.contains));
    if (fences.length !== 1)
      throw new Error(`${example.page}: expected exactly one selected fence, got ${fences.length}`);
    example.code = `${example.setup ?? ''}\n${fences[0]}\n${example.check}`;
    const body = example.code.replaceAll("from 'tods-competition-factory'", `from ${JSON.stringify(packageTypes)}`);
    const file = join(workdir, `example-${index}.ts`);
    const imports = `import { scoreGovernor, tournamentEngine, mocksEngine } from ${JSON.stringify(packageTypes)};\n`;
    // The overview already imports scoreGovernor; avoid a duplicate import.
    writeFileSync(file, (body.includes('import { scoreGovernor }') ? '' : imports) + body + '\nexport {};\n');
    return file;
  });
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    );
    throw new Error('Documentation example typecheck failed');
  }
  for (const example of cases) {
    const sourceCode = example.code.replace(/^import .* from .*;\s*$/gm, '');
    const code = ts.transpileModule(sourceCode, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    new Function('scoreGovernor', 'tournamentEngine', 'mocksEngine', code)(
      factory.scoreGovernor,
      factory.tournamentEngine,
      factory.mocksEngine,
    );
    console.log(`[docs-examples] PASS ${example.page}: ${example.contains}`);
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
