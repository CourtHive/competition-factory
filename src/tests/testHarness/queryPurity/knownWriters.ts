/**
 * Generators that write engine state when the caller asks them to attach what they generate. CA ruled 2026-11-05 that
 * such a call is a mutation: the write is allowed only under the option that asks for it, so the check stays active
 * (any other method that writes fails its test, and so does a listed method writing outside its gate). 8.0.0 splits
 * each into a pure generator and an attach mutation, and the table empties.
 *
 * The defects the check found when it was introduced (2026-11-05: getScenarioScheduleView and four generators
 * announcing writes to their drafts) were fixed with `withDraftWrites` and are not listed.
 *
 * `when`: the call's boolean options under which the write is allowed. `{ attach: true }` allows it only when the caller
 * set `attach`, `{ addEvents: false }` only when the caller set `addEvents: false`, and `{ addEvents: undefined }` unless
 * the caller set `addEvents: false`. No `when`: every call. A method with two kinds of write lists one allowance each.
 *
 * An entry leaves this table in the PR that splits or reclassifies its method (Mentat/planning/FACTORY_LAYERING_PLAN.md,
 * step Q).
 */
export type KnownWriter = {
  when?: Record<string, boolean | undefined>;
  disposition: string;
};

const OPT_IN = 'generates, and also attaches when the caller asks: that call is a mutation (CA 2026-11-05)';

export const KNOWN_WRITERS: Record<string, KnownWriter | KnownWriter[]> = {
  generateLineUps: { when: { attach: true }, disposition: OPT_IN },
  generateFlightProfile: { when: { attachFlightProfile: true }, disposition: OPT_IN },
  drawMatic: { when: { updateParticipantRatings: true }, disposition: OPT_IN },
  generateDrawTypeAndModifyDrawDefinition: { when: { modifyOriginal: true }, disposition: OPT_IN },
  generateEventsFromTieFormat: {
    when: { addEvents: undefined },
    disposition: `${OPT_IN}. Attaches by DEFAULT: only \`addEvents: false\` asks for no write`,
  },
  generateTournamentRecord: {
    disposition:
      'routed through an engine, the mocks generator adds its events to the loaded record (7.15.0 behaviour, pinned ' +
      'by mocksUnknownOptions.test.ts): a mutation call, as an attach is (CA 2026-11-05)',
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
