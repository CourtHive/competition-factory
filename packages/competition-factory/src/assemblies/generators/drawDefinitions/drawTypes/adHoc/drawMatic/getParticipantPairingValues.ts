import { pairingHash } from './generateCandidate';

export function getParticipantPairingValues({ possiblePairings, valueObjects }) {
  const pairingValues = {};

  for (const participantId of Object.keys(possiblePairings)) {
    const participantValues = possiblePairings[participantId].map((opponent) => pairingValue(participantId, opponent));
    pairingValues[participantId] = participantValues.sort((a, b) => a.value - b.value);
  }

  function pairingValue(participantId, opponent) {
    const key = pairingHash(participantId, opponent);
    return { opponent, value: valueObjects[key] };
  }
  return { pairingValues };
}
