import { getExtensionAnomalies } from '@Query/tournaments/getExtensionAnomalies';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, describe, it } from 'vitest';

// constants and types
import { DRAW_DEFINITION, EVENT, STRUCTURE, TOURNAMENT_RECORD, VENUE } from '@Constants/attributeConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

/**
 * Duplicate extension names are unreachable data: every reader resolves with `.find()`, so only the
 * FIRST extension of a name is ever seen. `addExtension` maintains one-per-name, which is why a
 * record built through the API cannot trip this — and why the detector has to be fed a record built
 * by hand to have anything to find.
 *
 * That asymmetry is the point of the first test: it proves the API upholds the invariant, so the
 * detector is aimed at genuinely-external data rather than at a defect in the factory.
 */

const AVOIDANCE = { policyAttributes: [{ directive: 'groupParticipants' }] };

describe('the API upholds one-extension-per-name', () => {
  it('replaces in place rather than appending a second', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.attachPolicies({ policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: AVOIDANCE } });
    tournamentEngine.attachPolicies({
      policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: { ...AVOIDANCE, policyName: 'second' } },
      allowReplacement: true,
    });

    const record = tournamentEngine.getTournament().tournamentRecord;
    const applied = (record.extensions ?? []).filter((e: any) => e.name === APPLIED_POLICIES);
    expect(applied.length).toEqual(1);
    expect(getExtensionAnomalies({ tournamentRecord: record })).toEqual([]);
  });
});

describe('getExtensionAnomalies', () => {
  it('reports a duplicate, and the duplicate really is unreachable', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const record = tournamentEngine.getTournament().tournamentRecord;

    // Built by hand, exactly as an importer or legacy converter would.
    record.extensions = record.extensions ?? [];
    record.extensions.push({ name: APPLIED_POLICIES, value: { [POLICY_TYPE_AVOIDANCE]: AVOIDANCE } });
    record.extensions.push({ name: APPLIED_POLICIES, value: { [POLICY_TYPE_AVOIDANCE]: { policyName: 'ignored' } } });

    const anomalies = getExtensionAnomalies({ tournamentRecord: record });
    expect(anomalies.length).toEqual(1);
    expect(anomalies[0].elementType).toEqual(TOURNAMENT_RECORD);
    expect(anomalies[0].duplicateNames).toEqual([{ name: APPLIED_POLICIES, occurrences: 2 }]);

    // The consequence, asserted rather than assumed: the SECOND value is the one nobody reads.
    const applied = getAppliedPolicies({ tournamentRecord: record }).appliedPolicies;
    expect(applied?.[POLICY_TYPE_AVOIDANCE]?.policyName).toBeUndefined();
    expect(applied?.[POLICY_TYPE_AVOIDANCE]?.policyAttributes).toBeDefined();
  });

  it('finds duplicates on nested elements and names the element', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ courtsCount: 2 }],
      setState: true,
    });
    const record = tournamentEngine.getTournament().tournamentRecord;

    const event = record.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const structure = drawDefinition.structures[0];
    const venue = record.venues[0];

    for (const element of [event, drawDefinition, structure, venue]) {
      element.extensions = element.extensions ?? [];
      element.extensions.push({ name: 'dupe', value: 1 });
      element.extensions.push({ name: 'dupe', value: 2 });
    }

    const anomalies = getExtensionAnomalies({ tournamentRecord: record });
    const byType = Object.fromEntries(anomalies.map((a) => [a.elementType, a]));

    expect(byType[EVENT]?.elementId).toEqual(event.eventId);
    expect(byType[DRAW_DEFINITION]?.elementId).toEqual(drawDefinition.drawId);
    expect(byType[STRUCTURE]?.elementId).toEqual(structure.structureId);
    expect(byType[VENUE]?.elementId).toEqual(venue.venueId);
  });

  it('is quiet on a clean record — three occurrences of DIFFERENT names are not an anomaly', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });
    const record = tournamentEngine.getTournament().tournamentRecord;
    record.extensions = [
      { name: 'alpha', value: 1 },
      { name: 'beta', value: 2 },
      { name: 'gamma', value: 3 },
    ];
    expect(getExtensionAnomalies({ tournamentRecord: record })).toEqual([]);
  });
});

describe('analyzeTournament surfaces it', () => {
  it('analyzes a tournament with no events at all', () => {
    // Regression: `analyzeDraws` built `eventDraws` with `events?.flatMap(...)` and then called
    // `.forEach` on it unguarded, so an event-less tournament threw rather than analyzing empty.
    // A created-but-not-yet-built-out tournament is ordinary, and it is exactly what the detector
    // above is most likely to be pointed at during an import.
    mocksEngine.generateTournamentRecord({ setState: true });
    const result: any = tournamentEngine.analyzeTournament();
    expect(result.error).toBeUndefined();
    expect(result.analysis).toBeDefined();
  });

  it('omits extensionAnomalies when clean and includes it when not', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const clean: any = tournamentEngine.analyzeTournament();
    expect(clean.analysis.extensionAnomalies).toBeUndefined();

    const record = tournamentEngine.getTournament().tournamentRecord;
    record.extensions = record.extensions ?? [];
    record.extensions.push({ name: 'dupe', value: 1 });
    record.extensions.push({ name: 'dupe', value: 2 });
    tournamentEngine.setState(record);

    const dirty: any = tournamentEngine.analyzeTournament();
    expect(dirty.analysis.extensionAnomalies?.length).toEqual(1);
    expect(dirty.analysis.extensionAnomalies[0].duplicateNames[0].name).toEqual('dupe');
  });
});
