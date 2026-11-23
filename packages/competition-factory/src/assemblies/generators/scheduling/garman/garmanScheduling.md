---
name: Garman Scheduling
menu: Competition Engine
route: /competitionEngine/garman
---

# Garman Scheduling

The Revisied Garman System is based upon the following formula

    TM = Int([ (L * C) / T] * (P - 1) + C)

Where:

    C = Number of Courts
    T = Average Match time in Minutes
    P = Period within schedule
    L = Length of each Period
    TM = Total Matches

Total Matches is the total of number of matches which can be expected to occur by the arrival of a given period.

A **Delta** between the calculations for two periods gives the number of matches that can be scheduled between the two given periods.

    Delta = TM(P) - TM(P - 1)

## Implementation

The Compeition Factory implementation of the Garman formula defines a court availability schema and assumes that court availability varies across courts and that individual court availaiblity may not be continuous.

    {
        identifier: `1`, courtId: `uuid1`, dateAvailability: [
            {
                date: '2020-01-01', startTime: '7:00', endTime: '17:00',
                bookings: [
                    { startTime: '7:00', endTime: '8:00', bookingType: 'practice' }
                ]
            }
        ]
    }

The **getScheduleTimes** function works for a single day and has the following parameters (and defaults):

    date,                   // date in the form 'YYYY-MM-DD'
    startTime='8:00',
    endTime='19:00',
    periodLength=30
    averageMatchUpMinutes=90
    courts                  // array of courts using court availability schema

The output of this function is an array of periods which includes the number of matches which can be expected to be put on court at the start of each period:

    0: {periodStart: "8:00", add: 10, availableCourts: 10, new: 10, totalMatchUps: 10}
    1: {periodStart: "8:30", add: 0, availableCourts: 10, new: 0, totalMatchUps: 10}
    2: {periodStart: "9:00", add: 3, availableCourts: 10, new: 0, totalMatchUps: 13}

One further difference from the reference implementation is the use of _endTime_ rather than simply the specification of times at which periods start. An end time is assumed to be a _hard stop_ and therefore no matches can be added in a period where there are not _averageMatchUpTime_ minutes remaining before _endTime_.
