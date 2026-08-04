import { resolveMatchUpPublishState } from '@Query/readModel/readModelPublish';
import { expect, it, describe } from 'vitest';

const FUTURE = '2999-01-01T00:00:00.000Z';
const EARLY = '2020-01-01T00:00:00.000Z';
const MID = '2050-01-01T00:00:00.000Z';
const LATE = '2999-06-01T00:00:00.000Z';

describe('resolveMatchUpPublishState', () => {
  it('is unpublished with no status', () => {
    expect(resolveMatchUpPublishState(undefined, 'd1')).toEqual({
      published: false,
      embargo: null,
      scheduleEmbargo: null,
    });
  });

  it('honors a legacy event-level published flag when drawDetails is absent', () => {
    expect(resolveMatchUpPublishState({ published: true }, 'd1')).toEqual({
      published: true,
      embargo: null,
      scheduleEmbargo: null,
    });
    expect(resolveMatchUpPublishState({ published: false }, 'd1')).toEqual({
      published: false,
      embargo: null,
      scheduleEmbargo: null,
    });
  });

  it('resolves the legacy v1 drawIds-array shape per-draw (mirrors getDrawIsPublished)', () => {
    // a listed draw is published; an unlisted one is not.
    expect(resolveMatchUpPublishState({ drawIds: ['d1'] }, 'd1')).toEqual({
      published: true,
      embargo: null,
      scheduleEmbargo: null,
    });
    expect(resolveMatchUpPublishState({ drawIds: ['d1'] }, 'd2')).toEqual({
      published: false,
      embargo: null,
      scheduleEmbargo: null,
    });
    // a stray event-level published:true must NOT over-disclose an unlisted draw.
    expect(resolveMatchUpPublishState({ published: true, drawIds: ['d1'] }, 'd2').published).toBe(false);
  });

  it('treats empty drawDetails as all-published', () => {
    expect(resolveMatchUpPublishState({ drawDetails: {} }, 'd1')).toEqual({
      published: true,
      embargo: null,
      scheduleEmbargo: null,
    });
  });

  it('is unpublished when the draw is enumerated but absent', () => {
    const status = { drawDetails: { other: { publishingDetail: { published: true } } } };
    expect(resolveMatchUpPublishState(status, 'd1')).toEqual({
      published: false,
      embargo: null,
      scheduleEmbargo: null,
    });
  });

  it('publishes a listed draw and carries a draw-level embargo (intent stays true under embargo)', () => {
    const status = { drawDetails: { d1: { publishingDetail: { published: true, embargo: FUTURE } } } };
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN')).toEqual({
      published: true,
      embargo: FUTURE,
      scheduleEmbargo: null,
    });
  });

  it('applies the structure gate: enumerated structures publish only the listed ones', () => {
    const status = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          structureDetails: { sMain: { published: true } },
        },
      },
    };
    expect(resolveMatchUpPublishState(status, 'd1', 'sMain', 'MAIN').published).toBe(true);
    expect(resolveMatchUpPublishState(status, 'd1', 'sQual', 'QUALIFYING').published).toBe(false);
  });

  it('applies the stage gate and explicit published:false', () => {
    const status = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          stageDetails: { MAIN: { published: true }, QUALIFYING: { published: false } },
        },
      },
    };
    expect(resolveMatchUpPublishState(status, 'd1', 's', 'MAIN').published).toBe(true);
    expect(resolveMatchUpPublishState(status, 'd1', 's', 'QUALIFYING').published).toBe(false);
  });

  it('resolves the effective embargo as the LATEST (max) of applicable levels', () => {
    const structureOnly = {
      drawDetails: { d1: { publishingDetail: { published: true }, structureDetails: { s1: { embargo: LATE } } } },
    };
    expect(resolveMatchUpPublishState(structureOnly, 'd1', 's1', 'MAIN').embargo).toEqual(LATE);

    // a lifted/earlier DRAW embargo must NOT mask a later STRUCTURE embargo (the #3 fix):
    // getEventData still hides while the structure embargo is active, so the read model
    // must store the later release, not the higher-precedence one.
    const earlyDrawLateStructure = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true, embargo: EARLY },
          structureDetails: { s1: { embargo: LATE } },
        },
      },
    };
    expect(resolveMatchUpPublishState(earlyDrawLateStructure, 'd1', 's1', 'MAIN').embargo).toEqual(LATE);

    // symmetric: a later DRAW embargo wins over an earlier structure embargo.
    const lateDrawEarlyStructure = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true, embargo: LATE },
          stageDetails: { MAIN: { embargo: MID } },
          structureDetails: { s1: { embargo: EARLY } },
        },
      },
    };
    expect(resolveMatchUpPublishState(lateDrawEarlyStructure, 'd1', 's1', 'MAIN').embargo).toEqual(LATE);

    // the stage level participates in the max too.
    const stageIsLatest = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true, embargo: EARLY },
          stageDetails: { MAIN: { embargo: LATE } },
          structureDetails: { s1: { embargo: MID } },
        },
      },
    };
    expect(resolveMatchUpPublishState(stageIsLatest, 'd1', 's1', 'MAIN').embargo).toEqual(LATE);

    // non-ISO embargo values do not constrain (matches isEmbargoed) → null when none valid.
    const nonIso = {
      drawDetails: { d1: { publishingDetail: { published: true, embargo: 'not-a-date' } } },
    };
    expect(resolveMatchUpPublishState(nonIso, 'd1', 's1', 'MAIN').embargo).toEqual(null);
  });

  it('resolves the round-level scheduledRounds embargo into scheduleEmbargo (#9)', () => {
    const status = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          structureDetails: { s1: { published: true, scheduledRounds: { 2: { embargo: LATE } } } },
        },
      },
    };
    // the embargoed round carries scheduleEmbargo; other rounds do not.
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 2).scheduleEmbargo).toBe(LATE);
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 1).scheduleEmbargo).toBeNull();
    // the matchUp itself stays published (whole-matchUp visibility is unaffected).
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 2).published).toBe(true);
  });

  it('hides rounds beyond a per-structure roundLimit (published:false; the #4 fix)', () => {
    const status = {
      drawDetails: {
        d1: { publishingDetail: { published: true }, structureDetails: { s1: { published: true, roundLimit: 1 } } },
      },
    };
    // round 1 is within the limit → published; rounds beyond it are hidden.
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 1).published).toBe(true);
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 2).published).toBe(false);
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN', 3).published).toBe(false);
    // no roundNumber supplied → the roundLimit gate does not apply (back-compat).
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN').published).toBe(true);
    // no roundLimit set → all rounds published.
    const noLimit = {
      drawDetails: { d1: { publishingDetail: { published: true }, structureDetails: { s1: { published: true } } } },
    };
    expect(resolveMatchUpPublishState(noLimit, 'd1', 's1', 'MAIN', 9).published).toBe(true);
  });
});
