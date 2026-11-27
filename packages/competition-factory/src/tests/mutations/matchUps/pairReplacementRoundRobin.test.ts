import { tieFormats } from '@courthive/competition-catalogue';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

/**
 * A dual in a round robin sits in one of its groups: a structure inside the draw's container structure. Replacing a
 * member of a doubles pair there reads the draw as the replacement leaves it, with the dual's sides replaced in the
 * group that holds it and the other group as it was, and retires the pair nothing else uses.
 */
it('replaces a member of a doubles pair on a round-robin dual and retires the pair', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, eventType: TEAM, drawType: ROUND_ROBIN, tieFormat: structuredClone(tieFormats.COLLEGE_DEFAULT) },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    drawId,
    inContext: true,
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  const dual: any = matchUps.find(({ sides }) => sides?.every(({ participantId }) => participantId));
  const doubles = dual.tieMatchUps.find(({ matchUpType }) => matchUpType === DOUBLES);
  const { participant: team } = tournamentEngine.findParticipant({ participantId: dual.sides[0].participantId });
  const [first, second, third] = team.individualParticipantIds;

  for (const participantId of [first, second]) {
    expect(
      tournamentEngine.assignTieMatchUpParticipantId({ participantId, tieMatchUpId: doubles.matchUpId, drawId })
        .success,
    ).toEqual(true);
  }
  const pairs = () =>
    tournamentEngine.getParticipants({ participantFilters: { participantTypes: [PAIR] } }).participants;
  const pair = pairs().find(({ individualParticipantIds }) =>
    [first, second].every((id) => individualParticipantIds.includes(id)),
  );
  expect(pair).toBeDefined();

  const result: any = tournamentEngine.replaceTieMatchUpParticipantId({
    tieMatchUpId: doubles.matchUpId,
    existingParticipantId: first,
    newParticipantId: third,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.participantRemoved).toEqual(pair.participantId);

  const replaced = pairs().find(({ participantId }) => participantId === result.participantAdded);
  expect(replaced.individualParticipantIds.slice().sort()).toEqual([second, third].sort());
  expect(pairs().some(({ participantId }) => participantId === pair.participantId)).toEqual(false);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId: doubles.matchUpId });
  expect(matchUp.sides.some((side) => side.participantId === result.participantAdded)).toEqual(true);
});
