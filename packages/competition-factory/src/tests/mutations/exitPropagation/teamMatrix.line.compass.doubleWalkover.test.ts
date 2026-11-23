import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';

// constants and types
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

// Tier selection precedes this status partition; all original cells and seed identities are preserved.
// Register here: a shared cached helper can retain an older setup-file seed registry.
registerTestSeedIdentity(
  'src/tests/mutations/exitPropagation/teamMatrix.line.compass.doubleWalkover.test.ts',
  (title, ordinal) => ({
    name: 'src/tests/mutations/exitPropagation/teamMatrix.line.compass.test.ts::' + title,
    ordinal,
  }),
);

runTeamMatrixSlice('line', COMPASS, {
  exitStatus: DOUBLE_WALKOVER,
});
