import { runExitPropagationMatrixSlice } from '@Tests/testHarness/exitPropagation/exitMatrixSlice';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';

// constants and types
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

// Register here: a shared cached helper can retain an older setup-file seed registry.
registerTestSeedIdentity(
  'src/tests/mutations/exitPropagation/exitPropagationMatrix.curtisConsolation.test.ts',
  (title, ordinal) => ({
    name: 'src/tests/mutations/exitPropagation/exitPropagationMatrix.test.ts::' + title,
    ordinal,
  }),
);

runExitPropagationMatrixSlice(CURTIS_CONSOLATION);
