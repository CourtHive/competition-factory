import { getDrawInconsistencies, DROPPED_PROGRESSION } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

// Corpus sweep — the primary false-positive guard for the eligibility-gated DROPPED_PROGRESSION.
// Includes consolation-bearing draw types AND a partial FMLC (byes) so round-2 losers who DID have a
// round-1 bye (eligible) and those who did NOT (ineligible) are both exercised. Zero findings required.
test.for([
  [FIRST_MATCH_LOSER_CONSOLATION, 16, undefined],
  [FIRST_MATCH_LOSER_CONSOLATION, 32, undefined],
  [FIRST_MATCH_LOSER_CONSOLATION, 32, 24], // 8 first-round byes → eligible round-2 losers exist
  [COMPASS, 32, undefined],
  [CURTIS_CONSOLATION, 32, undefined],
  [OLYMPIC, 32, undefined],
  [DOUBLE_ELIMINATION, 16, undefined],
])('corpus: completed %s size %d (participants %s) reports no DROPPED_PROGRESSION', ([drawType, drawSize, count]) => {
  setSubscriptions({});
  const drawId = `prog-${drawType}-${drawSize}-${count ?? 'full'}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType, participantsCount: count }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(result.inconsistencies.filter((i) => i.issueType === DROPPED_PROGRESSION)).toEqual([]);
});

test('detects a dropped progression when an eligible (round-1) loser is missing from consolation', () => {
  setSubscriptions({});
  const drawId = 'prog-drop';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'pd' }],
    completeAllMatchUps: true,
    setState: true,
  });
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).valid).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures[0].structureId;
  const r1 = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((m) => m.structureId === mainStructureId && m.roundNumber === 1 && m.roundPosition === 1);
  const loserId = r1.sides.find((s) => s.sideNumber === (r1.winningSide === 1 ? 2 : 1)).participantId;

  // erase the round-1 loser (a genuine first-match loser, so eligible) from the consolation structure
  const consolation = drawDefinition.structures[1];
  delete consolation.positionAssignments.find((a) => a.participantId === loserId).participantId;

  const result: any = getDrawInconsistencies({ drawDefinition });
  const dropped = result.inconsistencies.find(
    (i) => i.issueType === DROPPED_PROGRESSION && i.participantId === loserId,
  );
  expect(dropped).toBeTruthy();
  expect(dropped.matchUpId).toEqual(r1.matchUpId);
  expect(dropped.severity).toEqual('error');
  expect(dropped.scope).toEqual('DRAW');
});

test('an INELIGIBLE round-2 loser (won round 1) is not expected in consolation — no false positive', () => {
  // The exact case that broke the naive check: in a full FMLC draw a round-2 (semifinal) loser won
  // their round-1 match, so they are NOT fed to consolation. The eligibility predicate must exclude
  // them — they are legitimately absent, and DROPPED_PROGRESSION must stay silent.
  setSubscriptions({});
  const drawId = 'prog-ineligible';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'pi' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const mainStructureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
  const semifinalLosers = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.filter((m) => m.structureId === mainStructureId && m.roundNumber === 2 && m.winningSide)
    .map((m) => m.sides.find((s) => s.sideNumber === (m.winningSide === 1 ? 2 : 1)).participantId);
  expect(semifinalLosers.length).toBeGreaterThan(0);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolationParticipantIds = new Set(
    drawDefinition.structures[1].positionAssignments.map((a) => a.participantId).filter(Boolean),
  );
  // ineligible semifinal losers are legitimately absent from consolation...
  semifinalLosers.forEach((id) => expect(consolationParticipantIds.has(id)).toEqual(false));
  // ...and that absence must NOT be reported
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(result.inconsistencies.filter((i) => i.issueType === DROPPED_PROGRESSION)).toEqual([]);
  expect(result.valid).toEqual(true);
});
