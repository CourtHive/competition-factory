type GetGroupsArgs = {
  participantResults: any;
  participantIds?: string[];
  attribute: string;
};

export function getGroups({ participantResults, participantIds, attribute }: GetGroupsArgs) {
  const resultsArray = getResultsArray({ participantResults, participantIds });
  return resultsArray.reduce((groups, participantResult) => {
    const { participantId, results } = participantResult;
    const value = results?.[attribute];
    if (!isNaN(value) && participantId) {
      if (groups[value]) {
        groups[value].push(participantId);
      } else {
        groups[value] = [participantId];
      }
    }
    return groups;
  }, {});
}

type GetResultsArrayArgs = {
  participantResults: any;
  participantIds?: string[];
};

export function getResultsArray(params: GetResultsArrayArgs) {
  const participantIds = params.participantIds ?? Object.keys(params.participantResults);
  return participantIds.reduce((arr: any[], participantId: string, i) => {
    arr.push({
      participantId,
      i,
      results: params.participantResults[participantId],
    });
    return arr;
  }, []);
}
