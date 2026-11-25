// The ordinary root retains its original selector signature. This overload belongs to the diagnostic graph.
import { setOutcomePipeline } from '@Global/state/globalState';

import type { withNoticeAudit } from './delivery';

export const diagnosticSelector = setOutcomePipeline as ReturnType<typeof withNoticeAudit>;
