import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, SINGLE_ELIMINATION, WINNER, LOSER } from '@Constants/drawDefinitionConstants';
import { MATCHUP_STATUS_OUT_OF_SCOPE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DEAD_RUBBER } from '@Constants/matchUpStatusConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * DEAD_RUBBER IS SCOPED (CA, 2026-10-13, option (a) of TASKS.md § "`DEAD_RUBBER` is scoped by convention"): it marks a
 * rubber of a decided team tie, or a DOUBLE_ELIMINATION Decider that is not needed — the factory writes the second
 * itself (`reconcileDecider`). Anywhere else it is refused as MATCHUP_STATUS_OUT_OF_SCOPE.
 */

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

function setDeadRubber({ drawId, matchUpId }: { drawId: string; matchUpId: string }) {
  return tournamentEngine.setMatchUpStatus({ outcome: { matchUpStatus: DEAD_RUBBER }, matchUpId, drawId });
}

describe('DEAD_RUBBER scope', () => {
  it('is accepted on a rubber of a team tie', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [rubber],
    } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [SINGLES] } });
    expect(rubber.collectionId).toBeDefined();

    let result: any = setDeadRubber({ drawId, matchUpId: rubber.matchUpId });
    expect(result.success).toEqual(true);
    result = tournamentEngine.findMatchUp({ drawId, matchUpId: rubber.matchUpId });
    expect(result.matchUp.matchUpStatus).toEqual(DEAD_RUBBER);
    // a rubber's DEAD_RUBBER is a result, stamped like an ABANDONED line: only a decider's is not (CA, 2026-10-24)
    expect(result.matchUp.schedule?.scoredTime).toBeDefined();
  });

  it('is refused on the TEAM dual itself outside a Decider', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [dual],
    } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } });

    const result: any = setDeadRubber({ drawId, matchUpId: dual.matchUpId });
    expect(result.error).toEqual(MATCHUP_STATUS_OUT_OF_SCOPE);
  });

  it('is refused on a singles matchUp of an elimination draw, and the matchUp is untouched', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }] });
    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps } = tournamentEngine.drawMatchUps({ drawId });
    const { matchUpId, matchUpStatus } = upcomingMatchUps[0];

    let result: any = setDeadRubber({ drawId, matchUpId });
    expect(result.error).toEqual(MATCHUP_STATUS_OUT_OF_SCOPE);
    result = tournamentEngine.findMatchUp({ drawId, matchUpId });
    expect(result.matchUp.matchUpStatus).toEqual(matchUpStatus);
  });

  it('is accepted on a DOUBLE_ELIMINATION Decider, and refused in its Main structure', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: DOUBLE_ELIMINATION }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    // the Decider is found by its links, as the factory finds it: the structure fed by both the WINNER and the
    // LOSER link of another structure's round
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const links = drawDefinition.links;
    const deciderStructureId = links.find(
      (winner) =>
        winner.linkType === WINNER &&
        links.some(
          (loser) =>
            loser.linkType === LOSER &&
            loser.source.structureId === winner.source.structureId &&
            loser.source.roundNumber === winner.source.roundNumber &&
            loser.target.structureId === winner.target.structureId,
        ),
    )?.target.structureId;
    expect(deciderStructureId).toBeDefined();

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const decider = matchUps.find((matchUp) => matchUp.structureId === deciderStructureId);
    const mainMatchUp = matchUps.find(
      (matchUp) => matchUp.structureId !== deciderStructureId && matchUp.roundNumber === 1,
    );

    let result: any = setDeadRubber({ drawId, matchUpId: mainMatchUp.matchUpId });
    expect(result.error).toEqual(MATCHUP_STATUS_OUT_OF_SCOPE);

    result = setDeadRubber({ drawId, matchUpId: decider.matchUpId });
    expect(result.success).toEqual(true);
    result = tournamentEngine.findMatchUp({ drawId, matchUpId: decider.matchUpId });
    expect(result.matchUp.matchUpStatus).toEqual(DEAD_RUBBER);
  });

  it('the checker refuses only on context it was given', () => {
    const matchUpStatus = DEAD_RUBBER;
    // no matchUp context at all: permissive, as for an absent drawType
    expect(getMatchUpStatusScopeViolation({ matchUpStatus })).toBeUndefined();
    // a tie rubber
    expect(getMatchUpStatusScopeViolation({ matchUpStatus, isTieMatchUp: true })).toBeUndefined();
    // not a rubber, Decider unknown: the Decider allowance is not ruled out, so nothing is refused
    expect(getMatchUpStatusScopeViolation({ matchUpStatus, isTieMatchUp: false })).toBeUndefined();
    // a Decider
    expect(
      getMatchUpStatusScopeViolation({ matchUpStatus, isTieMatchUp: false, isDeciderMatchUp: true }),
    ).toBeUndefined();
    // neither
    expect(getMatchUpStatusScopeViolation({ matchUpStatus, isTieMatchUp: false, isDeciderMatchUp: false })).toMatch(
      /a tie matchUp or a Decider/,
    );
  });
});
