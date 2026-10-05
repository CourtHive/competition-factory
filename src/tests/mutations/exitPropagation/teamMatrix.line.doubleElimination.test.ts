import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

// One slice of the TEAM exit-propagation matrix (see teamMatrix.test.ts): the line arm, DOUBLE_ELIMINATION.
runTeamMatrixSlice('line', DOUBLE_ELIMINATION);
