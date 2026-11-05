/**
 * Queries and generators the purity check found writing engine state when it was introduced (2026-11-05, dev
 * `8f5eb05a9e`, pr-tier suite: 171,087 checked calls). Each is allowed only as described, so the check stays active:
 * any other method that writes fails its test, and so does a listed method writing outside its gate.
 *
 * `when`: the call's boolean options under which the write is allowed. `{ attach: true }` allows it only when the caller
 * set `attach`, `{ addEvents: false }` only when the caller set `addEvents: false`, and `{ addEvents: undefined }` unless
 * the caller set `addEvents: false`. No `when`: every call. A method with two kinds of write lists one allowance each.
 *
 * An entry leaves this table in the PR that fixes or reclassifies its method (Mentat/planning/FACTORY_LAYERING_PLAN.md,
 * steps Q and 10).
 */
export type KnownWriter = {
  when?: Record<string, boolean | undefined>;
  disposition: string;
};

const DRAFT_NOTICES =
  'DEFECT, behaviour PR: builds its structures on a draft with mutate helpers that announce; their notices name a ' +
  'draw that is not attached, reach subscribers, and mark the loaded record modified (it is stamped)';

const OPT_IN =
  'INTENDED, awaiting CA: generates, and also attaches when the caller asks; the write is the attach. Proposed: a ' +
  'generator called with its attach option is a mutation call (this gate), and 8.0.0 splits generate from attach';

export const KNOWN_WRITERS: Record<string, KnownWriter | KnownWriter[]> = {
  generateDrawDefinition: { disposition: DRAFT_NOTICES },
  generateAndPopulatePlayoffStructures: { disposition: DRAFT_NOTICES },
  generateVoluntaryConsolation: { disposition: DRAFT_NOTICES },
  getScenarioScheduleView: {
    disposition:
      'DEFECT, behaviour PR: runs bulkScheduleMatchUps on a draft copy, and the draft writes notices that reach ' +
      'subscribers (the suspected leak of the layering assessment, confirmed)',
  },
  generateLineUps: { when: { attach: true }, disposition: OPT_IN },
  generateFlightProfile: { when: { attachFlightProfile: true }, disposition: OPT_IN },
  drawMatic: { when: { updateParticipantRatings: true }, disposition: OPT_IN },
  generateDrawTypeAndModifyDrawDefinition: { when: { modifyOriginal: true }, disposition: OPT_IN },
  generateEventsFromTieFormat: [
    {
      when: { addEvents: undefined },
      disposition: `${OPT_IN}. Attaches by DEFAULT: only \`addEvents: false\` asks for no write`,
    },
    {
      when: { addEvents: false, addEntriesFromTeams: true },
      disposition: `${DRAFT_NOTICES}: with \`addEvents: false\`, adding team entries to the unattached events announces them`,
    },
  ],
  generateTournamentRecord: {
    disposition:
      'INTENDED, awaiting CA: routed through an engine, the mocks generator adds its events to the loaded record ' +
      '(7.15.0 behaviour, pinned by mocksUnknownOptions.test.ts)',
  },
};

/** Whether a write by `methodName`, on a call with these boolean `options`, is one this table allows. */
export function isKnownWrite(methodName: string, options: Record<string, boolean>): boolean {
  const known = KNOWN_WRITERS[methodName];
  if (!known) return false;
  const gateOpen = ({ when }: KnownWriter) =>
    Object.entries(when ?? {}).every(([option, wanted]) =>
      wanted === undefined ? options[option] !== false : options[option] === wanted,
    );
  return (Array.isArray(known) ? known : [known]).some(gateOpen);
}
