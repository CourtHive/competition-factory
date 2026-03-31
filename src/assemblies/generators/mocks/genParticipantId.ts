import { isString } from '@Tools/objects';
import { UUID } from '@Tools/UUID';

export function genParticipantId({ idPrefix, participantType, index, uuids, random }: {
  participantType?: string;
  random?: () => number;
  idPrefix?: string;
  uuids?: string[];
  index: number;
}) {
  const type = isString(participantType) ? participantType[0] : 'X';
  return idPrefix ? `${idPrefix}-${type}-${index}` : uuids?.pop() || UUID(undefined, random);
}
