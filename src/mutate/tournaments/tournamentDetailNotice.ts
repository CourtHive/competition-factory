import { addNotice } from '@Global/state/globalState';

// constants and types
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 * Dispatch MODIFY_TOURNAMENT_DETAIL for a change to tournament-level data, in the shape the other
 * tournament-detail writers use: `{ parentOrganisation, tournamentId, ...detail }`, where `detail`
 * names what changed and carries its new value.
 */
export function modifyTournamentDetailNotice({
  tournamentRecord,
  detail,
}: {
  tournamentRecord?: Tournament;
  detail: Record<string, unknown>;
}) {
  if (!tournamentRecord?.tournamentId) return;
  addNotice({
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      ...detail,
    },
    topic: MODIFY_TOURNAMENT_DETAIL,
  });
}

/**
 * Both surfaces a group-leaf-or-extension value can live on (`element[group][leaf]` and the named
 * extension), so a writer can tell whether it changed anything under any schemaWriteMode.
 */
export function groupLeafFingerprint({
  groupAttribute,
  leafAttribute,
  element,
  name,
}: {
  groupAttribute: string;
  leafAttribute: string;
  element?: Tournament;
  name: string;
}): string {
  const extension = (element?.extensions ?? []).find((e) => e?.name === name);
  const group = (element as Record<string, unknown> | undefined)?.[groupAttribute];
  const leaf = group && typeof group === 'object' ? (group as Record<string, unknown>)[leafAttribute] : undefined;
  return JSON.stringify([leaf, extension?.value]);
}

/** The tournament's own (root) extensions, as `rootExtensionsNotice` compares them after a write. */
export const rootExtensionsFingerprint = (tournamentRecord?: Tournament): string =>
  JSON.stringify(tournamentRecord?.extensions ?? []);

/**
 * MODIFY_TOURNAMENT_DETAIL with the record's root `extensions` when a write changed them (CA 2026-10-18: root-extension
 * writes are announced). Tournament-scope mutation locks, the lock feature gate and `addTournamentExtension` live
 * there, and an integrator persisting only from notices lost them.
 */
export function rootExtensionsNotice({ tournamentRecord, before }: { tournamentRecord?: Tournament; before: string }) {
  if (rootExtensionsFingerprint(tournamentRecord) === before) return;
  modifyTournamentDetailNotice({ tournamentRecord, detail: { extensions: tournamentRecord?.extensions ?? [] } });
}
