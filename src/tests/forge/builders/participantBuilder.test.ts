import { afterEach, describe, expect, it } from 'vitest';

import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

function seedEmpty() {
  mocksEngine.generateTournamentRecord({ setState: true, participantsProfile: { participantsCount: 0 } });
}

afterEach(() => {
  tournamentEngine.reset();
});

describe('engine.build.participant — fluent ParticipantBuilder', () => {
  it('creates an individual participant with sensible defaults', () => {
    seedEmpty();
    const result: any = tournamentEngine.build
      .participant()
      .individual({ givenName: 'Petr', familyName: 'Novák', sex: 'M', nationalityCode: 'CZE' })
      .create();

    expect(result.success).toEqual(true);
    expect(typeof result.participantId).toEqual('string');

    const participants: any[] = tournamentEngine.q.participants();
    const created = participants.find((p) => p.participantId === result.participantId);
    expect(created?.participantType).toEqual(INDIVIDUAL);
    expect(created?.participantRole).toEqual(COMPETITOR);
    expect(created?.person?.standardGivenName).toEqual('Petr');
    expect(created?.person?.standardFamilyName).toEqual('Novák');
  });

  it('overrides the role via .role()', () => {
    seedEmpty();
    const directives: any[] = tournamentEngine.build
      .participant()
      .individual({ givenName: 'Jana', familyName: 'Svobodová' })
      .role(OFFICIAL)
      .toDirectives();

    expect(directives[0].params.participant.participantRole).toEqual(OFFICIAL);
  });

  it('.pair() carries individualParticipantIds + optional participantName', () => {
    const directives: any[] = tournamentEngine.build.participant().pair(['ind-1', 'ind-2'], 'Doubles A').toDirectives();

    expect(directives[0].params.participant.participantType).toEqual(PAIR);
    expect(directives[0].params.participant.individualParticipantIds).toEqual(['ind-1', 'ind-2']);
    expect(directives[0].params.participant.participantName).toEqual('Doubles A');
  });

  it('.team() carries team name and optional individualParticipantIds', () => {
    const directives: any[] = tournamentEngine.build
      .participant()
      .team('Czech Republic', ['ind-1', 'ind-2', 'ind-3'])
      .toDirectives();

    expect(directives[0].params.participant.participantType).toEqual(TEAM);
    expect(directives[0].params.participant.participantName).toEqual('Czech Republic');
    expect(directives[0].params.participant.individualParticipantIds.length).toEqual(3);
  });

  it('toRequest() returns directives + participantId without executing', () => {
    seedEmpty();
    const request: any = tournamentEngine.build
      .participant()
      .individual({ givenName: 'Preview', familyName: 'Only' })
      .toRequest();

    expect(request.directives[0].method).toEqual('addParticipant');
    expect(typeof request.participantId).toEqual('string');

    const participants: any[] = tournamentEngine.q.participants();
    expect(participants.find((p) => p.participantId === request.participantId)).toBeUndefined();
  });

  it('throws if a terminal is called before subject sugar', () => {
    expect(() => tournamentEngine.build.participant().toDirectives()).toThrowError(/requires \.individual/);
  });
});
