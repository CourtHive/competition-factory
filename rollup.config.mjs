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

const basePath = fs.realpathSync(process.cwd());
const distPath = path.resolve(basePath, 'dist');

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

    input,
    output,
  };
}

const cjsExports = [{ input: srcIndex, cjs: true }].map(createExport);

const engineTypes = [
  {
    input: srcIndex,
    plugins: [
      dts({
        compilerOptions: {
          baseUrl: tsConfig.compilerOptions.baseUrl,
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

export default [...cjsExports, ...engineTypes];
