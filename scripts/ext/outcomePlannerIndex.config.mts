import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.mts';

const hooks = [
  [
    '/outcome/decide.ts',
    '  const observe = phases && outcome.ops',
    '  observePlan(outcome);\n  const observe = phases && outcome.ops',
    'observePlan',
  ],
  [
    '/outcome/view.ts',
    'const index = buildStructuralIndex({ tournamentRecord, drawDefinition, event, team: true });',
    'const index = indexForPlanner({ tournamentRecord, drawDefinition, event });',
    'indexForPlanner',
  ],
  [
    '/outcome/apply.ts',
    'if (applied.error) return { error: INVALID_VALUES, info: applied.error };',
    'if (applied.error) { invalidatePlannerIndex(); return { error: INVALID_VALUES, info: applied.error }; }\n  reducePlannerIndex(drawDefinition, completedOps);',
    'reducePlannerIndex, invalidatePlannerIndex',
  ],
  [
    '/matchUpStatus/setMatchUpStatus.ts',
    'return draws.replay(() => instants.replay(',
    'invalidatePlannerIndex();\n  return draws.replay(() => instants.replay(',
    'invalidatePlannerIndex',
  ],
  [
    '/parts/executeMethod.ts',
    'delete engine.success;',
    'beforePlannerMethod(methodName);\n  delete engine.success;',
    'beforePlannerMethod',
  ],
  [
    '/parts/operationState.ts',
    'export function restoreOperation({ records, tournamentId, notices, borrowed, clone }: OperationState): void {',
    'export function restoreOperation({ records, tournamentId, notices, borrowed, clone }: OperationState): void {\n  invalidatePlannerIndex();',
    'invalidatePlannerIndex',
  ],
  [
    '/parts/stateMethods.ts',
    'export function setState(records, deepCopyOption = true) {',
    'export function setState(records, deepCopyOption = true) {\n  invalidatePlannerIndex();',
    'invalidatePlannerIndex',
  ],
] as const;

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'outcome-planner-index-experiment',
        enforce: 'pre',
        transform(source: string, id: string) {
          const hook = hooks.find(([suffix]) => id.split('?')[0].endsWith(suffix));
          if (!hook) return;
          const [, anchor, replacement, imports] = hook;
          if (source.split(anchor).length !== 2) throw new Error('Planner experiment anchor moved in ' + id);
          return (
            source.replace(anchor, replacement) +
            '\nimport { ' +
            imports +
            " } from '@Tests/testHarness/outcomePlannerIndex';\n"
          );
        },
      },
    ],
    test: { fsModuleCache: false },
  }),
);
