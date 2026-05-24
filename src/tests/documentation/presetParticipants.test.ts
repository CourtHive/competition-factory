import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, test } from 'vitest';

import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { MALE, FEMALE } from '@Constants/genderConstants';

// `mocksEngine.generateTournamentRecord({ participants })` lets callers
// supply a pre-built participant pool instead of having factory synthesize
// mocks. This is required by ingest pipelines (courthive-ingest's
// federation adapters) where stable provider-issued IDs need to be
// preserved through the generated TODS shape.
//
// When `params.participants?.length > 0`:
//   - factory adds them directly via `addParticipants` (skipping the
//     `addTournamentParticipants` / `generateEventParticipants` synthesis
//     paths)
//   - all drawProfile-level participant generation is suppressed
//   - filtering by event gender / eventType / participantType still applies
//     via `filterConsideredParticipants` against the supplied pool

describe('mocksEngine.generateTournamentRecord — preset participants', () => {
  function buildIndividuals(count: number, sex: 'MALE' | 'FEMALE', prefix: string) {
    const out: any[] = [];
    for (let i = 1; i <= count; i += 1) {
      const id = `${prefix}${i}`;
      out.push({
        participantId: id,
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        participantName: `${prefix} Player ${i}`,
        person: {
          personId: id,
          sex,
          standardFamilyName: `Surname${i}`,
          standardGivenName: 'A',
          nationalityCode: 'XYZ',
        },
      });
    }
    return out;
  }

  test('supplied participants land in tournament + event entries (no mock synthesis)', () => {
    const participants = buildIndividuals(8, MALE, 'PRESET');

    const result = mocksEngine.generateTournamentRecord({
      tournamentName: 'preset-test',
      participants,
      eventProfiles: [
        {
          eventName: 'Singles MAIN',
          eventType: SINGLES,
          gender: MALE,
          drawProfiles: [
            {
              drawSize: 8,
              drawName: 'Main',
              eventType: SINGLES,
              matchUpType: SINGLES,
              participantsCount: 8,
              automated: false,
              idPrefix: 'm',
            },
          ],
        },
      ],
    });

    expect(result.success).toEqual(true);
    const tr = result.tournamentRecord;

    // No mock synthesis — every participant in the tournament is one we passed in
    expect(tr.participants.length).toEqual(8);
    const ids = new Set(tr.participants.map((p) => p.participantId));
    for (let i = 1; i <= 8; i += 1) expect(ids.has(`PRESET${i}`)).toEqual(true);

    // Event entries reference OUR participant IDs, not synthesized UUIDs
    const event = tr.events[0];
    expect(event.entries.length).toEqual(8);
    for (const entry of event.entries) expect(ids.has(entry.participantId)).toEqual(true);

    // Draw was built (single-structure SE) — automated: false leaves positions unassigned
    const drawDef = event.drawDefinitions[0];
    expect(drawDef.structures.length).toEqual(1);
    const structure = drawDef.structures[0];
    expect(structure.stage).toEqual(MAIN);
    expect(structure.matchUps.length).toEqual(7); // 8-draw SE = 7 matchUps
    // Deterministic matchUpIds from idPrefix
    const ids01 = structure.matchUps.map((m) => m.matchUpId);
    expect(ids01).toContain('m-1-1');
  });

  test('manual assignDrawPosition + setMatchUpStatus walk the chain correctly', () => {
    const participants = buildIndividuals(4, MALE, 'CZE100');

    tournamentEngine.reset();
    const gen = mocksEngine.generateTournamentRecord({
      tournamentName: 'chain-test',
      participants,
      eventProfiles: [
        {
          eventName: 'Singles',
          eventType: SINGLES,
          gender: MALE,
          drawProfiles: [
            {
              drawSize: 4,
              drawName: 'Main',
              eventType: SINGLES,
              matchUpType: SINGLES,
              participantsCount: 4,
              automated: false,
              idPrefix: 'cze',
            },
          ],
        },
      ],
      setState: true,
    });
    expect(gen.success).toEqual(true);

    const drawId = gen.drawIds[0];
    const tr0 = tournamentEngine.getState().tournamentRecords[gen.tournamentRecord.tournamentId];
    const structureId = tr0.events[0].drawDefinitions[0].structures[0].structureId;

    for (let dp = 1; dp <= 4; dp += 1) {
      const r = tournamentEngine.assignDrawPosition({
        drawId,
        structureId,
        drawPosition: dp,
        participantId: `CZE100${dp}`,
      });
      expect(r.success).toEqual(true);
    }

    const tr1 = tournamentEngine.getState().tournamentRecords[gen.tournamentRecord.tournamentId];
    const matchUps = tr1.events[0].drawDefinitions[0].structures[0].matchUps;
    const r1 = matchUps.filter((m) => m.roundNumber === 1).sort((a, b) => a.roundPosition - b.roundPosition);
    for (const mu of r1) {
      const r = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId: mu.matchUpId,
        matchUpStatus: 'COMPLETED',
        outcome: { winningSide: 1, scoreString: '6-3 6-2' },
      });
      expect(r.success).toEqual(true);
    }
    // Winners of R1 land at correct positions in R2
    const tr2 = tournamentEngine.getState().tournamentRecords[gen.tournamentRecord.tournamentId];
    const r2 = tr2.events[0].drawDefinitions[0].structures[0].matchUps.filter((m) => m.roundNumber === 2);
    expect(r2.length).toEqual(1);
    expect(r2[0].drawPositions).toEqual([1, 3]);
  });

  test('DOUBLES: supplied PAIR participants populate entries', () => {
    const individuals: any[] = [];
    for (let i = 1; i <= 8; i += 1) {
      individuals.push({
        participantId: `IND${i}`,
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        participantName: `Player ${i}`,
        person: { personId: `IND${i}`, sex: MALE, nationalityCode: 'XYZ' },
      });
    }
    const pairs: any[] = [];
    for (let i = 0; i < 4; i += 1) {
      const a = `IND${i * 2 + 1}`;
      const b = `IND${i * 2 + 2}`;
      pairs.push({
        participantId: `PAIR-${a}-${b}`,
        participantType: PAIR,
        participantRole: COMPETITOR,
        participantName: `${a} / ${b}`,
        individualParticipantIds: [a, b],
      });
    }

    const result = mocksEngine.generateTournamentRecord({
      tournamentName: 'doubles-preset',
      participants: [...individuals, ...pairs],
      eventProfiles: [
        {
          eventName: 'Doubles',
          eventType: DOUBLES,
          gender: MALE,
          drawProfiles: [
            {
              drawSize: 4,
              drawName: 'Main',
              eventType: DOUBLES,
              matchUpType: DOUBLES,
              participantsCount: 4,
              automated: false,
              idPrefix: 'd',
            },
          ],
        },
      ],
    });

    expect(result.success).toEqual(true);
    const tr = result.tournamentRecord;
    // All 8 individuals + 4 pairs preserved, nothing synthesized
    expect(tr.participants.length).toEqual(12);
    const pairIds = new Set(pairs.map((p) => p.participantId));
    const event = tr.events[0];
    // Event entries are the PAIR participants
    expect(event.entries.length).toEqual(4);
    for (const entry of event.entries) expect(pairIds.has(entry.participantId)).toEqual(true);
  });

  // Regression: multiple events spanning different genders in ONE preset call.
  // Previously failed with ERR_INVALID_PARTICIPANT_IDS / mismatchedGender — the
  // flights selection path (getStageParticipants) ignored event gender and did
  // not track consumed participants, so the Girls event re-selected the males.
  function buildPairs(individuals: any[], prefix: string) {
    const pairs: any[] = [];
    for (let i = 0; i < individuals.length; i += 2) {
      const a = individuals[i].participantId;
      const b = individuals[i + 1].participantId;
      pairs.push({
        participantId: `${prefix}-${a}-${b}`,
        participantType: PAIR,
        participantRole: COMPETITOR,
        participantName: `${a} / ${b}`,
        individualParticipantIds: [a, b],
      });
    }
    return pairs;
  }

  function sexOf(tr: any, participantId: string): string | undefined {
    const p = tr.participants.find((x: any) => x.participantId === participantId);
    if (p?.participantType === INDIVIDUAL) return p.person?.sex;
    const memberId = p?.individualParticipantIds?.[0];
    return tr.participants.find((x: any) => x.participantId === memberId)?.person?.sex;
  }

  test('multi-gender: Boys/Girls Singles + Boys/Girls Doubles in one call', () => {
    const boys = buildIndividuals(8, MALE, 'B');
    const girls = buildIndividuals(8, FEMALE, 'G');
    const boyPairs = buildPairs(boys, 'BP');
    const girlPairs = buildPairs(girls, 'GP');

    function singlesEvent(name: string, gender: string) {
      return {
        eventName: name,
        eventType: SINGLES,
        gender,
        drawProfiles: [
          {
            drawSize: 8,
            drawName: name,
            eventType: SINGLES,
            matchUpType: SINGLES,
            participantsCount: 8,
            automated: false,
          },
        ],
      };
    }
    function doublesEvent(name: string, gender: string) {
      return {
        eventName: name,
        eventType: DOUBLES,
        gender,
        drawProfiles: [
          {
            drawSize: 4,
            drawName: name,
            eventType: DOUBLES,
            matchUpType: DOUBLES,
            participantsCount: 4,
            automated: false,
          },
        ],
      };
    }

    const result = mocksEngine.generateTournamentRecord({
      tournamentName: 'multi-gender',
      participants: [...boys, ...girls, ...boyPairs, ...girlPairs],
      eventProfiles: [
        singlesEvent('Boys Singles', MALE),
        singlesEvent('Girls Singles', FEMALE),
        doublesEvent('Boys Doubles', MALE),
        doublesEvent('Girls Doubles', FEMALE),
      ],
    });

    expect(result.success).toEqual(true);
    const tr = result.tournamentRecord;
    expect(tr.events.length).toEqual(4);

    // Every entry in every event matches the event's gender.
    for (const event of tr.events) {
      expect(event.entries.length).toBeGreaterThan(0);
      for (const entry of event.entries) {
        expect(sexOf(tr, entry.participantId)).toEqual(event.gender);
      }
    }

    // Singles events between them consume all 16 distinct individuals — no
    // double-booking, no gender skipped.
    const singlesEntryIds = tr.events
      .filter((e: any) => e.eventType === SINGLES)
      .flatMap((e: any) => e.entries.map((en: any) => en.participantId));
    expect(new Set(singlesEntryIds).size).toEqual(16);
  });

  test('gender filter overrides pool order (gender, not position, selects)', () => {
    // Females FIRST in the pool, then males; a single Boys event must still
    // select the males.
    const girls = buildIndividuals(8, FEMALE, 'G');
    const boys = buildIndividuals(8, MALE, 'B');

    const result = mocksEngine.generateTournamentRecord({
      tournamentName: 'order-test',
      participants: [...girls, ...boys],
      eventProfiles: [
        {
          eventName: 'Boys Singles',
          eventType: SINGLES,
          gender: MALE,
          drawProfiles: [
            {
              drawSize: 8,
              drawName: 'Main',
              eventType: SINGLES,
              matchUpType: SINGLES,
              participantsCount: 8,
              automated: false,
            },
          ],
        },
      ],
    });

    expect(result.success).toEqual(true);
    const event = result.tournamentRecord.events[0];
    expect(event.entries.length).toEqual(8);
    for (const entry of event.entries) expect(entry.participantId.startsWith('B')).toEqual(true);
  });
});
