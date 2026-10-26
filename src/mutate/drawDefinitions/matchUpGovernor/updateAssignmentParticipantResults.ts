import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { validMatchUps } from '@Validators/validMatchUp';

// constants
import type { PositionAssignment, TallyResult } from '@Types/tournamentTypes';
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

  writeAssignmentResults({ positionAssignments, participantResults });

  modifyDrawNotice({ drawDefinition });

  return {
    ...SUCCESS,
    participantResults,
    bracketComplete,
    report,
  };
}

/**
 * THE ONE WRITER of a group's tallies onto its position assignments, v1's (above) and the outcome pipeline v2's reducer
 * (`outcome/ops.ts`, `setParticipantResults`): a participant with results takes them and, untied, loses its subOrder; any
 * other assignment loses both.
 */
export function writeAssignmentResults({
  positionAssignments,
  participantResults,
}: {
  positionAssignments: PositionAssignment[];
  participantResults: { [participantId: string]: TallyResult };
}) {
  const participantIds = Object.keys(participantResults);
  positionAssignments.forEach((assignment) => {
    const { participantId } = assignment;
    // an assignment with no participant (a BYE, an empty seat) is never among the results: as `includes(undefined)`
    if (participantId && participantIds.includes(participantId)) {
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
}
