import { runTeamMatrixSlice } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

// One slice of the TEAM exit-propagation matrix (see teamMatrix.test.ts): the line arm, FIRST_MATCH_LOSER_CONSOLATION.
runTeamMatrixSlice('line', FIRST_MATCH_LOSER_CONSOLATION);
