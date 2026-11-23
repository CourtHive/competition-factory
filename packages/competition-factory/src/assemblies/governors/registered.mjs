import { registerBuiltinPreviewMethods } from '../../forge/previewMethods.ts';
import * as namespaces from './namespaces.ts';

// Keep this boundary in native ESM so consumer bundlers receive its purity annotations.
// An unused governor needs no registration. A used governor must register its raw functions.
export const competitionGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.competitionGovernor);
export const drawsGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.drawsGovernor);
export const entriesGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.entriesGovernor);
export const eventGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.eventGovernor);
export const generationGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.generationGovernor);
export const ladderGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.ladderGovernor);
export const matchUpFormatGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.matchUpFormatGovernor);
export const matchUpGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.matchUpGovernor);
export const mocksGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.mocksGovernor);
export const participantGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.participantGovernor);
export const policyGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.policyGovernor);
export const publishingGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.publishingGovernor);
export const queryGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.queryGovernor);
export const rankingGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.rankingGovernor);
export const reportGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.reportGovernor);
export const sanctioningGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.sanctioningGovernor);
export const scheduleGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.scheduleGovernor);
export const seasonGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.seasonGovernor);
export const scoreGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.scoreGovernor);
export const simulationGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.simulationGovernor);
export const tieFormatGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.tieFormatGovernor);
export const tournamentGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.tournamentGovernor);
export const availabilityGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.availabilityGovernor);
export const officiatingGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.officiatingGovernor);
export const practiceGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.practiceGovernor);
export const venueGovernor = /* @__PURE__ */ registerBuiltinPreviewMethods(namespaces.venueGovernor);
