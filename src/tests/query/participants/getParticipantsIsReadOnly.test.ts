import { setDeepCopy } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { afterEach, expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * P54: getParticipants({ withMatchUps | withRankingProfile }) is a QUERY. It used to repair the STORED draw when the draw
 * did not store its edges (getMatchUpDependencies, its result discarded), writing winnerMatchUpId, loserMatchUpId and a
 * widened finishingPositionRange onto stored matchUps. Measured 2026-10-15 on Button's ingest corpus: it wrote on 40 of
 * 414 records with draws, every one converted outside the factory. It now reads such a draw from a copy carrying the
 * edges: the record is never written, and what it returns is what the repair returned.
 */
const deepFreeze = (value: any) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

const stripEdges = (tournamentRecord: any) => {
  for (const event of tournamentRecord.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? [])
        for (const matchUp of structure.matchUps ?? []) {
          delete matchUp.winnerMatchUpId;
          delete matchUp.loserMatchUpId;
        }
  return tournamentRecord;
};

const generate = () =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 },
      { drawType: ROUND_ROBIN, drawSize: 8 },
    ],
    completeAllMatchUps: true,
  }).tournamentRecord;

afterEach(() => {
  setDeepCopy(true, {});
});

it.each([{ withMatchUps: true }, { withRankingProfile: true }])(
  'never writes to a record whose draws do not store their edges: %o',
  (args) => {
    const tournamentRecord = deepFreeze(stripEdges(generate()));
    const before = JSON.stringify(tournamentRecord);

    // borrowed: the engine holds the frozen record itself, so any write throws
    setDeepCopy(false, {});
    tournamentEngine.setState(tournamentRecord, false);
    const result: any = tournamentEngine.getParticipants(args);

    expect(result.error).toBeUndefined();
    expect(result.participants.length).toBeGreaterThan(0);
    expect(JSON.stringify(tournamentRecord)).toEqual(before);
  },
);

it('returns what a record that stores its edges returns', () => {
  const intact = generate();
  const stripped = stripEdges(structuredClone(intact));
  const args = { withMatchUps: true, withRankingProfile: true };

  tournamentEngine.setState(intact);
  const fromStored: any = tournamentEngine.getParticipants(args);
  tournamentEngine.setState(stripped);
  const fromDerived: any = tournamentEngine.getParticipants(args);

  const edgesOf = (result: any) =>
    Object.values(result.mappedMatchUps).map(
      ({ matchUpId, winnerMatchUpId, loserMatchUpId, finishingPositionRange }: any) => ({
        finishingPositionRange,
        winnerMatchUpId,
        loserMatchUpId,
        matchUpId,
      }),
    );
  expect(edgesOf(fromDerived)).toEqual(edgesOf(fromStored));
  // the derived edges are on what the query returned, not on what it read
  expect(edgesOf(fromDerived).filter(({ winnerMatchUpId }) => winnerMatchUpId).length).toBeGreaterThan(0);
  const storedMatchUps = tournamentEngine
    .getTournament()
    .tournamentRecord.events.flatMap((event: any) => event.drawDefinitions)
    .flatMap((drawDefinition: any) => drawDefinition.structures)
    .flatMap((structure: any) => structure.matchUps ?? []);
  expect(storedMatchUps.filter((matchUp: any) => matchUp.winnerMatchUpId).length).toEqual(0);

  const participantsOf = (result: any) =>
    result.participants.map(({ participantId, draws, matchUps }: any) => ({ participantId, draws, matchUps }));
  expect(participantsOf(fromDerived)).toEqual(participantsOf(fromStored));
});

// The repair skipped a draw holding a matchUp without a roundPosition, and a TEAM draw's tie matchUps carry none: its
// edges were never derived for the query. Reading from a copy keeps that, and still writes nothing.
it('leaves a TEAM draw that does not store its edges as the repair left it', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO, drawType: FEED_IN_CHAMPIONSHIP }],
    completeAllMatchUps: true,
  });
  const record = deepFreeze(stripEdges(tournamentRecord));
  const before = JSON.stringify(record);

  setDeepCopy(false, {});
  tournamentEngine.setState(record, false);
  const result: any = tournamentEngine.getParticipants({ withMatchUps: true });

  expect(result.error).toBeUndefined();
  expect(JSON.stringify(record)).toEqual(before);
  const edged = Object.values(result.mappedMatchUps).filter((matchUp: any) => matchUp.winnerMatchUpId);
  expect(edged.length).toEqual(0);
});
