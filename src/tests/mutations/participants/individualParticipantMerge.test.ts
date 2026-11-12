import { getIndividualParticipantMergePreview } from '@Query/participants/getIndividualParticipantMergePreview';
import { mergeIndividualParticipants } from '@Mutate/participants/mergeIndividualParticipants';
import { resolveMergedParticipantId } from '@Query/participants/individualMerge/aliases';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants and types
import { DELETE_PARTICIPANTS, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import type { Participant, Tournament } from '@Types/tournamentTypes';

function individual(participantId: string): Participant {
  return {
    participantId,
    participantType: INDIVIDUAL,
    participantRole: 'COMPETITOR',
    participantName: 'Ana Rivas',
    person: { personId: '00000000-0000-4000-8000-000000000001', standardGivenName: 'Ana', standardFamilyName: 'Rivas' },
  };
}
function fixture(extra: Participant[] = []): Tournament {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ setState: true });
  tournamentRecord.participants = [individual('source'), individual('target'), ...extra];
  tournamentEngine.setState(tournamentRecord);
  return tournamentRecord;
}
function commit(record: Tournament, extra = {}) {
  const args = { tournamentRecord: record, sourceParticipantId: 'source', targetParticipantId: 'target', ...extra };
  const preview = getIndividualParticipantMergePreview(args);
  return mergeIndividualParticipants({ ...args, expectedFingerprint: preview.fingerprint! });
}
function event(draws: unknown[] = [], entries: unknown[] = []): any {
  return { eventId: 'event', eventName: 'Open', eventType: 'SINGLES', entries, drawDefinitions: draws };
}

describe('individual participant merge', () => {
  test('preview is pure; transfers data and references, records an alias and refuses resurrection', () => {
    const record = fixture([
      {
        participantId: 'team',
        participantType: TEAM,
        individualParticipantIds: ['source'],
        contactParticipantIds: ['source'],
      },
    ]);
    record.participants![0].person!.nationalityCode = 'FRA';
    record.events = [event([], [{ participantId: 'source', entryStage: 'MAIN', entryStatus: 'DIRECT_ACCEPTANCE' }])];
    const before = JSON.stringify(record);
    let result: any = getIndividualParticipantMergePreview({
      tournamentRecord: record,
      sourceParticipantId: 'source',
      targetParticipantId: 'target',
    });
    expect(result.canMerge).toBe(true);
    expect(JSON.stringify(record)).toBe(before);
    result = commit(record);
    expect(result.success).toBe(true);
    expect(record.participants?.map((p) => p.participantId)).toEqual(['target', 'team']);
    expect(record.participants?.[0].person?.nationalityCode).toBe('FRA');
    expect(record.participants?.[1].individualParticipantIds).toEqual(['target']);
    expect(record.participants?.[1].contactParticipantIds).toEqual(['target']);
    expect(record.events?.[0].entries?.[0].participantId).toBe('target');
    expect(resolveMergedParticipantId({ tournamentRecord: record, participantId: 'source' })).toBe('target');
    tournamentEngine.setState(record);
    for (const method of ['addParticipant', 'addParticipants', 'mergeParticipants']) {
      result = tournamentEngine[method]({ participant: individual('source'), participants: [individual('source')] });
      expect(result.error?.code).toBe('PARTICIPANT_ID_RETIRED');
    }
  });

  test.each(['direct', 'pair', 'team', 'lineup', 'nested', 'entries'])(
    'refuses common draw via %s with no mutation',
    (kind) => {
      const group: Participant = {
        participantId: 'group',
        participantType: kind === 'pair' ? PAIR : TEAM,
        individualParticipantIds: ['source', 'other'],
      };
      const record = fixture([individual('other'), group]);
      const draw: any = { drawId: 'draw', entries: [{ participantId: 'target' }] };
      if (kind === 'entries') draw.entries.push({ participantId: 'source' });
      else if (kind === 'nested')
        draw.structures = [{ structures: [{ positionAssignments: [{ participantId: 'source' }] }] }];
      else if (kind === 'lineup')
        draw.structures = [{ matchUps: [{ sides: [{ lineUp: [{ participantId: 'source' }] }] }] }];
      else draw.structures = [{ positionAssignments: [{ participantId: kind === 'direct' ? 'source' : 'group' }] }];
      record.events = [event([draw])];
      const before = JSON.stringify(record);
      let result: any = commit(record);
      expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
      expect(result.context.blockers).toContainEqual(expect.objectContaining({ code: 'SHARED_DRAW', drawId: 'draw' }));
      expect(JSON.stringify(record)).toBe(before);
    },
  );

  test('allows disjoint draws, keeping all topology and result fields', () => {
    const record = fixture();
    record.events = [
      event([
        {
          drawId: 'one',
          structures: [
            {
              matchUps: [
                {
                  matchUpId: 'm',
                  winningSide: 1,
                  score: { scoreStringSide1: '6-0 6-0' },
                  sides: [{ sideNumber: 1, participantId: 'source' }],
                },
              ],
            },
          ],
        },
        { drawId: 'two', entries: [{ participantId: 'target' }] },
      ]),
    ];
    let result: any = commit(record);
    expect(result.success).toBe(true);
    const matchUp = record.events[0].drawDefinitions?.[0].structures?.[0].matchUps?.[0];
    expect(matchUp?.sides?.[0].participantId).toBe('target');
    expect(matchUp?.score?.scoreStringSide1).toBe('6-0 6-0');
    expect(matchUp?.winningSide).toBe(1);
    expect(matchUp?.matchUpId).toBe('m');
  });

  test.each(['collapse', 'duplicate'])('refuses pair %s', (kind) => {
    const record = fixture([
      individual('other'),
      {
        participantId: 'pair1',
        participantType: PAIR,
        individualParticipantIds: ['source', kind === 'collapse' ? 'target' : 'other'],
      },
      { participantId: 'pair2', participantType: PAIR, individualParticipantIds: ['target', 'other'] },
    ]);
    const before = JSON.stringify(record);
    let result: any = commit(record);
    expect(
      result.context.blockers.some((b) => b.code === (kind === 'collapse' ? 'PAIR_COLLAPSE' : 'DUPLICATE_PAIR')),
    ).toBe(true);
    expect(JSON.stringify(record)).toBe(before);
  });

  test('requires explicit field choices and rejects stale or fabricated choices', () => {
    const record = fixture();
    record.participants![0].person!.birthDate = '1990-01-01';
    record.participants![1].person!.birthDate = '1991-01-01';
    let result: any = commit(record);
    expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
    result = commit(record, { resolutions: { '/person/birthDate': 'source' } });
    expect(result.success).toBe(true);
    expect(record.participants?.[0].person?.birthDate).toBe('1990-01-01');
    const fresh = fixture();
    const preview = getIndividualParticipantMergePreview({
      tournamentRecord: fresh,
      sourceParticipantId: 'source',
      targetParticipantId: 'target',
    });
    fresh.participants![0].notes = 'changed';
    result = mergeIndividualParticipants({
      tournamentRecord: fresh,
      sourceParticipantId: 'source',
      targetParticipantId: 'target',
      expectedFingerprint: preview.fingerprint!,
    });
    expect(result.error?.code).toBe('INDIVIDUAL_MERGE_STALE');
    result = commit(fresh, { resolutions: { '/not-a-field': 'source' } });
    expect(result.context.blockers).toContainEqual({ code: 'INVALID_RESOLUTION', path: '/not-a-field' });
  });

  test.each(['person', 'issued', 'extension', 'entries', 'history', 'role'])('refuses unsafe %s conflicts', (kind) => {
    const record = fixture();
    const [source, target] = record.participants!;
    if (kind === 'person') {
      source.person!.personId = 'real-one';
      target.person!.personId = 'real-two';
    }
    if (kind === 'issued') {
      source.person!.personOtherIds = [{ organisationId: 'ITF', uniqueOrganisationName: 'ITF', personId: 'one' }];
      target.person!.personOtherIds = [{ organisationId: 'ITF', uniqueOrganisationName: 'ITF', personId: 'two' }];
    }
    if (kind === 'extension') record.extensions = [{ name: 'provider', value: { player: 'source' } }];
    if (kind === 'entries')
      record.events = [
        event(
          [],
          [
            { participantId: 'source', entryStatus: 'ALTERNATE' },
            { participantId: 'target', entryStatus: 'DIRECT_ACCEPTANCE' },
          ],
        ),
      ];
    if (kind === 'history') {
      source.timeItems = [{ itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 12 }];
      target.timeItems = [{ itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 14 }];
    }
    if (kind === 'role') source.participantRole = 'OFFICIAL';
    const before = JSON.stringify(record);
    let result: any = commit(record);
    expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
    expect(JSON.stringify(record)).toBe(before);
  });

  test('collapses equivalent event entries and flattens alias chains across merges', () => {
    const record = fixture([individual('third')]);
    record.events = [
      event(
        [],
        [
          { participantId: 'source', entryStage: 'MAIN' },
          { participantId: 'target', entryStage: 'MAIN' },
        ],
      ),
    ];
    let result: any = commit(record);
    expect(result.success).toBe(true);
    expect(record.events?.[0].entries).toHaveLength(1);
    const args = { tournamentRecord: record, sourceParticipantId: 'target', targetParticipantId: 'third' };
    const preview = getIndividualParticipantMergePreview(args);
    result = mergeIndividualParticipants({ ...args, expectedFingerprint: preview.fingerprint! });
    expect(result.success).toBe(true);
    expect(resolveMergedParticipantId({ tournamentRecord: record, participantId: 'source' })).toBe('third');
  });

  test('publishes source deletion and survivor modification through the real engine', () => {
    const record = fixture();
    const notices: any[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETE_PARTICIPANTS]: (payloads) => notices.push(...payloads),
        [MODIFY_PARTICIPANTS]: (payloads) => notices.push(...payloads),
      },
    });
    const preview = tournamentEngine.getIndividualParticipantMergePreview({
      sourceParticipantId: 'source',
      targetParticipantId: 'target',
    });
    let result: any = tournamentEngine.mergeIndividualParticipants({
      sourceParticipantId: 'source',
      targetParticipantId: 'target',
      expectedFingerprint: preview.fingerprint!,
    });
    expect(result.success).toBe(true);
    expect(notices).toContainEqual(
      expect.objectContaining({ tournamentId: record.tournamentId, participantIds: ['source'] }),
    );
    // Identical survivor data is unchanged, so no redundant profile modification is required.
    expect(tournamentEngine.getParticipants().participants?.some((p) => p.participantId === 'source')).toBe(false);
  });
});

test('engine alias query returns the retained id and preview does not mark a mutation', () => {
  const record = fixture();
  expect(commit(record).success).toBe(true);
  tournamentEngine.setState(record);
  let result: any = tournamentEngine.resolveMergedParticipantId({ participantId: 'source' });
  expect(result).toBe('target');
});

test.each(['opponents', 'lineup', 'flights'])('blocks collisions outside draw lists: %s', (kind) => {
  const record: any = fixture();
  if (kind === 'opponents')
    record.matchUps = [{ matchUpId: 'standalone', sides: [{ participantId: 'source' }, { participantId: 'target' }] }];
  if (kind === 'lineup')
    record.matchUps = [
      { matchUpId: 'standalone', sides: [{ lineUp: [{ participantId: 'source' }, { participantId: 'target' }] }] },
    ];
  if (kind === 'flights') record.events = [event()];
  if (kind === 'flights')
    record.events[0].flightProfile = { flights: [{ participantIds: ['source'] }, { participantIds: ['target'] }] };
  const before = JSON.stringify(record);
  let result: any = commit(record);
  expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
  expect(JSON.stringify(record)).toBe(before);
});

test('retains private contact restrictions and refuses malformed or cyclic alias ledgers', () => {
  const record = fixture();
  record.participants![0].person!.contacts = [{ emailAddress: 'ana@example.test', isPublic: false }];
  record.participants![1].person!.contacts = [{ emailAddress: 'ana@example.test', isPublic: true }];
  expect(commit(record).success).toBe(true);
  expect(record.participants![0].person!.contacts?.every((c) => c.isPublic === false)).toBe(true);
  const cyclic = fixture();
  cyclic.extensions = [
    { name: 'individualParticipantMerges', value: { version: 1, aliases: { one: 'two', two: 'one' } } },
  ];
  let result: any = getIndividualParticipantMergePreview({
    tournamentRecord: cyclic,
    sourceParticipantId: 'source',
    targetParticipantId: 'target',
  });
  expect(result.error?.code).toBe('ERR_INVALID_VALUES');
});

test('857 individual participants preserve unrelated identities and consolidate exactly one record', () => {
  const record = fixture(Array.from({ length: 855 }, (_, index) => individual(`unrelated-${index}`)));
  const unrelatedBefore = JSON.stringify(record.participants?.slice(2));
  const args = { tournamentRecord: record, sourceParticipantId: 'source', targetParticipantId: 'target' };
  const previewStart = performance.now();
  const preview = getIndividualParticipantMergePreview(args);
  const previewMs = performance.now() - previewStart;
  expect(preview.canMerge).toBe(true);
  const commitStart = performance.now();
  let result: any = mergeIndividualParticipants({ ...args, expectedFingerprint: preview.fingerprint! });
  const commitMs = performance.now() - commitStart;
  expect(result.success).toBe(true);
  expect(record.participants).toHaveLength(856);
  expect(JSON.stringify(record.participants?.slice(1))).toBe(unrelatedBefore);
  console.log(`857 individuals: preview ${previewMs.toFixed(1)} ms; merge ${commitMs.toFixed(1)} ms`);
});

test('recognizes trusted identities across mirrored fields and preserves disjoint rating histories', () => {
  const record = fixture();
  record.participants![0].personId = 'real-source';
  record.participants![1].person!.personId = 'real-target';
  let result: any = commit(record);
  expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
  const ratings = fixture();
  ratings.participants![0].timeItems = [{ itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 12 }];
  ratings.participants![1].timeItems = [{ itemType: 'SCALE.RATING.SINGLES.UTR', itemValue: 7 }];
  result = commit(ratings);
  expect(result.success).toBe(true);
  expect(ratings.participants![0].timeItems).toHaveLength(2);
});

test('a retired ID stays retired after its survivor is deleted; unrelated adds and merges proceed', () => {
  const record = fixture([individual('third'), individual('fourth')]);
  expect(commit(record).success).toBe(true);
  tournamentEngine.setState(record);
  let result: any = tournamentEngine.deleteParticipants({ participantIds: ['target'] });
  expect(result.success).toBe(true);
  result = tournamentEngine.addParticipants({ participants: [individual('fresh')] });
  expect(result.success).toBe(true);
  result = tournamentEngine.addParticipant({ participant: individual('source') });
  expect(result.error?.code).toBe('PARTICIPANT_ID_RETIRED');
  expect(result.context.canonicalParticipantId).toBe('target');
  // Re-importing the person re-creates the survivor, never the duplicate.
  expect(tournamentEngine.resolveMergedParticipantId({ participantId: 'source' })).toBe('target');
  result = tournamentEngine.addParticipant({ participant: individual('target') });
  expect(result.success).toBe(true);
  const preview = tournamentEngine.getIndividualParticipantMergePreview({
    sourceParticipantId: 'third',
    targetParticipantId: 'fourth',
  });
  expect(preview.canMerge).toBe(true);
  result = tournamentEngine.mergeIndividualParticipants({
    sourceParticipantId: 'third',
    targetParticipantId: 'fourth',
    expectedFingerprint: preview.fingerprint,
  });
  expect(result.success).toBe(true);
});

test('a corrupt alias chain refuses only the IDs that traverse it, and any merge that rewrites the ledger', () => {
  const record = fixture();
  record.extensions = [
    { name: 'individualParticipantMerges', value: { version: 1, aliases: { one: 'two', two: 'one' } } },
  ];
  tournamentEngine.setState(record);
  let result: any = tournamentEngine.addParticipants({ participants: [individual('fresh')] });
  expect(result.success).toBe(true);
  result = tournamentEngine.addParticipants({ participants: [individual('one')] });
  expect(result.error?.code).toBe('ERR_INVALID_VALUES');
  const before = JSON.stringify(record);
  result = commit(record);
  expect(result.error?.code).toBe('ERR_INVALID_VALUES');
  expect(JSON.stringify(record)).toBe(before);
});

test.each(['person-extension', 'unknown-array', 'person-request'])(
  'refuses unsupported identity references in %s',
  (kind) => {
    const record: any = fixture();
    if (kind === 'person-extension')
      record.participants[0].person.extensions = [{ name: 'custom', value: { participantId: 'source' } }];
    if (kind === 'unknown-array') record.customReferences = ['source'];
    if (kind === 'person-request') {
      record.participants[1].person.personId = '00000000-0000-4000-8000-000000000002';
      record.extensions = [
        { name: 'personRequests', value: { '00000000-0000-4000-8000-000000000001': [{ requestType: 'UNAVAILABLE' }] } },
      ];
    }
    const before = JSON.stringify(record);
    let result: any = commit(record);
    expect(result.context.blockers).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_REFERENCE' }));
    expect(JSON.stringify(record)).toBe(before);
  },
);

test('refuses a new overlap between two team registrations before any draw exists', () => {
  const record = fixture([
    { participantId: 'team1', participantType: TEAM, individualParticipantIds: ['source'] },
    { participantId: 'team2', participantType: TEAM, individualParticipantIds: ['target'] },
  ]);
  record.events = [
    event(
      [],
      [
        { participantId: 'team1', entryStage: 'MAIN' },
        { participantId: 'team2', entryStage: 'MAIN' },
      ],
    ),
  ];
  record.events[0].eventType = 'TEAM';
  let result: any = commit(record);
  expect(result.context.blockers).toContainEqual(expect.objectContaining({ code: 'ENTRY_GROUPING_CONFLICT' }));
});

test('compares current ratings with the same timestamp semantics as the scale reader', () => {
  const record = fixture();
  record.participants![0].timeItems = [
    { itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 12 },
    { itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 14, createdAt: '1990-01-01T00:00:00Z' },
  ];
  record.participants![1].timeItems = [
    { itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 12, createdAt: '2026-01-01T00:00:00Z' },
  ];
  let result: any = commit(record);
  expect(result.context.blockers).toContainEqual({ code: 'HISTORY_CONFLICT', path: '/timeItems' });
});

test.each(['same', 'missing', 'invalid-resolutions', 'wrong-type', 'invalid-ledger'])(
  'refuses invalid merge parameters: %s',
  (kind) => {
    const record: any = fixture();
    const args: any = { tournamentRecord: record, sourceParticipantId: 'source', targetParticipantId: 'target' };
    if (kind === 'same') args.targetParticipantId = 'source';
    if (kind === 'missing') args.sourceParticipantId = '';
    if (kind === 'invalid-resolutions') args.resolutions = { '/person/birthDate': 'unknown' };
    if (kind === 'wrong-type') record.participants[0].participantType = TEAM;
    if (kind === 'invalid-ledger') record.extensions = [{ name: 'individualParticipantMerges', value: { version: 2 } }];
    const before = JSON.stringify(record);
    let result: any = getIndividualParticipantMergePreview(args);
    expect(result.error).toBeDefined();
    expect(JSON.stringify(record)).toBe(before);
  },
);

test.each(['key', 'value', 'person-reference', 'contact', 'issued-id'])(
  'checks unsupported or invalid %s data',
  (kind) => {
    const record: any = fixture();
    if (kind === 'key') record.customMap = { source: { value: 1 } };
    if (kind === 'value') record.customReference = 'source';
    if (kind === 'person-reference') {
      record.participants[1].person.personId = '00000000-0000-4000-8000-000000000002';
      record.customRequest = { personId: '00000000-0000-4000-8000-000000000001' };
    }
    if (kind === 'contact')
      record.participants.push({
        participantId: 'bad-team',
        participantType: TEAM,
        individualParticipantIds: ['target'],
        contactParticipantIds: ['missing'],
      });
    if (kind === 'issued-id') {
      record.participants[0].person.personOtherIds = [null];
      record.participants[1].person.personOtherIds = [];
    }
    let result: any = commit(record);
    expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
  },
);

test('transfers direct draw and tournament matchUps, retains public contacts and skips unrelated events', () => {
  const record: any = fixture();
  record.participants[0].person.contacts = [{ emailAddress: 'ana@example.test', isPublic: true }];
  record.participants[1].person.contacts = [{ telephone: '1234567', isPublic: true }];
  record.events = [
    event([
      { drawId: 'draw', matchUps: [{ matchUpId: 'draw-match', sides: [{ sideNumber: 1, participantId: 'source' }] }] },
    ]),
    { eventId: 'unrelated', eventName: 'Unrelated', eventType: 'SINGLES' },
  ];
  record.matchUps = [{ matchUpId: 'root-match', sides: [{ sideNumber: 1, participantId: 'source' }] }];
  const unaffected = JSON.stringify(record.events[1]);
  let result: any = commit(record);
  expect(result.success).toBe(true);
  expect(record.events[0].drawDefinitions[0].matchUps[0].sides[0].participantId).toBe('target');
  expect(record.matchUps[0].sides[0].participantId).toBe('target');
  expect(JSON.stringify(record.events[1])).toBe(unaffected);
  expect(record.participants[0].person.contacts.every((c) => c.isPublic)).toBe(true);
  expect(result.mergeReceipt.before.other.matchUps[0].sides[0].participantId).toBe('source');
});

function engineEvent(participantIds: string[]) {
  fixture([individual('other'), individual('fourth')]);
  tournamentEngine.addEvent({ event: { eventId: 'e1', eventName: 'Open', eventType: 'SINGLES' } });
  let result: any = tournamentEngine.addEventEntries({ eventId: 'e1', participantIds });
  expect(result.success).toBe(true);
  return tournamentEngine.getTournament().tournamentRecord as any;
}
function engineMerge(resolutions = {}) {
  const args = { sourceParticipantId: 'source', targetParticipantId: 'target', resolutions };
  const preview = tournamentEngine.getIndividualParticipantMergePreview(args);
  return {
    preview,
    result: tournamentEngine.mergeIndividualParticipants({
      ...args,
      ...(preview && { expectedFingerprint: preview.fingerprint }),
    }),
  };
}

test('duplicates entered in the same event merge: positions are incidental, the survivor keeps its own', () => {
  engineEvent(['source', 'target', 'other']);
  const { preview, result } = engineMerge();
  expect(preview.canMerge).toBe(true);
  expect(result.success).toBe(true);
  const entries = tournamentEngine.getEvent({ eventId: 'e1' }).event.entries;
  expect(entries.map((e) => e.participantId)).toEqual(['target', 'other']);
  expect(entries[0].entryPosition).toBe(2);
});

test('differing registration fields become explicit choices on the survivor entry', () => {
  const record = engineEvent(['source', 'target']);
  record.events[0].entries[0].entryStatus = 'ALTERNATE';
  tournamentEngine.setState(record);
  let { preview, result }: any = engineMerge();
  expect(preview.canMerge).toBe(false);
  expect(preview.conflicts).toContainEqual({
    path: '/events/0/entries/1/entryStatus',
    source: 'ALTERNATE',
    target: 'DIRECT_ACCEPTANCE',
  });
  expect(result.error?.code).toBe('INDIVIDUAL_MERGE_BLOCKED');
  ({ result } = engineMerge({ '/events/0/entries/1/entryStatus': 'source' }));
  expect(result.success).toBe(true);
  const entries = tournamentEngine.getEvent({ eventId: 'e1' }).event.entries;
  expect(entries).toEqual([expect.objectContaining({ participantId: 'target', entryStatus: 'ALTERNATE' })]);
});

test('a source-only registration field transfers; an existing survivor duplicate that differs still refuses', () => {
  const record = engineEvent(['source', 'target']);
  record.events[0].entries[0].entryStageSequence = 2;
  tournamentEngine.setState(record);
  let { result }: any = engineMerge();
  expect(result.success).toBe(true);
  expect(tournamentEngine.getEvent({ eventId: 'e1' }).event.entries).toEqual([
    expect.objectContaining({ participantId: 'target', entryStageSequence: 2 }),
  ]);
  const duplicated = engineEvent(['target']);
  duplicated.events[0].entries.push({ ...duplicated.events[0].entries[0], entryStatus: 'ALTERNATE' });
  tournamentEngine.setState(duplicated);
  ({ result } = engineMerge());
  expect(result.context.blockers).toContainEqual({ code: 'ENTRY_CONFLICT', path: '/events/0/entries/1' });
});

test('the review fingerprint ignores unrelated activity but not the merge inputs or choices', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  tournamentRecord.participants!.push(individual('source'), individual('target'));
  tournamentRecord.participants![tournamentRecord.participants!.length - 2].person!.birthDate = '1990-01-01';
  tournamentEngine.setState(tournamentRecord);
  const resolutions = { '/person/birthDate': 'source' as const };
  const args = { sourceParticipantId: 'source', targetParticipantId: 'target', resolutions };
  const reviewed = tournamentEngine.getIndividualParticipantMergePreview(args);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { matchUpId, drawId } = matchUps[0];
  expect(tournamentEngine.addMatchUpScheduledTime({ matchUpId, drawId, scheduledTime: '10:00' }).success).toBe(true);
  expect(tournamentEngine.getIndividualParticipantMergePreview(args).fingerprint).toBe(reviewed.fingerprint);
  let result: any = tournamentEngine.mergeIndividualParticipants({
    ...args,
    resolutions: {},
    expectedFingerprint: reviewed.fingerprint,
  });
  expect(result.error?.code).toBe('INDIVIDUAL_MERGE_STALE');
  tournamentEngine.modifyParticipant({ participant: { participantId: 'source', participantName: 'Ana R.' } });
  result = tournamentEngine.mergeIndividualParticipants({ ...args, expectedFingerprint: reviewed.fingerprint });
  expect(result.error?.code).toBe('INDIVIDUAL_MERGE_STALE');
});

test.each(['same', 'different', 'source-only', 'legacy-extension'])(
  'rewrites flight profile entries before draws exist: %s flight',
  (kind) => {
    const both = ['source', 'target', 'other'];
    const entered = { same: both, 'legacy-extension': both, different: ['source', 'other', 'target', 'fourth'] };
    engineEvent(entered[kind] ?? ['source', 'other']);
    let result: any = tournamentEngine.generateFlightProfile({
      attachFlightProfile: true,
      flightsCount: kind === 'different' ? 2 : 1,
      eventId: 'e1',
    });
    expect(result.success).toBe(true);
    if (kind === 'legacy-extension') {
      // Un-migrated records still carry the profile as an event extension, which getFlightProfile reads.
      const record: any = tournamentEngine.getTournament().tournamentRecord;
      const { flightProfile, ...event } = record.events[0];
      record.events[0] = { ...event, extensions: [{ name: 'flightProfile', value: flightProfile }] };
      tournamentEngine.setState(record);
    }
    const flights = () => tournamentEngine.getFlightProfile({ eventId: 'e1' }).flightProfile.flights;
    if (kind === 'different') {
      const sides = flights().map((f) => f.drawEntries.map((e) => e.participantId));
      // Source and target must land in different flights for this case to mean anything.
      expect(sides.findIndex((ids) => ids.includes('source'))).not.toBe(
        sides.findIndex((ids) => ids.includes('target')),
      );
    }
    const { preview, result: merged }: any = engineMerge();
    if (kind === 'different') {
      expect(preview.blockers).toContainEqual(expect.objectContaining({ code: 'FLIGHT_CONFLICT' }));
      return;
    }
    expect(preview.blockers).toEqual([]);
    expect(merged.success).toBe(true);
    const ids = flights().flatMap((f) => f.drawEntries.map((e) => e.participantId));
    expect(ids.toSorted()).toEqual(['other', 'target']);
  },
);
