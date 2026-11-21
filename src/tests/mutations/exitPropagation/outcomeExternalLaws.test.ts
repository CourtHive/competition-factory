import { clearOutcome, stableHash } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getTournamentRecord, setSchemaWriteMode } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { generatePatch } from '@Tools/jsonPatch';
import { setClock } from '@Tools/clock';
import { expect, it } from 'vitest';
// constants and types
import { ABANDONED, CANCELLED, DOUBLE_DEFAULT, INCOMPLETE, SUSPENDED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BRIDGE, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
const drawId = 'external-laws';
const clock = () => new Date('2026-11-20T10:00:00.000Z');
const stored = () => getTournamentRecord(tournamentEngine.getTournamentId());

function setup(qualifying: boolean, drawSize = 8): { record: Tournament; draw: DrawDefinition } {
  let result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize,
        participantsCount: qualifying ? 12 : drawSize,
        drawType: qualifying ? FIRST_MATCH_LOSER_CONSOLATION : SINGLE_ELIMINATION,
        ...(qualifying
          ? { qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }] }
          : {}),
      },
    ],
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    nonRandom: 93400,
    setState: true,
  });
  const record: Tournament = structuredClone(result.tournamentRecord);
  const draw = record.events?.[0]?.drawDefinitions?.[0];
  if (!draw) throw new Error('Fixture draw did not generate');
  return { record, draw };
}

function write(matchUpId: string, outcome: typeof clearOutcome | { winningSide: number }) {
  let result: any = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
  expect(result).toHaveProperty('success', true);
}

it.skipIf(process.env.OUTCOME_EXTERNAL_PROPERTIES !== '1')(
  'repeats the same seed and commutes outcomes in independent branches',
  () => {
    setClock(clock);
    try {
      const { record, draw } = setup(false);
      const { draw: duplicate } = setup(false);
      expect(stableHash(duplicate)).toEqual(stableHash(draw));
      const firstRound = draw.structures
        ?.find((structure) => structure.stage === MAIN)
        ?.matchUps?.filter((matchUp) => matchUp.roundNumber === 1);
      const left = firstRound?.find((matchUp) => matchUp.roundPosition === 1)?.matchUpId;
      const right = firstRound?.find((matchUp) => matchUp.roundPosition === 3)?.matchUpId;
      if (!left || !right) throw new Error('Independent first-round matches not found');
      const win = { winningSide: 1 };
      tournamentEngine.setState(structuredClone(record));
      write(left, win);
      write(right, win);
      const forward = stableHash(stored());
      tournamentEngine.setState(structuredClone(record));
      write(right, win);
      write(left, win);
      const patch = generatePatch(JSON.parse(forward), JSON.parse(stableHash(stored())));
      expect(patch).toEqual([]);
    } finally {
      setClock();
    }
  },
);

it.skipIf(process.env.OUTCOME_EXTERNAL_PROPERTIES !== '1')(
  'restores the whole record when a bare winner is cleared and re-entered',
  () => {
    setClock(clock);
    try {
      const { draw } = setup(false, 2);
      const matchUpId = draw.structures?.[0]?.matchUps?.[0]?.matchUpId;
      if (!matchUpId) throw new Error('Two-position fixture has no matchUp');
      write(matchUpId, { winningSide: 1 });
      const before = stableHash(stored());
      write(matchUpId, clearOutcome);
      write(matchUpId, { winningSide: 1 });
      const patch = generatePatch(JSON.parse(before), JSON.parse(stableHash(stored())));
      expect(patch).toEqual([]);
    } finally {
      setClock();
    }
  },
);

it.skipIf(process.env.OUTCOME_EXTERNAL_PROPERTIES !== '1').each([NATIVE, BRIDGE, LEGACY] as const)(
  'checks refused writes and accepted qualification calls in %s storage',
  (writeMode) => {
    setClock(clock);
    setSchemaWriteMode(writeMode);
    try {
      const { record, draw } = setup(true);
      const main = draw.structures?.find((structure) => structure.stage === MAIN);
      const matchUpId = main?.matchUps?.find((matchUp) => matchUp.roundNumber === 1)?.matchUpId;
      if (!matchUpId) throw new Error('Main-draw opening match not found');
      for (const matchUpStatus of [ABANDONED, CANCELLED, DOUBLE_DEFAULT, INCOMPLETE, SUSPENDED]) {
        tournamentEngine.setState(structuredClone(record));
        const before = JSON.stringify(stored());
        let result: any = tournamentEngine.setMatchUpStatus({
          drawId,
          matchUpId,
          outcome: { matchUpStatus },
          schedule: { scheduledDate: '2026-11-20' },
          notes: 'qualification audit',
          propagateExitStatus: true,
        });
        if (result.error) expect(JSON.stringify(stored())).toBe(before);
        else {
          const { drawDefinition } = tournamentEngine.getEvent({ drawId });
          expect(getDrawInconsistencies({ drawDefinition }).valid).toBe(true);
        }
      }
    } finally {
      setSchemaWriteMode(NATIVE);
      setClock();
    }
  },
);
