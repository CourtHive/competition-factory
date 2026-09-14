import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addDays, extractDate } from '@Tools/dateTime';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type CopyTournamentRecordArgs = {
  tournamentRecord: Tournament;
  copyParticipants?: boolean;
  extensionList?: string[]; // list of extensions to KEEP
  itemTypeList?: string[]; // list of timeItems to KEEP
  tournamentName: string;
  startDate: string;
  endDate?: string;
};

export function copyTournamentRecord(params: CopyTournamentRecordArgs) {
  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true, startDate: true, endDate: false, tournamentName: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { startDate, endDate } = params.tournamentRecord;
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const tournamentDayMilliseconds =
    startDate && endDate ? new Date(extractDate(endDate)).getTime() - new Date(extractDate(startDate)).getTime() : 0;
  const tournamentDays = tournamentDayMilliseconds / dayMilliseconds;
  const newEndDate = params.endDate || addDays(params.startDate, tournamentDays);

  const filteredTimeItems = (timeItems) => timeItems?.filter(({ itemType }) => params.itemTypeList?.includes(itemType));
  const filteredExtensions = (extensions) => extensions?.filter(({ name }) => params.extensionList?.includes(name));
  const copyParticipant = (participant) => {
    const { timeItems, extensions, ...rest } = participant;
    return makeDeepCopy(
      { ...rest, timeItems: filteredTimeItems(timeItems), extensions: filteredExtensions(extensions) },
      false,
      true,
    );
  };

  const copyEvent = (event) => {
    const { drawDefinitions, timeItems, extensions, startDate, endDate, ...rest } = event;
    return makeDeepCopy(
      {
        extensions: filteredExtensions(extensions),
        timeItems: filteredTimeItems(timeItems),
        startDate: params.startDate,
        endDate: newEndDate,
        ...rest,
      },
      false,
      true,
    );
  };

  const tournamentRecord = {
    participants: params.copyParticipants ? (params.tournamentRecord.participants?.map(copyParticipant) ?? []) : [],
    parentOrganisation: makeDeepCopy({ ...params.tournamentRecord.parentOrganisation }, false, true),
    venues: makeDeepCopy(params.tournamentRecord.venues ?? [], false, true),
    extensions: filteredExtensions(params.tournamentRecord.extensions),
    timeItems: filteredTimeItems(params.tournamentRecord.timeItems),
    events: params.tournamentRecord.events?.map(copyEvent) ?? [],
    weekdays: [...(params.tournamentRecord.weekdays ?? [])],
    tournamentName: params.tournamentName,
    startDate: params.startDate,
    tournamentId: UUID(),
    endDate: newEndDate,
  };

  return { ...SUCCESS, tournamentRecord };
}
