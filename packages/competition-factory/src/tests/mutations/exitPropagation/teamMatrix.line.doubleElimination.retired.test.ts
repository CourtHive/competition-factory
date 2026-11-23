import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';

// constants and types
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { RETIRED } from '@Constants/matchUpStatusConstants';

// Tier selection precedes this status partition; all original cells and seed identities are preserved.
// Register here: a shared cached helper can retain an older setup-file seed registry.
registerTestSeedIdentity(
  'src/tests/mutations/exitPropagation/teamMatrix.line.doubleElimination.retired.test.ts',
  (title, ordinal) => ({
    name: 'src/tests/mutations/exitPropagation/teamMatrix.line.doubleElimination.test.ts::' + title,
    ordinal,
  }),
);

runTeamMatrixSlice('line', DOUBLE_ELIMINATION, {
  exitStatus: RETIRED,
});
