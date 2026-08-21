/**
 * Participant privacy conformance harness.
 *
 * The defect this exists to prevent was never a broken filter — it was an UNASSERTED one. A public
 * endpoint emitted `person.sex` for two and a half years because no test anywhere asserted its
 * absence, and a `sex`-only assertion would have passed the next time a different attribute was
 * widened. So nothing here names an attribute: every check is derived from the policy itself.
 *
 * Two complementary detectors, because neither alone is sufficient:
 *
 *  1. `deriveForbiddenData` + `scanForForbiddenData` — takes the RECORD's participants, computes what
 *     the policy removes from them, and then scans an arbitrary response tree for those exact
 *     (attribute, value) pairs at any depth. This catches data that escapes through a shape the
 *     policy never sees (a `sides[].participant`, a `positionAssignments` entry, a matchUp context
 *     blob) — anywhere the value physically reappears.
 *
 *  2. `collectUnpermittedAttributes` — finds participant-shaped objects in a response and re-applies
 *     `attributeFilter` as an ORACLE, reporting every attribute the policy would have dropped. This
 *     catches attributes that are COMPUTED rather than stored (`rankings`, `ratings`, `seedings`,
 *     `groupings`) and therefore have no counterpart on the record for detector 1 to key on.
 *
 * Both report a scanned-count so a caller can assert the control — "no violations" in a response
 * that contained no participants proves nothing. See `expectPolicyConformance`.
 */

import { attributeFilter } from '@Tools/attributeFilter';
import { isObject } from '@Tools/objects';

// constants and types
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

export type AttributeTemplate = { [key: string]: any };

/** A datum the policy removes from a record participant, with the value it held. */
export type ForbiddenDatum = {
  participantId?: string;
  sourcePath: string;
  attribute: string;
  value: unknown;
};

/** A forbidden datum found in an emitted response, with the path it was found at. */
export type Violation = {
  participantId?: string;
  sourcePath: string;
  attribute: string;
  value: unknown;
  path: string;
};

export type ScanResult = {
  /** Number of objects walked — the control. A scan of nothing finds nothing. */
  objectsScanned: number;
  /** Declared skip-subtree keys actually encountered, so an obsolete declaration can be failed. */
  skippedSubtrees: string[];
  violations: Violation[];
};

/** An emitted participant carrying attributes the policy would have removed. */
export type UnpermittedFinding = {
  participantId?: string;
  /** Attribute paths, relative to the participant, that `attributeFilter` drops. */
  attributes: string[];
  path: string;
};

export type ParticipantScanResult = {
  /** Number of participant-shaped objects examined — the control. */
  participantsScanned: number;
  /** Declared context annotations actually encountered, so an unused declaration can be failed. */
  annotationsSeen: string[];
  findings: UnpermittedFinding[];
};

/** The `participant` attribute template of a participant privacy policy, or undefined. */
export function participantTemplate(policyDefinitions?: any): AttributeTemplate | undefined {
  return policyDefinitions?.[POLICY_TYPE_PARTICIPANT]?.participant;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((member, index) => deepEqual(member, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a as object);
    const bKeys = new Set(Object.keys(b as object));
    if (aKeys.length !== bKeys.size) return false;
    return aKeys.every((key) => bKeys.has(key) && deepEqual(a?.[key], b?.[key]));
  }
  return false;
}

/**
 * Values so widely shared that matching on them says nothing about a leak. Only `false`, `0` and the
 * empty string qualify: every richer value (a name, a date, a code) is specific enough that finding
 * it under the same attribute name in a response IS the leak. Keeping this list this short is
 * deliberate — an exclusion here is a hole in the detector.
 */
function isDiscriminating(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === false || value === 0 || value === '') return false;
  if (Array.isArray(value) && !value.length) return false;
  if (isObject(value) && !Object.keys(value as object).length) return false;
  return true;
}

/**
 * Diff each record participant against its policy-filtered form and collect what the policy removes.
 *
 * Scalars are collected leaf-by-leaf so a partial leak (`person.sex` alone) is detectable. A subtree
 * the policy drops WHOLE (`addresses`, `contacts`, `penalties`) is collected at its container key
 * with its entire value, not leaf-by-leaf: a person's `city` and a venue's `city` are the same string
 * under the same attribute name, and matching on the leaf would report the venue as a privacy leak.
 */
export function deriveForbiddenData(params: { participants?: any[]; template?: AttributeTemplate }): ForbiddenDatum[] {
  const { participants, template } = params;
  const forbidden: ForbiddenDatum[] = [];
  if (!template) return forbidden;

  for (const participant of participants ?? []) {
    if (!isObject(participant)) continue;
    const permitted = attributeFilter({ source: participant, template });
    walk({
      participantId: participant.participantId,
      path: 'participant',
      source: participant,
      permitted,
    });
  }

  return forbidden;

  function push(attribute: string, value: unknown, path: string, participantId?: string) {
    if (!isDiscriminating(value)) return;
    forbidden.push({ attribute, value, sourcePath: `${path}.${attribute}`, participantId });
  }

  function walk({ source, permitted, path, participantId }: any) {
    if (!isObject(source)) return;

    for (const [attribute, value] of Object.entries(source)) {
      const permittedValue = isObject(permitted) ? permitted[attribute] : undefined;
      const childPath = `${path}.${attribute}`;

      if (permittedValue === undefined) {
        // the policy dropped this attribute entirely — record it at container level
        push(attribute, value, path, participantId);
      } else if (Array.isArray(value) && Array.isArray(permittedValue)) {
        value.forEach((member, index) =>
          walk({ source: member, permitted: permittedValue[index], path: `${childPath}[${index}]`, participantId }),
        );
      } else if (isObject(value)) {
        walk({ source: value, permitted: permittedValue, path: childPath, participantId });
      }
    }
  }
}

/**
 * Walk an arbitrary response tree looking for any forbidden datum, at any depth, under any shape.
 *
 * Deliberately shape-blind: it does not ask whether an object "is a participant". A leaked birthDate
 * on a `sides[].participant.person` and a leaked birthDate stapled onto a scheduling row are the same
 * defect, and only one of them is reachable by asking about participants.
 */
export function scanForForbiddenData(params: {
  /** See `collectUnpermittedAttributes`. */
  skipSubtrees?: string[];
  forbidden: ForbiddenDatum[];
  node: unknown;
}): ScanResult {
  const { node, forbidden } = params;
  const skip = new Set(params.skipSubtrees ?? []);
  const skipped = new Set<string>();
  const violations: Violation[] = [];
  const seen = new WeakSet<object>();
  let objectsScanned = 0;

  const byAttribute = new Map<string, ForbiddenDatum[]>();
  for (const datum of forbidden) {
    const existing = byAttribute.get(datum.attribute);
    if (existing) existing.push(datum);
    else byAttribute.set(datum.attribute, [datum]);
  }

  visit(node, '$');

  return { violations, objectsScanned, skippedSubtrees: [...skipped].sort((a, b) => a.localeCompare(b, 'en')) };

  function visit(value: unknown, path: string) {
    if (typeof value === 'function' || !value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((member, index) => visit(member, `${path}[${index}]`));
      return;
    }

    objectsScanned += 1;

    for (const [attribute, attributeValue] of Object.entries(value as object)) {
      if (skip.has(attribute)) {
        skipped.add(attribute);
        continue;
      }
      const candidates = byAttribute.get(attribute);
      const match = candidates?.find((datum) => deepEqual(datum.value, attributeValue));
      if (match) {
        violations.push({ ...match, path: `${path}.${attribute}` });
      }
      visit(attributeValue, `${path}.${attribute}`);
    }
  }
}

function looksLikeParticipant(value: any): boolean {
  if (!isObject(value)) return false;
  if (!value.participantId) return false;
  return !!(value.participantType || value.person || value.participantName || value.individualParticipantIds);
}

/** Attribute paths, relative to `source`, that `attributeFilter` removes under `template`. */
function droppedAttributePaths(source: any, template: AttributeTemplate): string[] {
  const filtered = attributeFilter({ source, template });
  const dropped: string[] = [];

  compare(source, filtered, '');
  return dropped;

  function compare(sourceNode: any, filteredNode: any, path: string) {
    if (!isObject(sourceNode)) return;
    for (const [attribute, value] of Object.entries(sourceNode)) {
      const attributePath = path ? `${path}.${attribute}` : attribute;
      const filteredValue = isObject(filteredNode) ? filteredNode[attribute] : undefined;
      if (filteredValue === undefined) {
        if (value !== undefined) dropped.push(attributePath);
      } else if (Array.isArray(value) && Array.isArray(filteredValue)) {
        value.forEach((member, index) => compare(member, filteredValue[index], `${attributePath}[${index}]`));
      } else if (isObject(value)) {
        compare(value, filteredValue, attributePath);
      }
    }
  }
}

/**
 * Find participant-shaped objects in a response and report every attribute the policy would drop.
 *
 * Uses `attributeFilter` itself as the oracle, so the check stays correct as the policy changes and
 * names no attribute of its own. Matched participants are NOT recursed into: `attributeFilter`
 * already descends (including through `individualParticipants`, which carries its own sub-template),
 * and re-visiting a nested participant with the top-level template would judge it against the wrong
 * rules.
 */
export function collectUnpermittedAttributes(params: {
  /**
   * Attribute paths (relative to a participant) that a surface attaches AFTER filtering, by design —
   * `entryStatus`, `entryStage`, `luckyAdvancement`. They are draw-entry context, not participant
   * record data, so the policy has nothing to say about them. Declaring one here is a claim that must
   * be paid for: `annotationsSeen` reports which were actually encountered so a test can fail a
   * declaration that no longer matches reality.
   */
  contextAnnotations?: string[];
  /**
   * Attribute keys whose subtree is governed by a DIFFERENT policy and must not be judged against
   * this one — `tournamentContacts`, which `getTournamentInfo` filters with `POLICY_PRIVACY_STAFF`
   * for a different population. Each declaration is reported back in `skippedSubtrees` so a test can
   * fail one that no longer matches anything, and each needs its own conformance test against the
   * policy that does govern it.
   */
  skipSubtrees?: string[];
  template?: AttributeTemplate;
  node: unknown;
}): ParticipantScanResult {
  const { node, template, contextAnnotations = [] } = params;
  const skip = new Set(params.skipSubtrees ?? []);
  const annotations = new Set(contextAnnotations);
  const encountered = new Set<string>();
  const findings: UnpermittedFinding[] = [];
  const seen = new WeakSet<object>();
  let participantsScanned = 0;

  if (!template) return { participantsScanned, findings, annotationsSeen: [] };
  const activeTemplate: AttributeTemplate = template;

  visit(node, '$');

  return { participantsScanned, findings, annotationsSeen: [...encountered].sort((a, b) => a.localeCompare(b, 'en')) };

  function visit(value: unknown, path: string) {
    if (typeof value === 'function' || !value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((member, index) => visit(member, `${path}[${index}]`));
      return;
    }

    if (looksLikeParticipant(value)) {
      participantsScanned += 1;
      const dropped = droppedAttributePaths(value, activeTemplate);
      for (const attribute of dropped) if (annotations.has(attribute)) encountered.add(attribute);
      const attributes = dropped.filter((attribute) => !annotations.has(attribute));
      if (attributes.length) findings.push({ path, attributes, participantId: (value as any).participantId });
      return;
    }

    for (const [attribute, attributeValue] of Object.entries(value as object)) {
      if (skip.has(attribute)) continue;
      visit(attributeValue, `${path}.${attribute}`);
    }
  }
}

export type ConformanceReport = {
  unpermitted: ParticipantScanResult;
  forbidden: ForbiddenDatum[];
  data: ScanResult;
};

/**
 * Run both detectors over a response.
 *
 * `participants` are the RECORD's participants (unfiltered) — the source of truth for what the policy
 * removes. `node` is the emitted response.
 */
export function analysePolicyConformance(params: {
  contextAnnotations?: string[];
  skipSubtrees?: string[];
  policyDefinitions?: any;
  participants?: any[];
  node: unknown;
}): ConformanceReport {
  const template = participantTemplate(params.policyDefinitions);
  const forbidden = deriveForbiddenData({ participants: params.participants, template });
  return {
    unpermitted: collectUnpermittedAttributes({
      contextAnnotations: params.contextAnnotations,
      skipSubtrees: params.skipSubtrees,
      node: params.node,
      template,
    }),
    data: scanForForbiddenData({ skipSubtrees: params.skipSubtrees, node: params.node, forbidden }),
    forbidden,
  };
}

/** Compact, readable failure output — the attribute path and where it was found. */
export function describeViolations(report: ConformanceReport): string[] {
  return [
    ...report.data.violations.map((violation) => `${violation.attribute} @ ${violation.path}`),
    ...report.unpermitted.findings.flatMap((finding) =>
      finding.attributes.map((attribute) => `${attribute} @ ${finding.path}`),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en'));
}
