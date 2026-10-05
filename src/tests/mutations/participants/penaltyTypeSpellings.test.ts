import { normalizePenaltyType } from '@Mutate/participants/penalties/normalizePenaltyType';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { penaltyConstants } from '@Constants/penaltyConstants';
import { PenaltyTypeEnum } from '@Types/tournamentTypes';

/**
 * Two penalty types were published misspelled, EQUIMENT_VIOLATION and FAILUIRE_TO_SIGN_IN (CA,
 * 2026-10-02: fix them). The correct spellings now exist everywhere the old ones did (the enum, the
 * CODES schema, `penaltyConstants`). The old values are still accepted, so saved records and existing
 * callers keep working, and every write stores the correct spelling. They go at the next major.
 */
it('the correct spellings exist beside the deprecated ones', () => {
  expect(PenaltyTypeEnum.EQUIPMENT_VIOLATION).toEqual('EQUIPMENT_VIOLATION');
  expect(PenaltyTypeEnum.FAILURE_TO_SIGN_IN).toEqual('FAILURE_TO_SIGN_IN');
  expect(penaltyConstants.EQUIPMENT_VIOLATION).toEqual(penaltyConstants.EQUIMENT_VIOLATION);
  expect(penaltyConstants.FAILURE_TO_SIGN_IN).toEqual(penaltyConstants.FAILUIRE_TO_SIGN_IN);
});

it('normalises only the two misspelled values', () => {
  expect(normalizePenaltyType('EQUIMENT_VIOLATION')).toEqual('EQUIPMENT_VIOLATION');
  expect(normalizePenaltyType('FAILUIRE_TO_SIGN_IN')).toEqual('FAILURE_TO_SIGN_IN');
  expect(normalizePenaltyType('BALL_ABUSE')).toEqual('BALL_ABUSE');
  expect(normalizePenaltyType('Ball Abuse')).toEqual('Ball Abuse');
  expect(normalizePenaltyType(undefined)).toBeUndefined();
});

it('a penalty added or modified with a misspelled type is stored with the correct one', () => {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);

  let result: any = tournamentEngine.addPenalty({
    penaltyType: 'EQUIMENT_VIOLATION' as any,
    participantIds: [participantIds[0]],
    penaltyCode: 'EV',
  });
  expect(result.success).toEqual(true);
  const { penaltyId } = result.penaltyId ? result : { penaltyId: result.penalty?.penaltyId };
  let stored = tournamentEngine.getTournamentPenalties().penalties.find((p: any) => p.penaltyId === penaltyId);
  expect(stored.penaltyType).toEqual('EQUIPMENT_VIOLATION');

  result = tournamentEngine.modifyPenalty({ penaltyId, modifications: { penaltyType: 'FAILUIRE_TO_SIGN_IN' } });
  expect(result.success).toEqual(true);
  stored = tournamentEngine.getTournamentPenalties().penalties.find((p: any) => p.penaltyId === penaltyId);
  expect(stored.penaltyType).toEqual('FAILURE_TO_SIGN_IN');
});

/**
 * Two DISPLAY LABELS of `penaltyConstants` were misspelled too, and callers store a label as `penaltyType` (CA,
 * 2026-10-05: fix them as suggested, the old spellings accepted until 8.0.0).
 */
it('the two misspelled penalty labels are corrected, and the old spellings are rewritten on write', () => {
  expect(penaltyConstants.UNSPORTSMANLIKE_CONDUCT).toEqual('Unsportsmanlike Conduct');
  expect(penaltyConstants.PUNCTUALITY).toEqual('Punctuality');
  expect(normalizePenaltyType('Unsportmanlike Conduct')).toEqual('Unsportsmanlike Conduct');
  expect(normalizePenaltyType('Puncuality')).toEqual('Punctuality');

  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);

  let result: any = tournamentEngine.addPenalty({
    penaltyType: 'Unsportmanlike Conduct' as any,
    participantIds: [participantIds[0]],
  });
  expect(result.success).toEqual(true);
  const { penaltyId } = result.penaltyId ? result : { penaltyId: result.penalty?.penaltyId };
  let stored = tournamentEngine.getTournamentPenalties().penalties.find((p: any) => p.penaltyId === penaltyId);
  expect(stored.penaltyType).toEqual(penaltyConstants.UNSPORTSMANLIKE_CONDUCT);

  result = tournamentEngine.modifyPenalty({ penaltyId, modifications: { penaltyType: 'Puncuality' } });
  expect(result.success).toEqual(true);
  stored = tournamentEngine.getTournamentPenalties().penalties.find((p: any) => p.penaltyId === penaltyId);
  expect(stored.penaltyType).toEqual(penaltyConstants.PUNCTUALITY);
});

/**
 * `PenaltyTypeEnum` is the canonical penalty vocabulary (CA, 2026-10-05). The legacy TMX vocabulary carried in
 * `@courthive/i18n` named four code-of-conduct offences it lacked; they are codes now, so every consumer label can
 * be keyed by an enum code.
 */
it('the code-of-conduct offences of the legacy vocabulary are penalty types', () => {
  for (const code of ['TIME_VIOLATION', 'AUDIBLE_OBSCENITY', 'VISIBLE_OBSCENITY', 'FAILURE_TO_SIGN_OUT']) {
    expect(PenaltyTypeEnum[code]).toEqual(code);
    expect(penaltyConstants[code]).toBeDefined();
  }

  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  const result: any = tournamentEngine.addPenalty({
    penaltyType: PenaltyTypeEnum.TIME_VIOLATION,
    participantIds: [participantIds[0]],
  });
  expect(result.success).toEqual(true);
});
