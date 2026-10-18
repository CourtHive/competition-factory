import { LEGACY_PENALTY_TYPES, normalizePenaltyType } from '@Query/participants/normalizePenaltyType';
import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { penaltyConstants } from '@Constants/penaltyConstants';
import { PenaltyTypeEnum } from '@Types/tournamentTypes';

/**
 * THE FACTORY STORES PENALTY CODES (CA, 2026-10-15). Every `penaltyConstants` value is its `PenaltyTypeEnum` code,
 * the vocabulary of the `Penalty` type, the CODES schema and the `@courthive/i18n` `penalties.<CODE>` keys. The
 * display labels earlier releases stored are accepted and rewritten to the code on write, and by
 * `migrateTournamentRecord` for a record that already holds them, until 8.0.0.
 */

// the display labels `penaltyConstants` carried before its values became codes, with the two misspelled ones
const LEGACY_LABELS: Record<string, string> = {
  Coaching: PenaltyTypeEnum.COACHING,
  'Ball Abuse': PenaltyTypeEnum.BALL_ABUSE,
  'Racket Abuse': PenaltyTypeEnum.RACKET_ABUSE,
  'Verbal Abuse': PenaltyTypeEnum.VERBAL_ABUSE,
  'Physical Abuse': PenaltyTypeEnum.PHYSICAL_ABUSE,
  'Audible Obscenity': PenaltyTypeEnum.AUDIBLE_OBSCENITY,
  'Visible Obscenity': PenaltyTypeEnum.VISIBLE_OBSCENITY,
  'Time Violation': PenaltyTypeEnum.TIME_VIOLATION,
  'Unsportsmanlike Conduct': PenaltyTypeEnum.UNSPORTSMANLIKE_CONDUCT,
  'Unsportmanlike Conduct': PenaltyTypeEnum.UNSPORTSMANLIKE_CONDUCT,
  'Dress Code Violation': PenaltyTypeEnum.DRESS_CODE_VIOLATION,
  'Equipment Violation': PenaltyTypeEnum.EQUIPMENT_VIOLATION,
  'Leaving the court': PenaltyTypeEnum.LEAVING_THE_COURT,
  'Failure to complete': PenaltyTypeEnum.FAILURE_TO_COMPLETE,
  'No Show': PenaltyTypeEnum.NO_SHOW,
  Other: PenaltyTypeEnum.OTHER,
  Punctuality: PenaltyTypeEnum.PUNCTUALITY,
  Puncuality: PenaltyTypeEnum.PUNCTUALITY,
  'Failure to sign in': PenaltyTypeEnum.FAILURE_TO_SIGN_IN,
  'Failure to sign out': PenaltyTypeEnum.FAILURE_TO_SIGN_OUT,
};

const storedPenalty = (penaltyId: string) =>
  tournamentEngine.getTournamentPenalties().penalties.find((p: any) => p.penaltyId === penaltyId);

function setUp() {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  return tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
}

it('every penaltyConstants value is the PenaltyTypeEnum code of the same name', () => {
  const misspelled: Record<string, string> = {
    EQUIMENT_VIOLATION: PenaltyTypeEnum.EQUIPMENT_VIOLATION,
    FAILUIRE_TO_SIGN_IN: PenaltyTypeEnum.FAILURE_TO_SIGN_IN,
  };
  for (const [key, value] of Object.entries(penaltyConstants)) {
    expect(PenaltyTypeEnum[key]).toBeDefined();
    expect(value).toEqual(misspelled[key] ?? PenaltyTypeEnum[key]);
  }
});

it('the legacy map covers exactly the labels and misspellings, and every target is a correct code', () => {
  expect(Object.keys(LEGACY_PENALTY_TYPES).toSorted((a, b) => a.localeCompare(b))).toEqual(
    [...Object.keys(LEGACY_LABELS), 'EQUIMENT_VIOLATION', 'FAILUIRE_TO_SIGN_IN'].toSorted((a, b) => a.localeCompare(b)),
  );
  const correctCodes = Object.values(penaltyConstants);
  for (const code of Object.values(LEGACY_PENALTY_TYPES)) expect(correctCodes).toContain(code);
});

describe('a legacy label is stored as its code', () => {
  it.each(Object.entries(LEGACY_LABELS))('addPenalty: %s', (label, code) => {
    const participantIds = setUp();
    const result: any = tournamentEngine.addPenalty({
      penaltyType: label as any,
      participantIds: [participantIds[0]],
    });
    expect(result.success).toEqual(true);
    expect(storedPenalty(result.penaltyId).penaltyType).toEqual(code);
  });

  it.each(Object.entries(LEGACY_LABELS))('modifyPenalty: %s', (label, code) => {
    const participantIds = setUp();
    const { penaltyId }: any = tournamentEngine.addPenalty({
      penaltyType: penaltyConstants.NO_SHOW,
      participantIds: [participantIds[0]],
    });
    const result: any = tournamentEngine.modifyPenalty({ penaltyId, modifications: { penaltyType: label } });
    expect(result.success).toEqual(true);
    expect(storedPenalty(penaltyId).penaltyType).toEqual(code);
  });
});

it('a value outside the legacy map passes through unchanged', () => {
  expect(normalizePenaltyType('SHOT_CLOCK_VIOLATION')).toEqual('SHOT_CLOCK_VIOLATION');
  expect(normalizePenaltyType('ball abuse')).toEqual('ball abuse');
  expect(normalizePenaltyType('toString')).toEqual('toString');
  expect(normalizePenaltyType(42)).toEqual(42);

  const participantIds = setUp();
  const result: any = tournamentEngine.addPenalty({
    penaltyType: 'SHOT_CLOCK_VIOLATION' as any,
    participantIds: [participantIds[0]],
  });
  expect(result.success).toEqual(true);
  expect(storedPenalty(result.penaltyId).penaltyType).toEqual('SHOT_CLOCK_VIOLATION');
});

it('migrateTournamentRecord rewrites stored legacy labels to codes, and a second run changes nothing', () => {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 2 },
  });
  const [first, second] = tournamentRecord.participants;
  first.penalties = [
    { penaltyId: 'p1', penaltyType: 'Ball Abuse' },
    { penaltyId: 'p2', penaltyType: 'Puncuality' },
    { penaltyId: 'p3', penaltyType: penaltyConstants.COACHING },
  ];
  second.penalties = [
    { penaltyId: 'p4', penaltyType: 'EQUIMENT_VIOLATION' },
    { penaltyId: 'p5', penaltyType: 'SHOT_CLOCK_VIOLATION' },
  ];

  const result: any = migrateTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  expect(result.promoted.penaltyLabels).toEqual(3);
  expect(first.penalties.map((p: any) => p.penaltyType)).toEqual([
    penaltyConstants.BALL_ABUSE,
    penaltyConstants.PUNCTUALITY,
    penaltyConstants.COACHING,
  ]);
  expect(second.penalties.map((p: any) => p.penaltyType)).toEqual([
    penaltyConstants.EQUIPMENT_VIOLATION,
    'SHOT_CLOCK_VIOLATION',
  ]);

  const again: any = migrateTournamentRecord({ tournamentRecord, clearLegacy: false });
  expect(again.promoted.penaltyLabels).toEqual(0);
});
