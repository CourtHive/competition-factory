import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * A TEAM line's format resolves through its dual (CA 2026-10-26, hydration OPEN-4): the line's own tieFormat, else
 * the dual's, which falls back to the structure, the draw and the event; a collection with no format falls back along
 * the same chain; and a tieFormatId is looked up before any inline default.
 */
function teamRecord() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }], setState: true });
  const record = tournamentEngine.getTournament().tournamentRecord;
  const event = record.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const duals = drawDefinition.structures[0].matchUps.filter((m: any) => m.matchUpType === TEAM);
  const tieFormat = event.tieFormat ?? drawDefinition.tieFormat;
  expect(tieFormat?.collectionDefinitions?.length).toBeGreaterThan(0);
  return { drawId, record, event, drawDefinition, duals, tieFormat };
}

const linesOf = (drawId: string, dualId: string) =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.filter((m: any) => m.matchUpTieId === dualId);

describe('a line resolves its format through its dual', () => {
  it('a tieFormat set on the dual reaches its lines; other duals keep theirs', () => {
    const { drawId, record, duals, tieFormat } = teamRecord();
    const [first, second] = duals;
    const collectionId = tieFormat.collectionDefinitions[0].collectionId;
    const dualTieFormat = structuredClone(tieFormat);
    dualTieFormat.collectionDefinitions[0].matchUpFormat = 'SET1-S:4/TB7';
    first.tieFormat = dualTieFormat;
    for (const line of first.tieMatchUps) delete line.tieFormat;
    tournamentEngine.setState(record);

    const lineOf = (dualId: string) => linesOf(drawId, dualId).find((m: any) => m.collectionId === collectionId);
    expect(lineOf(first.matchUpId).matchUpFormat).toEqual('SET1-S:4/TB7');
    expect(lineOf(second.matchUpId).matchUpFormat).toEqual(tieFormat.collectionDefinitions[0].matchUpFormat);
  });

  it('a collection without a format falls back to the draw’s, not straight to the event’s', () => {
    const { drawId, record, event, drawDefinition, duals, tieFormat } = teamRecord();
    const collectionId = tieFormat.collectionDefinitions[0].collectionId;
    for (const holder of [event, drawDefinition]) {
      const own = holder.tieFormat?.collectionDefinitions?.find((c: any) => c.collectionId === collectionId);
      if (own) delete own.matchUpFormat;
    }
    drawDefinition.matchUpFormat = 'SET1-S:6/TB7';
    event.matchUpFormat = 'SET1-S:8/TB7';
    tournamentEngine.setState(record);

    const line = linesOf(drawId, duals[0].matchUpId).find((m: any) => m.collectionId === collectionId);
    expect(line.matchUpFormat).toEqual('SET1-S:6/TB7');
  });

  it('a dual’s tieFormatId is looked up before the draw’s inline tieFormat', () => {
    const { drawId, record, drawDefinition, duals, tieFormat } = teamRecord();
    const collectionId = tieFormat.collectionDefinitions[0].collectionId;
    const referenced = structuredClone(tieFormat);
    referenced.tieFormatId = 'referenced';
    referenced.collectionDefinitions[0].matchUpFormat = 'SET1-S:4NOAD';
    drawDefinition.tieFormat = structuredClone(tieFormat);
    drawDefinition.tieFormats = [referenced];
    delete duals[0].tieFormat;
    duals[0].tieFormatId = 'referenced';
    tournamentEngine.setState(record);

    const line = linesOf(drawId, duals[0].matchUpId).find((m: any) => m.collectionId === collectionId);
    expect(line.matchUpFormat).toEqual('SET1-S:4NOAD');
  });
});
