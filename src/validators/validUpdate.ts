import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';

// constants
import { completedMatchUpStatuses, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

export function validUpdate({ matchUp, updateInProgressMatchUps }) {
  return (
    !matchUp.winningSide &&
    ![completedMatchUpStatuses].includes(matchUp.matchUpStatus) &&
    (updateInProgressMatchUps || (matchUp.matchUpStatus !== IN_PROGRESS && !checkScoreHasValue(matchUp)))
  );
}
