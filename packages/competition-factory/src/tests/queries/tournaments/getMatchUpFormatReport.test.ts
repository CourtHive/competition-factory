import { FORMAT_LOCATION, FORMAT_VERDICT, getMatchUpFormatReport } from '@Query/tournaments/getMatchUpFormatReport';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import {
  MATCHUP_FORMAT_MALFORMED,
  MATCHUP_FORMAT_REFUSED_FOR_NEW_USE,
} from '@Query/tournaments/getTournamentInconsistencies';

// constants and types
import { POLICY_TYPE_SANCTIONING, POLICY_TYPE_SCHEDULING, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { APPLIED_POLICIES, SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const VALID_CODE = 'SET3-S:6/TB7';
// well-formed, refused for new use: an implicit best-of with an even count
const REFUSED_CODE = 'SET2-S:6/TB7';
const MALFORMED_CODE = 'NOT-A-FORMAT';

/** a singles round robin and a team elimination draw: nested structures, matchUps, tieMatchUps and a tieFormat */
function generate() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }] },
      { eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO, drawProfiles: [{ drawSize: 4 }] },
    ],
  });
  return tournamentRecord;
}

/** reads a report `path` back out of the record, so every entry is checked against what is actually stored */
function resolve(tournamentRecord: any, path: string) {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  let value: any = { tournamentRecord };
  for (const key of keys) value = value?.[key];
  return value;
}

describe('getMatchUpFormatReport', () => {
  it('requires a tournament record', () => {
    const result: any = getMatchUpFormatReport({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('reports a generated record clean, and every path resolves to its code', () => {
    const tournamentRecord = generate();
    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.getMatchUpFormatReport();
    expect(result.success).toEqual(true);
    expect(result.counts.MALFORMED).toEqual(0);
    expect(result.counts.REFUSED_FOR_NEW_USE).toEqual(0);
    // the control: the walker reached the codes a generated record holds, so a clean count is not an empty walk
    expect(result.counts.VALID).toEqual(result.entries.length);
    const locations = new Set(result.entries.map((entry) => entry.location));
    // a generated matchUp inherits its format and stores none, so the reach into matchUps is proven by the next test
    expect(locations.has(FORMAT_LOCATION.COLLECTION_DEFINITION)).toEqual(true);
    for (const entry of result.entries) expect(resolve(tournamentRecord, entry.path)).toEqual(entry.matchUpFormat);
  });

  it('finds one malformed code at each location, with its path and ids', () => {
    const tournamentRecord: any = generate();
    const [singles, team] = tournamentRecord.events;
    const singlesDraw = singles.drawDefinitions[0];
    const container = singlesDraw.structures[0];
    const group = container.structures[0];
    const groupMatchUp = group.matchUps[0];
    const teamDraw = team.drawDefinitions[0];
    const teamStructure = teamDraw.structures[0];
    const tieMatchUp = teamStructure.matchUps[0].tieMatchUps[0];
    const timing = { matchUpAverageTimes: [{ matchUpFormatCodes: [VALID_CODE, MALFORMED_CODE], averageTimes: [] }] };
    const legacyTieFormat = structuredClone(team.tieFormat);
    legacyTieFormat.tieFormatId = 'catalog-1';
    legacyTieFormat.collectionDefinitions[0].matchUpFormat = MALFORMED_CODE;

    singles.matchUpFormat = MALFORMED_CODE;
    singles.competitionFormat = { matchUpFormat: MALFORMED_CODE };
    singles.extensions = [...(singles.extensions ?? []), { name: SCHEDULE_TIMING, value: timing }];
    singlesDraw.matchUpFormat = MALFORMED_CODE;
    container.matchUpFormat = MALFORMED_CODE;
    group.matchUpFormat = MALFORMED_CODE;
    groupMatchUp.matchUpFormat = MALFORMED_CODE;
    team.tieFormat.collectionDefinitions[1].matchUpFormat = MALFORMED_CODE;
    team.tieFormats = [legacyTieFormat];
    tieMatchUp.matchUpFormat = MALFORMED_CODE;
    tournamentRecord.scheduling = { ...tournamentRecord.scheduling, timing };
    tournamentRecord.appliedPolicies = {
      [POLICY_TYPE_SCORING]: { defaultMatchUpFormat: MALFORMED_CODE, matchUpFormats: [{ matchUpFormat: VALID_CODE }] },
    };
    team.appliedPolicies = { [POLICY_TYPE_SANCTIONING]: { tiers: [{ allowedMatchUpFormats: [MALFORMED_CODE] }] } };
    // the legacy extension form, which the reader takes only when the first-class attribute is absent
    delete teamDraw.appliedPolicies;
    teamDraw.extensions = [
      ...(teamDraw.extensions ?? []),
      { name: APPLIED_POLICIES, value: { [POLICY_TYPE_SCHEDULING]: timing } },
    ];
    tournamentRecord.matchUps = [{ matchUpId: 'orphan', matchUpFormat: MALFORMED_CODE }];

    const result: any = getMatchUpFormatReport({ tournamentRecord });
    const malformed = result.entries.filter((entry) => entry.verdict === FORMAT_VERDICT.MALFORMED);
    for (const entry of result.entries) expect(resolve(tournamentRecord, entry.path)).toEqual(entry.matchUpFormat);

    const found = (location, ids) =>
      malformed.filter(
        (entry) => entry.location === location && Object.entries(ids).every(([k, v]) => entry.ids[k] === v),
      );
    const { eventId } = singles;
    const { drawId } = singlesDraw;
    const teamIds = { eventId: team.eventId, drawId: teamDraw.drawId };

    expect(found(FORMAT_LOCATION.EVENT, { eventId })).toHaveLength(1);
    expect(found(FORMAT_LOCATION.COMPETITION_FORMAT, { eventId })).toHaveLength(1);
    expect(found(FORMAT_LOCATION.DRAW_DEFINITION, { eventId, drawId })).toHaveLength(1);
    expect(found(FORMAT_LOCATION.STRUCTURE, { drawId, structureId: container.structureId })).toHaveLength(1);
    expect(found(FORMAT_LOCATION.STRUCTURE, { drawId, structureId: group.structureId })).toHaveLength(1);
    expect(
      found(FORMAT_LOCATION.MATCHUP, { structureId: group.structureId, matchUpId: groupMatchUp.matchUpId }),
    ).toHaveLength(1);
    expect(found(FORMAT_LOCATION.MATCHUP, { ...teamIds, matchUpId: tieMatchUp.matchUpId })).toHaveLength(1);
    expect(found(FORMAT_LOCATION.MATCHUP, { matchUpId: 'orphan' })).toHaveLength(1);

    const collectionId = team.tieFormat.collectionDefinitions[1].collectionId;
    expect(found(FORMAT_LOCATION.COLLECTION_DEFINITION, { eventId: team.eventId, collectionId })).toHaveLength(1);
    const catalog = found(FORMAT_LOCATION.COLLECTION_DEFINITION, { tieFormatId: 'catalog-1' });
    expect(catalog).toHaveLength(1);
    expect(catalog[0].path).toEqual('tournamentRecord.events[1].tieFormats[0].collectionDefinitions[0].matchUpFormat');

    const scheduleTiming = found(FORMAT_LOCATION.SCHEDULE_TIMING, {});
    expect(scheduleTiming.map((entry) => entry.ids.eventId)).toEqual([undefined, eventId]);
    expect(scheduleTiming[0].path).toEqual(
      'tournamentRecord.scheduling.timing.matchUpAverageTimes[0].matchUpFormatCodes[1]',
    );

    const scoring = found(FORMAT_LOCATION.SCORING_POLICY, {});
    expect(scoring.map((entry) => entry.path)).toEqual([
      'tournamentRecord.appliedPolicies.scoring.defaultMatchUpFormat',
    ]);
    expect(found(FORMAT_LOCATION.SANCTIONING_POLICY, { eventId: team.eventId })).toHaveLength(1);
    const scheduling = found(FORMAT_LOCATION.SCHEDULING_POLICY, teamIds);
    expect(scheduling).toHaveLength(1);
    expect(scheduling[0].path).toMatch(
      /drawDefinitions\[0\]\.extensions\[\d+\]\.value\.scheduling\.matchUpAverageTimes/,
    );

    // nothing else is malformed: each injection is found exactly once and nowhere else
    expect(result.counts.MALFORMED).toEqual(15);
    expect(malformed).toHaveLength(15);
  });

  it('reads applied policies as getAppliedPolicies does: an extension behind a first-class attribute is not read', () => {
    const tournamentRecord: any = generate();
    const [singles] = tournamentRecord.events;
    singles.appliedPolicies = { [POLICY_TYPE_SCORING]: { defaultMatchUpFormat: VALID_CODE } };
    singles.extensions = [
      ...(singles.extensions ?? []),
      { name: APPLIED_POLICIES, value: { [POLICY_TYPE_SCORING]: { defaultMatchUpFormat: MALFORMED_CODE } } },
    ];

    const result: any = getMatchUpFormatReport({ tournamentRecord });
    const scoring = result.entries.filter((entry) => entry.location === FORMAT_LOCATION.SCORING_POLICY);
    expect(scoring).toHaveLength(1);
    expect(scoring[0]).toMatchObject({
      path: 'tournamentRecord.events[0].appliedPolicies.scoring.defaultMatchUpFormat',
      verdict: FORMAT_VERDICT.VALID,
    });
    expect(result.counts.MALFORMED).toEqual(0);
  });

  it('keeps the two tiers apart and never conflates a refused code with a malformed one', () => {
    const tournamentRecord: any = generate();
    const [singles] = tournamentRecord.events;
    singles.matchUpFormat = REFUSED_CODE;
    singles.drawDefinitions[0].matchUpFormat = 42;
    singles.drawDefinitions[0].structures[0].matchUpFormat = null;

    const result: any = getMatchUpFormatReport({ tournamentRecord });
    const refused = result.entries.filter((entry) => entry.verdict === FORMAT_VERDICT.REFUSED_FOR_NEW_USE);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ location: FORMAT_LOCATION.EVENT, matchUpFormat: REFUSED_CODE });
    expect(refused[0].info).toContain('odd count');

    // a non-string is malformed; a null is absent, not reported
    const malformed = result.entries.filter((entry) => entry.verdict === FORMAT_VERDICT.MALFORMED);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatchObject({ location: FORMAT_LOCATION.DRAW_DEFINITION, matchUpFormat: 42 });
    const structureEntries = result.entries.filter((entry) => entry.location === FORMAT_LOCATION.STRUCTURE);
    expect(structureEntries.every((entry) => entry.matchUpFormat !== null)).toEqual(true);

    expect(result.counts).toEqual({
      VALID: result.entries.length - 2,
      REFUSED_FOR_NEW_USE: 1,
      MALFORMED: 1,
    });
  });
});

describe('getTournamentInconsistencies: matchUpFormat findings', () => {
  const formatFindings = (result) =>
    result.inconsistencies.filter((inconsistency) =>
      [MATCHUP_FORMAT_MALFORMED, MATCHUP_FORMAT_REFUSED_FOR_NEW_USE].includes(inconsistency.issueType),
    );

  it('reports nothing for a generated record', () => {
    tournamentEngine.setState(generate());
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toEqual(true);
    expect(formatFindings(result)).toEqual([]);
  });

  it('a malformed code is an error, and the codes on one element are one finding', () => {
    const tournamentRecord: any = generate();
    const [singles] = tournamentRecord.events;
    const group = singles.drawDefinitions[0].structures[0].structures[0];
    singles.matchUpFormat = MALFORMED_CODE;
    singles.competitionFormat = { matchUpFormat: '' };
    group.matchUpFormat = MALFORMED_CODE;

    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toEqual(false);

    const findings = formatFindings(result);
    expect(findings).toHaveLength(2);
    const eventFinding = findings.find((finding) => finding.scope === 'EVENT');
    expect(eventFinding).toMatchObject({
      issueType: MATCHUP_FORMAT_MALFORMED,
      severity: 'error',
      tournamentId: tournamentRecord.tournamentId,
      eventId: singles.eventId,
    });
    expect(eventFinding.matchUpFormats.map((format) => format.location)).toEqual([
      FORMAT_LOCATION.EVENT,
      FORMAT_LOCATION.COMPETITION_FORMAT,
    ]);
    // an empty string is malformed, and the finding keeps it as stored
    expect(eventFinding.matchUpFormats[1].matchUpFormat).toEqual('');
    expect(eventFinding.message).toContain(MALFORMED_CODE);

    const structureFinding = findings.find((finding) => finding.scope === 'STRUCTURE');
    expect(structureFinding).toMatchObject({
      issueType: MATCHUP_FORMAT_MALFORMED,
      eventId: singles.eventId,
      drawId: singles.drawDefinitions[0].drawId,
      structureId: group.structureId,
    });
    expect(eventFinding.fingerprint).not.toEqual(structureFinding.fingerprint);
  });

  it('a refused code is a warning and leaves the record valid', () => {
    const tournamentRecord: any = generate();
    tournamentRecord.events[0].drawDefinitions[0].matchUpFormat = REFUSED_CODE;

    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toEqual(true);
    const findings = formatFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      issueType: MATCHUP_FORMAT_REFUSED_FOR_NEW_USE,
      severity: 'warning',
      scope: 'DRAW',
      drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
    });
    expect(findings[0].matchUpFormats[0].info).toContain('odd count');
  });
});

describe('analyzeTournament: matchUpFormatIssues', () => {
  it('is absent for a clean record and lists only the issues otherwise', () => {
    const tournamentRecord: any = generate();
    tournamentEngine.setState(tournamentRecord);
    let result: any = tournamentEngine.analyzeTournament();
    expect(result.analysis.matchUpFormatIssues).toBeUndefined();

    tournamentRecord.events[0].matchUpFormat = MALFORMED_CODE;
    tournamentRecord.events[1].matchUpFormat = REFUSED_CODE;
    tournamentEngine.setState(tournamentRecord);
    result = tournamentEngine.analyzeTournament();
    expect(result.analysis.matchUpFormatIssues.map((entry) => entry.verdict)).toEqual([
      FORMAT_VERDICT.MALFORMED,
      FORMAT_VERDICT.REFUSED_FOR_NEW_USE,
    ]);
  });
});
