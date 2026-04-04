import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';
import { getIndividualParticipantIds } from '../../../../query/matchUp/getIndividualParticipantIds';
import { overlap } from '@Tools/arrays';

import { TOTAL } from '@Constants/scheduleConstants';

export function modifyParticipantMatchUpsCount({
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  matchUp,
  value,
}) {
  const { matchUpType } = matchUp;

  // individualParticipantIds represent those participants already present
  const { individualParticipantIds } = getIndividualParticipantIds(matchUp);
  // potentialParticipantIds are those who could progress to this matchUp
  const potentialParticipantIds = matchUpPotentialParticipantIds[matchUp.matchUpId] ?? [];

  // filteredPotentials exclude potentials if any of the participantIds
  // are present in individualParticipantIds which ensures that source match losers
  // do not get considered when incrementing or decrementing matchUp counters
  const filteredPotentials = potentialParticipantIds
    .filter((potentials) => !overlap(potentials, individualParticipantIds))
    .flat();
  const consideredParticipantIds = [...individualParticipantIds, ...filteredPotentials];

  consideredParticipantIds.forEach((participantId) => {
    checkParticipantProfileInitialization({
      individualParticipantProfiles,
      participantId,
    });

    if (!individualParticipantProfiles[participantId].potentialCounted[matchUp.drawId]) {
      const counters = individualParticipantProfiles[participantId].counters;
      if (counters[matchUpType]) counters[matchUpType] += value;
      else if (value > 0) counters[matchUpType] = value;
      if (counters[TOTAL]) counters[TOTAL] += value;
      else if (value > 0) counters[TOTAL] = value;
      if (filteredPotentials.includes(participantId)) {
        individualParticipantProfiles[participantId].potentialCounted[matchUp.drawId] = true;
      }
    }
  });
}
