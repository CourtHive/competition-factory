// a time window a participant is booked for: from scheduleTime until they have recovered
export type ParticipantBooking = {
  typeChangeTimeAfterRecovery?: string; // the end when their other matchUp is of another matchUpType
  timeAfterRecovery: string;
  matchUpType?: string;
  scheduleTime: string;
};

// a matchUp on the day being scheduled that a participant can play (see participantDayLoad)
export type DayMatchUp = {
  matchUpType?: string;
  matchUpId: string;
  certain: boolean;
  drawId: string;
};

export type ParticipantProfile = {
  potentialBookings: { [drawId: string]: ParticipantBooking[] };
  potentialRecovery: { [drawId: string]: string[] };
  counters: { [counterName: string]: number }; // the participant's day load by matchUpType and TOTAL
  bookings: ParticipantBooking[];
  timeAfterRecovery?: string;
  dayMatchUps: DayMatchUp[];
  /** the day grouped for day-load asks (participantDayLoad.ts); cleared whenever dayMatchUps changes */
  dayLoadCache?: unknown;
};

export type IndividualParticipantProfiles = { [participantId: string]: ParticipantProfile };

export function checkParticipantProfileInitialization({ individualParticipantProfiles, participantId }) {
  if (!individualParticipantProfiles[participantId]) {
    individualParticipantProfiles[participantId] = {
      timeAfterRecovery: undefined,
      potentialRecovery: {}, // { [drawId]: [timeString] } - timeAfterRecovery for potential matchUps by drawId
      potentialBookings: {},
      dayMatchUps: [], // the matchUps on the day being scheduled that the participant can play (see participantDayLoad)
      bookings: [],
      counters: {}, // the participant's day load by matchUpType and TOTAL
    };
  }
}

export function addParticipantPotentialRecovery({ individualParticipantProfiles, participantId, booking, drawId }) {
  const profile = individualParticipantProfiles[participantId];
  if (!profile.potentialRecovery[drawId]) profile.potentialRecovery[drawId] = [];
  profile.potentialRecovery[drawId].push(booking.timeAfterRecovery);

  if (!profile.potentialBookings[drawId]) profile.potentialBookings[drawId] = [];
  profile.potentialBookings[drawId].push(booking);
}
