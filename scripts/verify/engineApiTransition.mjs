#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = join(root, 'documentation/docs');
const manifest = JSON.parse(readFileSync(join(root, 'documentation/engine-api-transition.json'), 'utf8'));
const read = (relative) => readFileSync(join(docs, relative), 'utf8');
function check(data, readPage = read) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.methods.length, data.candidateCount, 'candidate inventory lost an entry');
  const names = new Set();
  const destinations = new Set();
  for (const method of data.methods) {
    assert(!names.has(method.name), `duplicate symbol ${method.name}`);
    names.add(method.name);
    assert(!destinations.has(method.destination), `duplicate destination ${method.destination}`);
    destinations.add(method.destination);
    assert(existsSync(join(root, method.source.path)), `missing source ${method.name}`);
    assert(method.source.symbol && method.governors.length, `unresolved symbol ${method.name}`);
    assert(
      ['candidate-for-removal', 'scheduled-for-removal', 'removed', 'retained'].includes(method.engineDisposition),
    );
    assert(['review-required', 'retained-public', 'internal'].includes(method.standaloneDisposition));
    assert(['pending', 'confirmed'].includes(method.externalConfirmation));
    if (['scheduled-for-removal', 'removed'].includes(method.engineDisposition))
      assert.equal(method.externalConfirmation, 'confirmed', `unconfirmed removal ${method.name}`);
    assert(method.engineEffects?.writes && method.engineEffects?.notices, `missing effects ${method.name}`);
    const page = readPage(`${method.destination}.md`);
    assert(page.includes(`# ${method.name}`), `wrong reference ${method.name}`);
    const statusPhrases = {
      'candidate-for-removal': '**candidate for removal',
      'scheduled-for-removal': '**scheduled for removal',
      removed: '**removed from',
      retained: '**retained on',
    };
    assert(page.includes(statusPhrases[method.engineDisposition]), `engine status drift ${method.name}`);
    const standalonePhrases = {
      'review-required': 'decision pending',
      'retained-public': 'supported',
      internal: 'internal',
    };
    assert(
      page.includes(`**Standalone package API after 8.0.0:** ${standalonePhrases[method.standaloneDisposition]}`),
      `standalone status drift ${method.name}`,
    );

    assert(page.includes(method.source.path), `missing source ownership ${method.name}`);
    assert(page.includes('## Source-local contract'), `missing contract ${method.name}`);
    assert(
      !/from\s+['"](?:@(?:Mutate|Query|Helpers)\/|tods-competition-factory\/src\/)/.test(page),
      'unsupported deep import',
    );
    for (const previous of method.previous) {
      const stub = readPage(previous.doc);
      assert(new RegExp(`^#{1,6} ${method.name}$`, 'm').test(stub), `lost anchor ${previous.doc}#${previous.anchor}`);
      assert(stub.includes(`/docs/${method.destination}`), `missing migration target ${method.name}`);
    }
    if (method.engineDisposition === 'removed') {
      const fences = [...page.matchAll(/```(?:js|javascript|ts|typescript)\b[^\n]*\n([\s\S]*?)```/g)];
      assert(
        !fences.some(([, code]) =>
          new RegExp(`\\b(?:engine|tournamentEngine|competitionEngine|syncEngine)\\.${method.name}\\s*\\(`).test(code),
        ),
        `obsolete current engine example ${method.name}`,
      );
    }
  }
  assert(
    readPage('migration-8.0.0.md').includes('/docs/implementation/engine-api-transition-8'),
    'missing migration-series entry',
  );
}
async function argumentPilot() {
  const { default: ts } = await import('typescript');
  const config = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile);
  const options = {
    ...ts.parseJsonConfigFileContent(config.config, ts.sys, root).options,
    noEmit: true,
    skipLibCheck: true,
  };
  const filename = join(root, '__engine_doc_argument_pilot.ts');
  const source = `import type { MethodSignatures } from './src/types/methodSignatures';
  declare const addGoesTo: MethodSignatures['addGoesTo'];
  declare const addNotes: MethodSignatures['addNotes'];
  addGoesTo({ drawId: 'draw' });
  addGoesTo({ sourceStructureId: 'fictional-key' });
  addNotes({ sourceStructureId: 'untyped-contract-control' });
  declare const methods: MethodSignatures;`;
  const host = ts.createCompilerHost(options);
  const originalGetSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) =>
    file === filename
      ? ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
      : originalGetSource(file, ...args);
  const program = ts.createProgram([filename], options, host);
  const sf = program.getSourceFile(filename);
  const checker = program.getTypeChecker();
  const methods = sf.statements.find((node) => node.declarationList?.declarations[0].name.text === 'methods')
    .declarationList.declarations[0];
  const signatures = checker.getTypeAtLocation(methods.name);
  let checked = 0;
  for (const method of manifest.methods) {
    const property = signatures.getProperty(method.name);
    if (!property) continue;
    const signature = checker.getTypeOfSymbolAtLocation(property, methods).getCallSignatures()[0];
    if (!signature) continue;
    const type =
      signature.parameters[0] &&
      checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(signature.parameters[0], methods));
    const checkArguments =
      type &&
      !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
      !checker.getIndexTypeOfType(type, ts.IndexKind.String);
    const allowed = new Set(checkArguments ? checker.getPropertiesOfType(type).map((symbol) => symbol.name) : []);
    for (const [, code] of read(`${method.destination}.md`).matchAll(
      /```(?:js|ts|javascript|typescript)\b[^\n]*\n([\s\S]*?)```/g,
    )) {
      const snippet = ts.createSourceFile('example.ts', code, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === method.name
        ) {
          checked++;
          const resultType = checker.getReturnTypeOfSignature(signature);
          if (
            !(resultType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
            ts.isVariableDeclaration(node.parent) &&
            ts.isObjectBindingPattern(node.parent.name)
          ) {
            const resultKeys = new Set(
              (resultType.isUnion() ? resultType.types : [resultType]).flatMap((type) =>
                checker.getPropertiesOfType(type).map((property) => property.name),
              ),
            );
            for (const binding of node.parent.name.elements) {
              const key = binding.propertyName?.text || binding.name?.text;
              if (key) assert(resultKeys.has(key), `${method.name}: unknown result property ${key}`);
            }
          }

          for (const property of allowed.size && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
            ? node.arguments[0].properties
            : []) {
            if (property.name && !ts.isComputedPropertyName(property.name))
              assert(allowed.has(property.name.text), `${method.name}: undocumented parameter ${property.name.text}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(snippet);
    }
  }
  assert(checked > 0, 'argument scan checked no documented calls');
  console.log(`[engine-api-transition] checked ${checked} documented calls: result shapes and typed argument names`);

  const lines = program
    .getSemanticDiagnostics(sf)
    .map((error) => sf.getLineAndCharacterOfPosition(error.start).line + 1);
  assert(lines.includes(5), 'generated signatures accepted addGoesTo fictional parameter');
  assert(!lines.includes(4), 'generated signatures refused valid drawId hint');
  console.log(
    `[engine-api-transition] argument pilot: addGoesTo rejects fictional keys; addNotes ${lines.includes(6) ? 'checked' : 'untyped (not checked)'}`,
  );
}
check(manifest);
if (process.argv.includes('--self-test')) {
  const broken = (mutate, reader, expected) => {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() => check(copy, reader), expected);
  };
  broken(
    (data) => {
      data.methods[0].destination = 'implementation/missing';
    },
    undefined,
    /ENOENT/,
  );
  const target = manifest.methods.find((method) => method.previous.length);
  broken(
    () => {},
    (page) =>
      page === target.previous[0].doc
        ? read(page).replaceAll(`/docs/${target.destination}`, '/docs/invalid')
        : read(page),
    /missing migration target/,
  );
  broken(
    (data) => {
      data.methods[0].engineDisposition = 'removed';
      data.methods[0].externalConfirmation = 'confirmed';
    },
    (page) =>
      page === `${manifest.methods[0].destination}.md`
        ? `${read(page).replace('**candidate for removal from', '**removed from')}\n\`\`\`js\nengine.${manifest.methods[0].name}({});\n\`\`\``
        : read(page),
    /obsolete current engine example/,
  );
  console.log(
    '[engine-api-transition] negative controls passed: missing page, lost target, obsolete bare-engine example',
  );
}
if (process.argv.includes('--argument-pilot')) await argumentPilot();
console.log(`[engine-api-transition] ${manifest.methods.length} symbol dispositions and migration targets checked`);

if (process.argv.includes('--rendered')) {
  let anchors = 0;
  for (const method of manifest.methods) {
    const canonical = join(root, 'documentation/build/docs', method.destination, 'index.html');
    assert(existsSync(canonical), `canonical page not rendered: ${method.name}`);
    for (const previous of method.previous) {
      const html = readFileSync(
        join(root, 'documentation/build/docs', previous.doc.replace(/\.mdx?$/, ''), 'index.html'),
        'utf8',
      );
      assert(html.includes(`id="${previous.anchor}"`), `rendered anchor lost: ${previous.doc}#${previous.anchor}`);
      assert(html.includes(`/docs/${method.destination}`), `rendered migration link lost: ${method.name}`);
      anchors++;
    }
  }
  console.log(
    `[engine-api-transition] rendered ${manifest.methods.length} canonical pages and preserved ${anchors} governor anchors`,
  );
}
