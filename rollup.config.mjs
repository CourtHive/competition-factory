import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import fs from 'fs-extra';
import path from 'path';

const tsConfig = JSON.parse(await fs.readFile(new URL('./tsconfig.base.json', import.meta.url)));
const srcIndex = 'src/index.ts';
// `tods-competition-factory/score-entry-state`: a headless score-entry state engine with its own entry point, so a
// consumer that needs it never loads the root barrel, an engine or global engine state.
const scoreEntryStateIndex = 'src/scoreEntryState/index.ts';

const basePath = fs.realpathSync(process.cwd());
const distPath = path.resolve(basePath, 'dist');

// A circular import among the factory's own modules fails the build. Rollup only warns about one, and four such
// warnings scrolled past every build for weeks before anyone read them (2026-10-30).
const onwarn = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY' && !warning.ids?.some((id) => id.includes('node_modules'))) {
    throw new Error(`circular dependency: ${warning.ids.map((id) => path.relative(basePath, id)).join(' -> ')}`);
  }
  warn(warning);
};

const buildOutput = ({ packageName = 'tods-competition-factory', minified, folder, format }) => {
  const development = format === 'cjs' && !minified ? 'development.' : '';
  const subFolder = folder ? `/${folder}` : '';
  const file = `${distPath}${subFolder}/${packageName}.${development}${format}.js`;

  const base = {
    name: packageName,
    exports: 'named',
    sourcemap: true,
    esModule: true,
    freeze: false,
    globals: {},
    format,
    file,
  };

  if (format === 'cjs' && minified) writeCjsIndex({ subFolder, packageName });

  return minified
    ? [
        {
          ...base,
          file: `${distPath}${subFolder}/${packageName}.production.${format}.min.js`,
          plugins: [terser()],
        },
      ]
    : [base];
};

function writeCjsIndex({ subFolder, packageName }) {
  const fileImportRoot = `module.exports = require('./${packageName}`;
  const body = `'use strict';
if (process.env.NODE_ENV === 'production') {
  ${fileImportRoot}.production.cjs.min.js')
} else {
  ${fileImportRoot}.development.cjs.js')
}
`;
  return fs.outputFile(`${distPath}${subFolder}/index.js`, body);
}

function createExport({ input, folder, packageName, cjs, esm }) {
  const output = [];
  if (esm) {
    const esmBuilds = [...buildOutput({ format: 'esm', minified: true, folder, packageName })];
    output.push(...esmBuilds);
  }
  if (cjs) {
    const cjsBuilds = [
      ...buildOutput({ format: 'cjs', minified: false, folder, packageName }),
      ...buildOutput({ format: 'cjs', minified: true, folder, packageName }),
    ];
    output.push(...cjsBuilds);
  }
  return {
    plugins: [
      typescript({ tsconfig: './tsconfig.json', declaration: false, sourceMap: true }),
      babel({ babelHelpers: 'bundled' }),
      nodeResolve(),
      commonjs(),
      json(),
    ],

    onwarn,
    input,
    output,
  };
}

const cjsExports = [
  { input: srcIndex, cjs: true },
  // its own bundle, not a re-export of the root's: `require('tods-competition-factory/score-entry-state')` loads the
  // score state and the scoring rules it reads, and nothing else
  { input: scoreEntryStateIndex, cjs: true, folder: 'score-entry-state', packageName: 'score-entry-state' },
].map(createExport);

// Tree-shakeable ESM build: preserveModules keeps one output file per source
// module (mirroring src/ under dist/esm/) instead of a single flattened
// bundle, so downstream bundlers can eliminate everything a consumer does not
// import. Paired with `"sideEffects": false` in package.json. This is the
// artifact `exports.import` / `module` resolve to. Sourcemaps are omitted here
// (per-module maps would add ~1200 files to the tarball for little value —
// consumers generate their own maps when they re-bundle).
const esmExport = [
  {
    // the score-entry-state entry is a second input to the same module tree: `dist/esm/scoreEntryState/index.mjs`
    // imports the narrow scoring modules it reads, so a bundler resolving the subpath sees only that graph
    input: [srcIndex, scoreEntryStateIndex],
    onwarn,
    plugins: [
      typescript({ tsconfig: './tsconfig.json', declaration: false, sourceMap: false, outDir: `${distPath}/esm` }),
      nodeResolve(),
      commonjs(),
      json(),
    ],
    output: {
      dir: `${distPath}/esm`,
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].mjs',
      exports: 'named',
      sourcemap: false,
    },
  },
];

const engineTypes = [
  {
    input: srcIndex,
    onwarn,
    plugins: [
      dts({
        compilerOptions: {
          paths: tsConfig.compilerOptions.paths,
        },
      }),
    ],
    output: {
      file: `${distPath}/tods-competition-factory.d.ts`,
      format: 'es',
    },
  },
];

const scoreEntryStateTypes = [
  {
    input: scoreEntryStateIndex,
    onwarn,
    plugins: [dts({ compilerOptions: { paths: tsConfig.compilerOptions.paths } })],
    output: { file: `${distPath}/score-entry-state.d.ts`, format: 'es' },
  },
];

export default [...cjsExports, ...esmExport, ...engineTypes, ...scoreEntryStateTypes];
