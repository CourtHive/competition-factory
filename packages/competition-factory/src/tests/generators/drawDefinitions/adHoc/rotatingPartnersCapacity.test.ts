import { generateAdHocMatchUps } from '@Generators/drawDefinitions/drawTypes/adHoc/generateAdHocMatchUps';
import { drawMatic } from '@Generators/drawDefinitions/drawTypes/adHoc/drawMatic/drawMatic';
import { describe, expect, it } from 'vitest';

// constants and types
import type { DrawDefinition, Event, Participant, Tournament } from '@Types/tournamentTypes';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { AD_HOC, MAIN } from '@Constants/drawDefinitionConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

const STRUCTURE_ID = 'rotation-structure';

function overlappingPairs() {
  const individuals = Array.from({ length: 12 }, (_, i) => `individual-${i}`);
  const participants: Participant[] = [];
  for (let a = 0; a < individuals.length; a++) {
    for (let b = a + 1; b < individuals.length; b++) {
      participants.push({
        participantId: `pair-${a}-${b}`,
        participantType: PAIR,
        individualParticipantIds: [individuals[a], individuals[b]],
      });
    }
  }
  const drawDefinition: DrawDefinition = {
    drawId: 'rotating-draw',
    drawType: AD_HOC,
    entries: participants.map(({ participantId }) => ({ participantId, entryStatus: DIRECT_ACCEPTANCE })),
    structures: [{ structureId: STRUCTURE_ID, stage: MAIN, matchUps: [] }],
  };
  const event: Event = { eventId: 'rotation-event', eventType: DOUBLES };
  const tournamentRecord: Tournament = { tournamentId: 'rotation-tournament', participants };
  return { drawDefinition, event, tournamentRecord, structureId: STRUCTURE_ID };
}

describe('explicit AD_HOC pairing capacity', () => {
  it('generates three legal doubles matches from all 66 partnerships of twelve players', () => {
    const params = overlappingPairs();
    let result: any = drawMatic(params);
    expect(params.drawDefinition.entries).toHaveLength(66);
    expect(result.error).toBeUndefined();
    expect(result.matchUps).toHaveLength(3);
    const members = new Map(
      params.tournamentRecord.participants?.map((p) => [p.participantId, p.individualParticipantIds]),
    );
    const used = result.matchUps.flatMap((m) => m.sides.flatMap((s) => members.get(s.participantId)));
    expect(used).toHaveLength(12);
    expect(new Set(used).size).toBe(12);
  });

  it('refuses a count that disagrees with explicit output', () => {
    const params = overlappingPairs();
    let result: any = generateAdHocMatchUps({
      ...params,
      newRound: true,
      matchUpsCount: 33,
      participantIdPairings: [{ participantIds: ['pair-0-1', 'pair-2-3'] }],
    });
    expect(result.error).toBe(INVALID_VALUES);
    expect(result.context).toEqual({ matchUpsCount: 33, pairingsCount: 1 });
    const matching = generateAdHocMatchUps({
      ...params,
      matchUpsCount: 1,
      participantIdPairings: [{ participantIds: ['pair-0-1', 'pair-2-3'] }],
    });
    expect(matching.error).toBeUndefined();
    expect(matching.matchUpsCount).toBe(1);
  });

  it('retains the limit on actual explicit output', () => {
    const params = overlappingPairs();
    const participantIdPairings = Array.from({ length: 33 }, () => ({
      participantIds: ['pair-0-1', 'pair-2-3'] as [string, string],
    }));
    const result = generateAdHocMatchUps({ ...params, newRound: true, participantIdPairings });
    expect(result.error).toBe(INVALID_VALUES);
    expect(result.info).toBe('matchUpsCount must be less than 33');
  });

  it('retains inferred-count limits when there are no explicit pairings', () => {
    const result = generateAdHocMatchUps({ ...overlappingPairs(), newRound: true });
    expect(result.error).toBe(INVALID_VALUES);
    expect(result.info).toBe('matchUpsCount must be less than 33');
  });

  it('preserves empty explicit pairing behavior for an ordinary-sized pool', () => {
    const params = overlappingPairs();
    params.drawDefinition.entries = params.drawDefinition.entries?.slice(0, 4);
    const result = generateAdHocMatchUps({ ...params, newRound: true, participantIdPairings: [] });
    expect(result.error).toBeUndefined();
    expect(result.matchUps).toEqual([]);
    expect(result.matchUpsCount).toBe(0);
  });
});

it.each([
  { entries: 0, pairings: 2, newRound: true },
  { entries: 4, pairings: 3, newRound: true },
  { entries: 4, pairings: 3, newRound: false },
  { entries: 8, pairings: 4, newRound: true },
])('accepts explicit output independent of entry-count inference: %j', ({ entries, pairings, newRound }) => {
  const params = overlappingPairs();
  params.drawDefinition.entries = params.drawDefinition.entries?.slice(0, entries);
  const participantIdPairings = Array.from({ length: pairings }, () => ({
    participantIds: ['pair-0-1', 'pair-2-3'] as [string, string],
  }));
  const result = generateAdHocMatchUps({ ...params, participantIdPairings, newRound });
  expect(result.error).toBeUndefined();
  expect(result.matchUpsCount).toBe(pairings);
});
