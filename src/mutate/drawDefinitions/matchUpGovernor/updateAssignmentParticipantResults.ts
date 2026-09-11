import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { validMatchUps } from '@Validators/validMatchUp';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUB_ORDER, TALLY } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function updateAssignmentParticipantResults({
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  matchUpFormat,
  matchUps,
  event,
}) {
  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES };
  if (!positionAssignments) return { error: INVALID_VALUES };

  const { policyDefinitions } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_ROUND_ROBIN_TALLY],
    tournamentRecord,
    drawDefinition,
    event,
  });
  const { subOrderMap } = createSubOrderMap({ positionAssignments });

  const result = matchUps.length
    ? tallyParticipantResults({
        policyDefinitions,
        matchUpFormat,
        subOrderMap,
        matchUps,
      })
    : undefined;

  if (result?.error) return result;

  const { participantResults = {}, bracketComplete, report } = result ?? {};

  const participantIds = Object.keys(participantResults);

  positionAssignments.forEach((assignment) => {
    const { participantId } = assignment;
    if (participantIds.includes(participantId)) {
      setFirstClassOrExtension({
        value: participantResults[participantId],
        element: assignment,
        attribute: 'tally',
        name: TALLY,
      });
      if (!participantResults[participantId].ties) {
        setFirstClassOrExtension({
          element: assignment,
          attribute: 'subOrder',
          name: SUB_ORDER,
          value: undefined,
        });
      }
    } else {
      setFirstClassOrExtension({
        element: assignment,
        attribute: 'tally',
        name: TALLY,
        value: undefined,
      });
      setFirstClassOrExtension({
        element: assignment,
        attribute: 'subOrder',
        name: SUB_ORDER,
        value: undefined,
      });
    }
  });

  modifyDrawNotice({ drawDefinition });

  return {
    ...SUCCESS,
    participantResults,
    bracketComplete,
    report,
  };
}
