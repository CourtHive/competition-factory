import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * `usePublishState` must honour DISCRETE structure publishing.
 *
 * The filter read `!usePublishState || isVisiblyPublished(detail) || true`, which is unconditionally
 * true — the `isVisiblyPublished` call was dead and a structure explicitly marked
 * `{ published: false }` was returned anyway. Its comment said "default to true when no
 * structureDetails are found"; the code defaulted to true always.
 *
 * The legacy behaviour the comment describes is preserved: a structure with NO detail is visible.
 */

function publishedDrawWithOneHiddenStructure() {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: COMPASS, participantsCount: 16 }],
    setState: true,
  });
  const drawId = drawIds[0];
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const structureIds = (drawDefinition.structures ?? []).map((structure: any) => structure.structureId);
  // the control: the scenario needs more than one structure for "one hidden" to mean anything
  expect(structureIds.length).toBeGreaterThan(1);

  return {
    tournamentRecord,
    drawDefinition,
    structureIds,
    event,
    drawId,
    publishStatus: { drawDetails: { [drawId]: { publishingDetail: { published: true } } } },
  };
}

const read = (setup: any, structureDetails: any) =>
  getDrawData({
    eventPublishState: {
      status: { published: true, drawDetails: { [setup.drawId]: { published: true, structureDetails } } },
    },
    drawDefinition: setup.drawDefinition,
    tournamentRecord: setup.tournamentRecord,
    publishStatus: setup.publishStatus,
    usePublishState: true,
    event: setup.event,
  } as any);

it('omits a structure explicitly marked not published', () => {
  const setup = publishedDrawWithOneHiddenStructure();
  const hidden = setup.structureIds[0];
  // the control that matters: the predicate itself must consider this invisible, or the test is
  // asserting nothing about the filter
  expect(isVisiblyPublished({ published: false } as any)).toEqual(false);

  const structureDetails = Object.fromEntries(
    setup.structureIds.map((id: string) => [id, { published: id !== hidden }]),
  );
  const result: any = read(setup, structureDetails);
  const returned = (result?.structures ?? []).map((structure: any) => structure.structureId);

  expect(returned.length).toBeGreaterThan(0);
  expect(returned).not.toContain(hidden);
  expect(returned.length).toEqual(setup.structureIds.length - 1);
});

it('keeps a structure that has no publishing detail — the legacy shape', () => {
  const setup = publishedDrawWithOneHiddenStructure();
  const result: any = read(setup, undefined);
  const returned = (result?.structures ?? []).map((structure: any) => structure.structureId);
  expect(returned.length).toEqual(setup.structureIds.length);
});
