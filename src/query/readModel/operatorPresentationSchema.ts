// Experimental screen-specific allow-lists, not the complete operator-document contract.
import type { OperatorPresentationAudience } from '@Types/operatorPresentation';

const text = { type: 'string' };
const side = {
  type: 'object',
  additionalProperties: false,
  required: ['sideNumber', 'bye', 'qualifier', 'isWinner'],
  properties: {
    sideNumber: { enum: [1, 2] },
    participantId: text,
    name: text,
    seed: text,
    bye: { type: 'boolean' },
    qualifier: { type: 'boolean' },
    isWinner: { type: 'boolean' },
  },
};
const schedule = {
  type: 'object',
  additionalProperties: false,
  properties: { date: text, time: text, timeZone: text, court: text, venue: text },
};

function schemas(audience: OperatorPresentationAudience) {
  const match = {
    type: 'object',
    additionalProperties: false,
    required: ['audience', 'matchUpId', 'scoreText', 'hasScore', 'isUpset', 'sides'],
    properties: {
      audience: { const: audience },
      matchUpId: text,
      roundPosition: { type: 'number' },
      status: text,
      scoreText: text,
      hasScore: { type: 'boolean' },
      isUpset: { type: 'boolean' },
      sides: { type: 'array', minItems: 2, maxItems: 2, items: side },
      schedule,
    },
  };
  return {
    match,
    draw: {
      type: 'object',
      additionalProperties: false,
      required: ['audience', 'schemaVersion', 'drawId', 'structureId', 'rounds'],
      properties: {
        audience: { const: audience },
        schemaVersion: { const: 'operator-presentation.v1' },
        drawId: text,
        structureId: text,
        rounds: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['roundNumber', 'feedRound', 'matches'],
            properties: {
              roundNumber: { type: 'number' },
              name: text,
              feedRound: { type: 'boolean' },
              matches: { type: 'array', items: match },
            },
          },
        },
      },
    },
  };
}

/** Provisional role catalog. Both current screens need only the same basic display fields. */
export const operatorPresentationSchemas = Object.freeze({
  recorder: schemas('recorder'),
  director: schemas('director'),
});

export function isOperatorPresentationAudience(value: unknown): value is OperatorPresentationAudience {
  return typeof value === 'string' && Object.hasOwn(operatorPresentationSchemas, value);
}
