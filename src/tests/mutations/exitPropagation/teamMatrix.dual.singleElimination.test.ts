import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

// One slice of the TEAM exit-propagation matrix (see teamMatrix.test.ts): the dual arm, SINGLE_ELIMINATION.
runTeamMatrixSlice('dual', SINGLE_ELIMINATION);
