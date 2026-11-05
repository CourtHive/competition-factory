import { findExtension } from '@Helpers/extensions/findExtension';
import { addExtension } from '@Mutate/extensions/addExtension';

// constants
import { TIE_FORMAT_MODIFICATIONS } from '@Constants/extensionConstants';

export function tieFormatTelemetry({ appliedPolicies, drawDefinition, auditData }) {
  // only apply telemetry if the policy is present
  if (!appliedPolicies?.audit?.[TIE_FORMAT_MODIFICATIONS]) return;

  const { extension } = findExtension({
    name: TIE_FORMAT_MODIFICATIONS,
    element: drawDefinition,
  });

  const updatedExtension = {
    value: Array.isArray(extension?.value) ? extension?.value.concat(auditData) : [auditData],
    name: TIE_FORMAT_MODIFICATIONS,
  };
  addExtension({ element: drawDefinition, extension: updatedExtension });
}
