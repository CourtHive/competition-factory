import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { COMPASS, LOSER, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { AWAITING_RESULT } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A REFUSAL THE CASCADE COULD ONLY MEET AFTER IT HAD WRITTEN IS ASKED BEFORE THE FIRST WRITE.
 *
 * CA, 2026-10-22: an error leaves the record unchanged on a DIRECT call, and no mutation relies on rollback. Each case
 * here was an error returned over writes that had already landed; each is now refused before the first one. The calls
 * are direct (no `rollbackOnError`), so nothing puts anything back: the record is unchanged only if nothing was written.
 */

const set = { side1Score: 6, side2Score: 3, winningSide: 1 };
const outcome = { winningSide: 1, score: { sets: [set, { ...set, setNumber: 2 }] } };

const record = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);

function firstRoundMatchUpId(drawId: string) {
  return tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], roundNumbers: [1] }, inContext: true })
    .matchUps.find((matchUp) => matchUp.sides?.every((side) => side.participantId)).matchUpId;
}

it('notes that are not a string are refused before the score is written', () => {
  setSubscriptions({});
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    setState: true,
  });
  const matchUpId = firstRoundMatchUpId(drawId);
  const before = record();

  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, notes: 123 });
  expect(result.error?.code).toEqual(INVALID_VALUES.code);
  expect(record()).toEqual(before);

  // CONTROL: the same outcome with string notes is accepted, and writes both
  const accepted: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, notes: 'retired hurt' });
  expect(accepted.success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.winningSide).toEqual(1);
  expect(matchUp.notes).toEqual('retired hurt');
});

it('a malformed round link anywhere in the draw is refused before the first write', () => {
  setSubscriptions({});
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 7, drawType: COMPASS }],
    setState: true,
  });
  // East's first round is played on the well-formed draw
  for (const matchUp of tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { drawIds: [drawId], roundNumbers: [1] },
    inContext: true,
  }).matchUps) {
    if (matchUp.structureName !== 'East' || !matchUp.sides?.every((side) => side.participantId)) continue;
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome }).success).toEqual(true);
  }

  // then West's LOSER link (West round 1 -> South) loses its source round. Scoring East's second round directs nobody
  // into West, and the walk downstream of it (East -> North) never meets that link; a settle pass that asks every
  // matchUp of the draw did, after the score and its direction were written (`settleHeldExits`, measured on `dev`
  // 01ce40e544: the record changed and the call returned ERR_INVALID_VALUES)
  const { tournamentRecord } = tournamentEngine.getTournament();
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structureId = (name: string) =>
    drawDefinition.structures.find((structure) => structure.structureName === name).structureId;
  const eastId = structureId('East');
  const link = drawDefinition.links.find(
    (candidate) => candidate.linkType === LOSER && candidate.source.structureId === structureId('West'),
  );
  Reflect.deleteProperty(link.source, 'roundNumber');
  tournamentEngine.setState(tournamentRecord);

  const matchUpId = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], structureIds: [eastId], roundNumbers: [2] } })
    .matchUps.find((matchUp) => matchUp.roundPosition === 1).matchUpId;
  const before = record();

  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  expect(result.error?.code).toEqual(INVALID_VALUES.code);
  expect(record()).toEqual(before);
});

it("a TEAM dual's refusal leaves its lineUps and auto-calc flag unwritten", () => {
  setSubscriptions({});
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventType: TEAM_EVENT, drawProfiles: [{ drawSize: 4 }] }],
    setState: true,
  });
  const dual = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], matchUpTypes: [TEAM_MATCHUP] } })
    .matchUps.find((matchUp) => matchUp.readyToScore);
  const before = record();

  // AWAITING_RESULT is refused for a dual; the auto-calc flag and the sides' lineUps were written before it was asked
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: AWAITING_RESULT },
    matchUpId: dual.matchUpId,
    disableAutoCalc: true,
    drawId,
  });
  expect(result.error?.code).toEqual(INVALID_VALUES.code);
  expect(record()).toEqual(before);
});

it('a winner with no drawPositions to direct from is refused before the score is written', () => {
  setSubscriptions({});
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: false });
  // a record the factory did not produce: a first-round matchUp stored without its drawPositions
  const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (candidate) => candidate.roundNumber === 1 && candidate.roundPosition === 1,
  );
  Reflect.deleteProperty(matchUp, 'drawPositions');
  tournamentEngine.setState(tournamentRecord);
  const before = record();

  // with participants not required, nothing above the write refused it, and `directParticipants` did, after the score
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    policyDefinitions,
    outcome,
    drawId,
  });
  expect(result.error?.code).toEqual(MISSING_DRAW_POSITIONS.code);
  expect(record()).toEqual(before);
});
