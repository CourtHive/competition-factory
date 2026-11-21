import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.mts';

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'outcome-external-fixpoint',
        enforce: 'pre',
        transform(source: string, id: string) {
          if (!id.split('?')[0].endsWith('/src/mutate/matchUps/matchUpStatus/setMatchUpStatus.ts')) return;
          const anchor = '    const warnings = [\n      ...(settled.exhausted';
          if (source.split(anchor).length !== 2) throw new Error('Settlement anchor moved');
          return (
            source.replace(
              anchor,
              `
        if (!target.onCopy && getOutcomePipeline() === 'v1') {
          iterateSettlement(tournamentRecord ?? drawDefinition, () => {
            const map = getMatchUpsMap({ drawDefinition });
            return settleAfterWrite({
              doubleExitsBefore: new Set(map.drawMatchUps.filter((m) => isDoubleExit(m.matchUpStatus)).map((m) => m.matchUpId)),
              deciderSnapshotBefore: getDeciderSnapshot(drawDefinition),
              finalsBefore: getDeciderFinals(drawDefinition),
              params: { ...params, matchUpId },
              propagateExitStatus,
              matchUpsMap: map,
            });
          });
        }
${anchor}`,
            ) +
            `
import { iterateSettlement } from '@Tests/testHarness/outcomeExternalFixpoint';
import { getOutcomePipeline } from '@Global/state/globalState';
`
          );
        },
      },
    ],
    test: {
      fsModuleCache: false,
    },
  }),
);
