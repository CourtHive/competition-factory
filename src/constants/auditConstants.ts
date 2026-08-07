export const DELETE_DRAW_DEFINITIONS = 'deleteDrawDefinitions';
export const AUTO_SCHEDULING_AUDIT = 'autoSchedulingAudit';
export const DELETE_EVENTS = 'deleteEvents';

export const auditConstants = {
  AUTO_SCHEDULING_AUDIT,
  DELETE_EVENTS,
  DELETE_DRAW_DEFINITIONS,
} as const;

export default auditConstants;
