import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLES } from '@Constants/eventConstants';

/**
 * An option the mocksEngine does not read is refused, naming itself (phase 4c of the mocksEngine
 * hardening plan). The closed profile types make it a compile error for TypeScript callers; this is
 * the same rule for JS and JSON callers, and for a value cast past the types. Before, a misplaced
 * option was silently ignored: 26 drawProfiles set `completeAllMatchUps` to no effect for weeks, and
 * `mathcUpType` turned a DOUBLES draw into SINGLES.
 */

const refusedOption = (result: any) => {
  expect(result.error).toEqual(INVALID_VALUES);
  return result.context?.option;
};

describe('generateTournamentRecord', () => {
  it('a misspelled drawProfile option names its path', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }, { drawSize: 8, mathcUpType: DOUBLES } as any],
    });
    expect(refusedOption(result)).toEqual('drawProfiles[1].mathcUpType');
  });

  it('a top-level option that belongs elsewhere is refused', () => {
    expect(refusedOption(mocksEngine.generateTournamentRecord({ inContext: true } as any))).toEqual('inContext');
  });

  it('an option inside participantsProfile, venueProfiles, eventProfiles and their drawProfiles', () => {
    expect(
      refusedOption(mocksEngine.generateTournamentRecord({ participantsProfile: { nonRandom: 1 } as any })),
    ).toEqual('participantsProfile.nonRandom');
    expect(
      refusedOption(
        mocksEngine.generateTournamentRecord({ venueProfiles: [{ courtsCount: 2, onlineResources: [] } as any] }),
      ),
    ).toEqual('venueProfiles[0].onlineResources');
    expect(
      refusedOption(
        mocksEngine.generateTournamentRecord({ eventProfiles: [{ eventName: 'E', participantsCount: 0 } as any] }),
      ),
    ).toEqual('eventProfiles[0].participantsCount');
    expect(
      refusedOption(
        mocksEngine.generateTournamentRecord({
          eventProfiles: [{ drawProfiles: [{ drawSize: 4, automate: true } as any] }],
        }),
      ),
    ).toEqual('eventProfiles[0].drawProfiles[0].automate');
  });

  it('control: every option the generator reads is accepted, including generateDrawDefinition options', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, enforcePolicyLimits: false, structureOptions: { groupSize: 4 } }],
      participantsProfile: { participantsCount: 16, withISO2: true },
      venueProfiles: [{ courtsCount: 2, venueName: 'V' }],
      completeAllMatchUps: true,
      nonRandom: 3,
    });
    expect(result.success).toEqual(true);
  });
});

describe('modifyTournamentRecord', () => {
  it('an unknown option is refused before anything is written', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const before = JSON.stringify(tournamentRecord);
    const result = mocksEngine.modifyTournamentRecord({
      drawProfiles: [{ drawSize: 4 }, { drawSize: 4, drawSzie: 8 } as any],
      keepPartial: true,
      tournamentRecord,
    });
    expect(refusedOption(result)).toEqual('drawProfiles[1].drawSzie');
    expect(JSON.stringify(tournamentRecord)).toEqual(before);
  });

  it("through tournamentEngine, the params the engine adds are not the caller's options", () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.modifyTournamentRecord({
      tournamentId: tournamentRecord.tournamentId,
      drawProfiles: [{ drawSize: 4 }],
    });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getEvents().events.length).toEqual(2);

    const refused: any = tournamentEngine.modifyTournamentRecord({ drawProfiles: [{ drawSzie: 4 }] });
    expect(refusedOption(refused)).toEqual('drawProfiles[0].drawSzie');
  });
});
