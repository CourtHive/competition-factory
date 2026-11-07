import methodKinds from '@Tests/testHarness/queryPurity/methodKinds.json';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * EVERY QUERY AND GENERATOR, DRIVEN ONCE THROUGH AN ENGINE (CA 2026-11-08). The query-purity harness checks every engine
 * call the suite makes, so a query that no test drives through an engine is never checked: `addGoesTo` wrote stored
 * matchUps, with no notice, and passed. Each method here runs in its own test, from a fresh state, against a bag of the
 * record's own ids; the suite-wide harness (testHarness/queryPurity.ts) fails a test whose call wrote.
 *
 * A legacy record (stored progression edges stripped) exercises writers that only write when something is missing.
 */

const kinds: Record<string, string> = methodKinds as any;
const MUTATION_VERBS =
  /^(add|set|modify|remove|delete|assign|attach|apply|update|reset|clear|replace|swap|move|create|insert|toggle|enable|disable|promote|withdraw)[A-Z]/;

function buildRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, drawType: SINGLE_ELIMINATION, completionGoal: 3 },
      { drawSize: 4, drawType: ROUND_ROBIN, completionGoal: 2 },
      { drawSize: 4, eventType: TEAM_EVENT },
    ],
    venueProfiles: [{ courtsCount: 2 }],
    autoSchedule: true,
  });
  return tournamentRecord;
}

function stripEdges(record) {
  const legacy = makeDeepCopy(record, false, true);
  for (const event of legacy.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? [])
        for (const holder of [structure, ...(structure.structures ?? [])])
          for (const matchUp of holder.matchUps ?? []) {
            delete matchUp.winnerMatchUpId;
            delete matchUp.loserMatchUpId;
          }
  return legacy;
}

function idsOf(record) {
  const event = record.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const structure = drawDefinition.structures[0];
  const matchUp = structure.matchUps[0];
  const venue = record.venues?.[0];
  return {
    tournamentId: record.tournamentId,
    eventId: event.eventId,
    drawId: drawDefinition.drawId,
    structureId: structure.structureId,
    matchUpId: matchUp.matchUpId,
    participantId: record.participants[0].participantId,
    venueId: venue?.venueId,
    courtId: venue?.courts?.[0]?.courtId,
    scheduledDate: record.startDate,
    matchUpFormat: 'SET3-S:6/TB7',
  };
}

const record = buildRecord();
const fixtures = { generated: record, legacy: stripEdges(record) };
const swept = Object.keys(kinds).filter(
  (name) => ['query', 'generate'].includes(kinds[name]) && typeof (tournamentEngine as any)[name] === 'function',
);

describe.each(Object.entries(fixtures))('%s record: every query and generator, through the engine', (_, fixture) => {
  it.each(swept)('%s', (methodName) => {
    tournamentEngine.setState(makeDeepCopy(fixture, false, true));
    const params = idsOf(fixture);
    try {
      (tournamentEngine as any)[methodName]({ ...params });
    } catch {
      // a refusal by throwing is not the question here; a write is, and the harness reports it
    }
  });
});

/**
 * Queries and generators whose names begin with a mutation verb. A RATCHET: a new one fails, and an entry leaves when
 * its method is renamed, reclassified or removed. Each disposition awaits CA's ruling (role inventory, 2026-11-08).
 */
const MISNAMED: Record<string, string> = {
  addFinishingRounds:
    'a draw-generation helper that writes finishingRound / finishingPositionRange onto the matchUps it is given',
  addGoesTo: 'a writer (knownWriters.ts); retired at 8.0.0',
  applyDerivedRankings:
    'pure: returns a new, renumbered list; named for what it does to its input, takes values (a tool)',
  createFollowByEvaluator: 'builds a new evaluator object: construction, not mutation (an availability tool)',
  createTournamentRecord: 'builds a new record, stored nowhere: generation, not mutation',
};

describe('names', () => {
  it('no new query or generator is named with a mutation verb', () => {
    const misnamed = Object.keys(kinds)
      .filter((name) => ['query', 'generate'].includes(kinds[name]) && MUTATION_VERBS.test(name))
      .sort();
    expect(misnamed).toEqual(Object.keys(MISNAMED).sort());
  });

  it('sweeps a meaningful share of the queries and generators', () => {
    const total = Object.values(kinds).filter((kind) => ['query', 'generate'].includes(kind)).length;
    expect(swept.length).toBeGreaterThan(total * 0.8);
  });
});
