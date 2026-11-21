import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.mts';

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'outcome-external-index',
        enforce: 'pre',
        transform(source: string, id: string) {
          if (!id.split('?')[0].endsWith('/src/mutate/matchUps/outcome/apply.ts')) return;
          const anchor =
            '  const applied = applyOutcomeOps(drawDefinition, completedOps, undefined, { bindResultInputs: true });';
          if (source.split(anchor).length !== 2) throw new Error('Index experiment anchor moved');
          return (
            source.replace(
              anchor,
              `
  const compareIndex = prepareIndexExperiment(args, completedOps);
${anchor}
  if (!applied.error) compareIndex();
`,
            ) + "\nimport { prepareIndexExperiment } from '@Tests/testHarness/outcomeExternalIndex';\n"
          );
        },
      },
    ],
    test: {
      fsModuleCache: false,
    },
  }),
);
