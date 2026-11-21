import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { LINEUPS } from '@Constants/extensionConstants';
import { planFieldWrite } from '@Mutate/planCommit';
import { nowIso } from '@Tools/clock';

import type { DrawDefinition } from '@Types/tournamentTypes';
import type { LineUp } from '@Types/factoryTypes';

/** The template map is borrowed by existing callers. Keep its identity in each enabled representation. */
export function planReplacementLineUp({
  drawDefinition,
  teamParticipantId,
  modifiedLineUp,
  writes,
}: {
  drawDefinition: DrawDefinition;
  teamParticipantId: string;
  modifiedLineUp: LineUp;
  writes: (() => void)[];
}) {
  const value = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const lineUp = removeLineUpSubstitutions({ lineUp: modifiedLineUp });
  writes.push(planFieldWrite(value, teamParticipantId, lineUp));
  if (writeNativeEnabled()) writes.push(planFieldWrite(drawDefinition, 'lineUps', value));
  const extensions = drawDefinition.extensions;
  const prior = extensions?.find((entry) => entry.name === LINEUPS);
  if (writeLegacyEnabled()) {
    if (prior) writes.push(planFieldWrite(prior, 'value', value));
    else {
      const entry = { name: LINEUPS, value, createdAt: nowIso() };
      if (extensions) writes.push(extensions.push.bind(extensions, entry));
      else {
        writes.push(planFieldWrite(drawDefinition, 'extensions', []));
        writes.push(() => {
          drawDefinition.extensions!.push(entry);
        });
      }
    }
  } else if (prior && extensions) {
    writes.push(
      planFieldWrite(
        drawDefinition,
        'extensions',
        extensions.filter((entry) => entry.name !== LINEUPS),
      ),
    );
  }
  // An explicit null first-class value still wins the read in legacy-only storage.
  return !writeNativeEnabled() && drawDefinition.lineUps === null ? null : { ...value, [teamParticipantId]: lineUp };
}
