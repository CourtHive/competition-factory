import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.mts';

function replaceOnce(source: string, anchor: string, replacement: string): string {
  if (source.split(anchor).length !== 2) throw new Error(`Census anchor moved: ${anchor}`);
  return source.replace(anchor, replacement);
}

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'outcome-external-census',
        enforce: 'pre',
        transform(source: string, id: string) {
          const path = id.split('?')[0];
          const prefix = '/src/mutate/matchUps/outcome/';
          if (path.endsWith(prefix + 'plan.ts')) {
            const anchor = "return { ops: settled, shape: 'local', recordedResult: recorded.written };";
            return (
              replaceOnce(
                replaceOnce(
                  source,
                  'const recorded = args.recordWhole?.();',
                  "const recorded = measureRecording(() => args.recordWhole?.(), plan.ops ? (args.clockFree ? 'clock' : 'settle') : plan.abstain);",
                ),
                anchor,
                `
          const result = { ops: settled, shape: 'local' as const, recordedResult: recorded.written };
          markRecording(result.recordedResult, plan.ops ? (args.clockFree ? 'clock' : 'settle') : plan.abstain);
          return result;
        `,
              ) + "\nimport { markRecording, measureRecording } from '@Tests/testHarness/outcomeExternalCensus';\n"
            );
          }
          if (path.endsWith(prefix + 'decide.ts')) {
            const anchor = 'return { owned: outcome.recordedResult, recorded: true };';
            return (
              replaceOnce(
                source,
                anchor,
                `
          countRecording(outcome.recordedResult, args.drawDefinition?.drawType, route);
          ${anchor}
        `,
              ) + "\nimport { countRecording } from '@Tests/testHarness/outcomeExternalCensus';\n"
            );
          }
        },
      },
    ],
    test: {
      fsModuleCache: false,
      setupFiles: ['./src/tests/testHarness/outcomeExternalCensus.ts'],
    },
  }),
);
