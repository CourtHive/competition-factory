import { POLICY_ROUND_ROBIN_TALLY_FIBA } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_FIBA';
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { calculateMatchStatistics } from '@Query/scoring/statistics/standalone';
import { FEED_IN_CHAMPIONSHIP, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { afterEach, describe, expect, it } from 'vitest';

// CodeQL js/prototype-polluting-assignment, triaged 2026-11-23 (Mentat assessment 2026-11-23-factory-codeql-triage).
// The factory runs in CFS on client payloads and imported records, so "__proto__" can arrive as an id, a key or a path
// segment. Each case below wrote onto Object.prototype or Array.prototype on dev.
const baseline = new Set(Object.getOwnPropertyNames(Object.prototype));
const arrayBaseline = new Set(Object.getOwnPropertyNames(Array.prototype));
const pollution = () => [
  ...Object.getOwnPropertyNames(Object.prototype).filter((key) => !baseline.has(key)),
  ...Object.getOwnPropertyNames(Array.prototype).filter((key) => !arrayBaseline.has(key)),
];
afterEach(() => {
  Object.getOwnPropertyNames(Object.prototype)
    .filter((key) => !baseline.has(key))
    .forEach((key) => delete (Object.prototype as any)[key]);
  Object.getOwnPropertyNames(Array.prototype)
    .filter((key) => !arrayBaseline.has(key))
    .forEach((key) => delete (Array.prototype as any)[key]);
});

/** A record as a server receives it: one id renamed to "__proto__" throughout, then parsed from JSON. */
const withProtoId = (record: any, id: string) =>
  JSON.parse(JSON.stringify(record).split(`"${id}"`).join('"__proto__"'));
const roundRobin = (extra: any = {}) =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, ...extra }],
    completeAllMatchUps: true,
    setState: false,
  } as any).tournamentRecord;

describe('a "__proto__" id, key or path segment cannot write onto a prototype', () => {
  it('#218 a sanctioning amendment path is refused when it names a prototype', () => {
    const policy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-security',
          applicant: { organisationId: 'org', organisationName: 'Org', contactName: 'C', contactEmail: 'c@e.test' },
          proposal: {
            tournamentName: 'Security Open',
            proposedStartDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
            proposedEndDate: new Date(Date.now() + 61 * 86_400_000).toISOString().slice(0, 10),
            events: [{ eventName: 'S', eventType: SINGLES_EVENT, drawSize: 32, drawType: SINGLE_ELIMINATION }],
          },
          sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: policy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);
    for (const field of [
      'events.__proto__.injected',
      'venues.constructor.prototype.injected',
      'events[0].__proto__.x',
    ]) {
      let result: any = sanctioningEngine.proposeAmendment({
        changes: [{ field, previousValue: undefined, proposedValue: 'yes', changeType: 'ADDED' }],
        sanctioningPolicy: policy,
      });
      expect(result.error, field).toEqual(INVALID_VALUES);
      expect(pollution()).toEqual([]);
    }
    // a legitimate amendment still applies
    const control: any = sanctioningEngine.proposeAmendment({
      changes: [
        { field: 'tournamentName', previousValue: 'Security Open', proposedValue: 'Renamed', changeType: 'MODIFIED' },
      ],
      sanctioningPolicy: policy,
    });
    sanctioningEngine.reviewAmendment({ amendmentId: control.amendmentId, approved: true } as any);
    expect((sanctioningEngine.getSanctioningRecord() as any).sanctioningRecord.proposal.tournamentName).toEqual(
      'Renamed',
    );
  });

  it('#241 #242 #244 a round robin tally with result points treats "__proto__" as an ordinary participant', () => {
    const record = roundRobin();
    tournamentEngine.setState(withProtoId(record, record.participants[0].participantId));
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const result: any = tournamentEngine.tallyParticipantResults({
      matchUps,
      policyDefinitions: POLICY_ROUND_ROBIN_TALLY_FIBA,
    });
    expect(pollution()).toEqual([]);
    expect(Object.hasOwn(result.participantResults, '__proto__')).toBe(true);
    // callers still receive plain objects: they compare, spread and copy results
    expect(Object.getPrototypeOf(result.participantResults)).toBe(Object.prototype);
    // the result-points ledger ran for that participant (#242, #244), not only the tally (#241)
    expect(typeof result.participantResults['__proto__'].classificationPoints).toBe('number');
  });

  it('#211 participant entries with an event id of "__proto__"', () => {
    const record = roundRobin({ seedsCount: 2 });
    tournamentEngine.setState(withProtoId(record, record.events[0].eventId));
    const result: any = tournamentEngine.getParticipants({ withSeeding: true, withEvents: true, withDraws: true });
    expect(pollution()).toEqual([]);
    expect(result.participants.length).toBeGreaterThan(0);
    for (const entry of Object.values(result.participantMap ?? {}) as any[])
      expect(Object.getPrototypeOf(entry.events)).toBe(Object.prototype);
  });

  it('#249 #251 dynamic ratings for a participant id of "__proto__"', () => {
    const record = roundRobin();
    tournamentEngine.setState(withProtoId(record, record.participants[0].participantId));
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m: any) => m.sides?.some((s: any) => s.participantId === '__proto__'));
    const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [target.matchUpId] });
    expect(pollution()).toEqual([]);
    expect(result.success).toBe(true);
    // the participant is rated like any other: both sides of the matchUp carry a modified scale value
    expect(Object.keys(result.modifiedScaleValues).sort()).toEqual(
      target.sides.map((side: any) => side.participantId).sort(),
    );
  });

  it('#197 match statistics ignore a point whose winner is not side 0 or 1, and key categories safely', () => {
    const stats: any = calculateMatchStatistics(
      {} as any,
      [
        { winner: '__proto__', server: 0, result: 'Ace' },
        { winner: 0, server: 0, result: 'Winner', hand: '__proto__' },
        { winner: 1, server: 0, result: 'Ace' },
      ] as any,
    );
    expect(pollution()).toEqual([]);
    expect(stats.counters.teams[1].pointsWon).toHaveLength(1);
    expect(stats.counters.teams[0].pointsWon).toHaveLength(1);
    expect(Object.getPrototypeOf(stats.counters.teams[0])).toBe(Object.prototype);
  });

  it('counts a valid winner without attributing serves or breakpoints to an invalid side', () => {
    const { counters } = calculateMatchStatistics({} as any, [{ winner: 1, server: 2, breakpoint: true }] as any);
    expect(counters.teams[1].pointsWon).toHaveLength(1);
    for (const side of [0, 1]) {
      expect(counters.teams[side].pointsServed).toBeUndefined();
      expect(counters.teams[side].breakpointsFaced).toBeUndefined();
    }
  });

  it('#151 a link whose target round number is not an integer is ignored when ranging draw positions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP }],
      setState: false,
    } as any);
    tournamentRecord.events[0].drawDefinitions[0].links.forEach((link: any) => (link.target.roundNumber = '__proto__'));
    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.allTournamentMatchUps({ inContext: true });
    expect(pollution()).toEqual([]);
    expect(result.matchUps.length).toBeGreaterThan(0);
  });
});
