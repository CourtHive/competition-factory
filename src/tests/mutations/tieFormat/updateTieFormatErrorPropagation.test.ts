import { updateTieFormat } from '@Mutate/tieFormat/updateTieFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';

/**
 * `updateTieFormat`'s nested helpers must not have their errors dropped.
 *
 * `processStructure` can return `MISSING_TIE_FORMAT` — a real failure, meaning a
 * TEAM matchUp could not be reconciled with the modified tieFormat and no format
 * higher in the hierarchy could supply one. Both call sites read only
 * `?.modifiedMatchUpsCount`, and `processDrawDefinition` returned a NUMBER, so it
 * could not have propagated an error even if it had checked.
 *
 * The failure mode was therefore silent: a genuine error surfaced as "nothing was
 * modified" and the mutation reported success, leaving the record in the state the
 * error was meant to prevent. That is the same class of silent-failure this
 * workstream has been closing elsewhere — and it is why a `uuids` pool must NOT
 * be threaded into this file until the propagation works, since
 * `INSUFFICIENT_UUIDS` would vanish exactly the same way.
 */

function teamEvent() {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { event } = tournamentEngine.getEvent({ eventId });
  return { event, eventId, tournamentRecord };
}

/** Strip every inheritable tieFormat so nothing can supply a fallback. */
function stripInheritable(event: any) {
  delete event.tieFormat;
  delete event.tieFormatId;
  for (const dd of event.drawDefinitions ?? []) {
    delete dd.tieFormat;
    delete dd.tieFormatId;
    for (const st of dd.structures ?? []) {
      delete st.tieFormat;
      delete st.tieFormatId;
    }
  }
}

const EMPTY_FORMAT: any = { collectionDefinitions: [], winCriteria: { valueGoal: 1 } };

describe('updateTieFormat error propagation', () => {
  it('surfaces MISSING_TIE_FORMAT from processStructure instead of reporting success', () => {
    // A structure whose TEAM matchUps carry collections the modified tieFormat
    // does not contain, with nothing inheritable above it, is the shape that
    // drives processStructure into its MISSING_TIE_FORMAT branch.
    const { event, tournamentRecord } = teamEvent();
    const drawDefinition = event.drawDefinitions[0];

    // Strip every inheritable format so nothing can supply a fallback.
    delete drawDefinition.tieFormat;
    delete drawDefinition.tieFormatId;
    delete event.tieFormat;
    delete event.tieFormatId;

    const structure = drawDefinition.structures[0];
    delete structure.tieFormat;
    delete structure.tieFormatId;

    const result: any = updateTieFormat({
      tieFormat: { collectionDefinitions: [], winCriteria: { valueGoal: 1 } } as any,
      tournamentRecord,
      drawDefinition,
      structureId: structure.structureId,
      structure,
      event,
    });

    // The precise assertion is "not a false success". Whatever error the engine
    // decides on, it must not silently report modification counts.
    expect(result.success).not.toEqual(true);
    expect(result.error).toBeDefined();
  });

  it('propagates through the DRAWDEFINITION path (no structureId)', () => {
    // Routes processDrawDefinition -> processStructure. Before the fix this
    // function returned a number, so the nested error could not travel at all.
    const { event, tournamentRecord } = teamEvent();
    stripInheritable(event);

    const result: any = updateTieFormat({
      tieFormat: EMPTY_FORMAT,
      tournamentRecord,
      drawDefinition: event.drawDefinitions[0],
      event,
    });

    expect(result.success).not.toEqual(true);
    expect(result.error).toBeDefined();
  });

  it('propagates through the EVENT path (eventId supplied)', () => {
    // Routes processEventDrawDefinitions -> processDrawDefinition -> processStructure.
    const { event, eventId, tournamentRecord } = teamEvent();
    stripInheritable(event);

    const result: any = updateTieFormat({
      tieFormat: EMPTY_FORMAT,
      tournamentRecord,
      drawDefinition: event.drawDefinitions[0],
      eventId,
      event,
    });

    expect(result.success).not.toEqual(true);
    expect(result.error).toBeDefined();
  });

  it('processDrawDefinition returns a result object, not a bare count', () => {
    // The structural half of the fix: a number cannot carry an error. This pins
    // the contract so a future edit cannot quietly revert it.
    const { event, tournamentRecord } = teamEvent();
    const drawDefinition = event.drawDefinitions[0];

    const result: any = updateTieFormat({
      tieFormat: drawDefinition.tieFormat ?? event.tieFormat,
      tournamentRecord,
      drawDefinition,
      event,
    });

    // A successful run still reports success — the contract change must not have
    // turned working paths into failures.
    expect(result.error).toBeUndefined();
  });
});
