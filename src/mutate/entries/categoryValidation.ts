import { getParticipantScaleItem } from '@Query/participant/getParticipantScaleItem';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { extractDate, isValidDateString } from '@Tools/dateTime';
import { getAccessorValue } from '@Tools/getAccessorValue';

// constants and types
import { INVALID_DATE, MISSING_DATE_RANGE, ErrorType } from '@Constants/errorConditionConstants';
import { Category, Event, Participant, Tournament } from '@Types/tournamentTypes';

export interface CategoryRejection {
  participantId: string;
  participantName?: string;
  rejectionReasons: RejectionReason[];
}

export interface RejectionReason {
  type: 'age' | 'rating';
  reason: string;
  details: AgeRejectionDetails | RatingRejectionDetails;
}

export interface AgeRejectionDetails {
  birthDate?: string;
  ageAtStart?: number;
  ageAtEnd?: number;
  requiredMin?: number;
  requiredMax?: number;
}

export interface RatingRejectionDetails {
  ratingType?: string;
  ratingValue?: number;
  requiredMin?: number;
  requiredMax?: number;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Get the event date range, falling back to tournament dates
 */
export function getEventDateRange(event: Event, tournamentRecord?: Tournament): DateRange | { error: ErrorType } {
  const startDate = event.startDate || tournamentRecord?.startDate;
  const endDate = event.endDate || tournamentRecord?.endDate;

  if (!startDate || !endDate) {
    return { error: MISSING_DATE_RANGE };
  }

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return { error: INVALID_DATE };
  }

  return { startDate, endDate };
}

/**
 * Calculate age at a specific date
 */
export function calculateAge(birthDate: string, atDate: string): number {
  const birth = new Date(extractDate(birthDate));
  const at = new Date(extractDate(atDate));

  let age = at.getFullYear() - birth.getFullYear();
  const monthDiff = at.getMonth() - birth.getMonth();

  // Adjust if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Check if age falls within required range
 */
export function checkAgeInRange(age: number, ageMin?: number, ageMax?: number): boolean {
  if (ageMin !== undefined && age < ageMin) return false;
  if (ageMax !== undefined && age > ageMax) return false;
  return true;
}

/**
 * Check if category is a combined age category (for pairs/teams)
 * Combined categories like C50-70 should not validate individual participants
 */
function isCombinedAgeCategory(category: Category): boolean {
  // Check for combined age category code format (C##-##)
  const combinedPattern = /^C\d{1,2}-\d{1,2}$/;
  return combinedPattern.test(category.ageCategoryCode || '');
}

/**
 * Validate participant age against category constraints
 * Participant must be valid throughout the entire event period
 *
 * Note: Combined age categories (e.g., C50-70) are skipped as they apply to pairs/teams, not individuals
 */
export function validateParticipantAge(
  participant: Participant,
  category: Category,
  startDate: string,
  endDate: string,
): { valid: boolean; reason?: string; details?: any } {
  // Skip validation for combined age categories (these are for pairs/teams, not individuals)
  if (isCombinedAgeCategory(category)) {
    return { valid: true };
  }

  // If there's an ageCategoryCode but no ageMin/ageMax, extract them using getCategoryAgeDetails
  let effectiveAgeMin = category.ageMin;
  let effectiveAgeMax = category.ageMax;

  if (category.ageCategoryCode && !effectiveAgeMin && !effectiveAgeMax) {
    const categoryDetails = getCategoryAgeDetails({
      consideredDate: startDate,
      category,
    });

    if (!categoryDetails.error) {
      effectiveAgeMin = categoryDetails.ageMin;
      effectiveAgeMax = categoryDetails.ageMax;
    }
  }

  // No age restrictions
  if (!effectiveAgeMin && !effectiveAgeMax) {
    return { valid: true };
  }

  const birthDate = participant.person?.birthDate;
  if (!birthDate) {
    return {
      valid: false,
      reason: 'Missing birthDate',
      details: {
        requiredMin: effectiveAgeMin,
        requiredMax: effectiveAgeMax,
      },
    };
  }

  // Check age at event start and end
  const ageAtStart = calculateAge(birthDate, startDate);
  const ageAtEnd = calculateAge(birthDate, endDate);

  // Check if valid throughout event period
  const validAtStart = checkAgeInRange(ageAtStart, effectiveAgeMin, effectiveAgeMax);
  const validAtEnd = checkAgeInRange(ageAtEnd, effectiveAgeMin, effectiveAgeMax);

  if (!validAtStart) {
    const rangeStr = [
      effectiveAgeMin === undefined ? null : `min: ${effectiveAgeMin}`,
      effectiveAgeMax === undefined ? null : `max: ${effectiveAgeMax}`,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      valid: false,
      reason: `Age ${ageAtStart} at event start (${startDate}) outside range [${rangeStr}]`,
      details: {
        birthDate,
        ageAtStart,
        ageAtEnd,
        requiredMin: effectiveAgeMin,
        requiredMax: effectiveAgeMax,
      },
    };
  }

  if (!validAtEnd) {
    const rangeStr = [
      effectiveAgeMin === undefined ? null : `min: ${effectiveAgeMin}`,
      effectiveAgeMax === undefined ? null : `max: ${effectiveAgeMax}`,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      valid: false,
      reason: `Age ${ageAtEnd} at event end (${endDate}) outside range [${rangeStr}]`,
      details: {
        birthDate,
        ageAtStart,
        ageAtEnd,
        requiredMin: effectiveAgeMin,
        requiredMax: effectiveAgeMax,
      },
    };
  }

  return { valid: true };
}

/**
 * Validate participant rating against category constraints
 */
export function validateParticipantRating(
  participant: Participant,
  category: Category,
  event: Event,
  tournamentRecord?: Tournament,
): { valid: boolean; reason?: string; details?: any } {
  // No rating restrictions
  if (!category.ratingMin && !category.ratingMax) {
    return { valid: true };
  }

  if (!category.ratingType) {
    return { valid: true }; // No rating type specified
  }

  // Get participant's rating for the specified type
  const scaleAttributes: any = {
    scaleType: 'RATING',
    scaleName: category.ratingType,
    eventType: event.eventType, // SINGLES, DOUBLES, TEAM
  };

  const { scaleItem } = getParticipantScaleItem({
    tournamentRecord,
    participantId: participant.participantId,
    scaleAttributes,
  });

  if (!scaleItem?.scaleValue) {
    return {
      valid: false,
      reason: `Missing ${category.ratingType} rating`,
      details: {
        ratingType: category.ratingType,
        requiredMin: category.ratingMin,
        requiredMax: category.ratingMax,
      },
    };
  }

  // Handle complex scaleValue objects
  let ratingValue: number;
  if (typeof scaleItem.scaleValue === 'object') {
    const extractedValue = getAccessorValue({
      element: scaleItem.scaleValue,
      accessor: scaleItem.scaleValue?.accessor,
    });
    if (extractedValue === undefined) {
      return {
        valid: false,
        reason: `Cannot extract rating value from ${category.ratingType} scale item`,
        details: {
          ratingType: category.ratingType,
          requiredMin: category.ratingMin,
          requiredMax: category.ratingMax,
        },
      };
    }
    ratingValue = extractedValue;
  } else {
    ratingValue = scaleItem.scaleValue;
  }

  // Check rating range
  if (category.ratingMin !== undefined && ratingValue < category.ratingMin) {
    return {
      valid: false,
      reason: `${category.ratingType} rating ${ratingValue} below minimum ${category.ratingMin}`,
      details: {
        ratingType: category.ratingType,
        ratingValue,
        requiredMin: category.ratingMin,
        requiredMax: category.ratingMax,
      },
    };
  }

  if (category.ratingMax !== undefined && ratingValue > category.ratingMax) {
    return {
      valid: false,
      reason: `${category.ratingType} rating ${ratingValue} above maximum ${category.ratingMax}`,
      details: {
        ratingType: category.ratingType,
        ratingValue,
        requiredMin: category.ratingMin,
        requiredMax: category.ratingMax,
      },
    };
  }

  return { valid: true };
}

/**
 * Get participant display name for error reporting
 */
export function getParticipantName(participant: Participant): string {
  const person = participant.person;
  if (!person) return 'Unknown';

  const given = person.standardGivenName || person.passportGivenName;
  const family = person.standardFamilyName || person.passportFamilyName;

  return [given, family].filter(Boolean).join(' ') || 'Unknown';
}

/**
 * Validate a single participant against category constraints
 * Returns rejection object if invalid, null if valid
 */
export function validateParticipantCategory(
  participant: Participant,
  category: Category,
  event: Event,
  startDate: string,
  endDate: string,
  tournamentRecord?: Tournament,
): CategoryRejection | null {
  const ageValidation = validateParticipantAge(participant, category, startDate, endDate);
  const ratingValidation = validateParticipantRating(participant, category, event, tournamentRecord);

  if (!ageValidation.valid || !ratingValidation.valid) {
    const rejection: CategoryRejection = {
      participantId: participant.participantId,
      participantName: getParticipantName(participant),
      rejectionReasons: [],
    };

    if (!ageValidation.valid) {
      rejection.rejectionReasons.push({
        type: 'age',
        reason: ageValidation.reason!,
        details: ageValidation.details ?? {},
      });
    }

    if (!ratingValidation.valid) {
      rejection.rejectionReasons.push({
        type: 'rating',
        reason: ratingValidation.reason!,
        details: ratingValidation.details ?? {},
      });
    }

    return rejection;
  }

  return null;
}
