// Check the same source text the two diagnostic loaders compile, under the package's production tsconfig.
import ts from 'typescript';
import { join, resolve } from 'node:path';
import { packageRoot, patchedSources } from './overlay.mjs';

const sources = patchedSources();
const configPath = join(packageRoot, 'tsconfig.json');
const config = ts.getParsedCommandLineOfConfigFile(
  configPath,
  { noEmit: true },
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  },
);
const host = ts.createCompilerHost(config.options);
const readFile = host.readFile.bind(host);
host.readFile = (file) => sources.get(resolve(file)) ?? readFile(file);
const program = ts.createProgram(
  [...config.fileNames, join(packageRoot, 'diagnostics/notice-payloads/contract.ts')],
  config.options,
  host,
);
for (const [file, source] of sources) {
  if (program.getSourceFile(file)?.text !== source) throw Error('Unchecked diagnostic source: ' + file);
}
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (s) => s,
      getNewLine: () => '\n',
    }),
  );
  process.exitCode = 1;
}
