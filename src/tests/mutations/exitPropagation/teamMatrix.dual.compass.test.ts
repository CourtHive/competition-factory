import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { COMPASS } from '@Constants/drawDefinitionConstants';

// One slice of the TEAM exit-propagation matrix (see teamMatrix.test.ts): the dual arm, COMPASS.
runTeamMatrixSlice('dual', COMPASS);
