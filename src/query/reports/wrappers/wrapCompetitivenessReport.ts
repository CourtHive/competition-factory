import { getMatchUpCompetitiveProfile } from '@Query/matchUp/getMatchUpCompetitiveProfile';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// Constants and Types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { COMPETITIVENESS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapCompetitivenessReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const { matchUps } = allTournamentMatchUps({ tournamentRecord });
  if (!matchUps) return { error: 'No matchUps found' };

  const completed = matchUps.filter((m: any) => completedMatchUpStatuses.includes(m.matchUpStatus));

  const columns = [
    { key: 'roundName', title: 'Round', type: 'string' as const },
    { key: 'side1', title: 'Side 1', type: 'string' as const },
    { key: 'side2', title: 'Side 2', type: 'string' as const },
    { key: 'score', title: 'Score', type: 'string' as const },
    { key: 'competitiveness', title: 'Competitiveness', type: 'string' as const },
    { key: 'pctSpread', title: 'Spread %', type: 'number' as const },
  ];

  const rows = completed
    .toSorted(
      (a: any, b: any) =>
        (a.roundNumber ?? 0) - (b.roundNumber ?? 0) || (a.roundPosition ?? 0) - (b.roundPosition ?? 0),
    )
    .map((m: any) => {
      const profile: any = getMatchUpCompetitiveProfile({ matchUp: m, tournamentRecord });

      return {
        structureId: m.structureId,
        matchUpId: m.matchUpId,
        eventId: m.eventId,
        drawId: m.drawId,
        ...sideIds(m),

        roundName: m.roundName ?? `R${m.roundNumber ?? ''}`,
        side1: m.sides?.[0]?.participant?.participantName ?? '',
        side2: m.sides?.[1]?.participant?.participantName ?? '',
        score: m.score?.scoreStringSide1 ?? '',
        competitiveness: profile.competitiveness ?? '',
        pctSpread: profile.pctSpread ?? '',
      };
    });

  return {
    reportId: COMPETITIVENESS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}

/**
 * Side participant ids alongside the display names.
 *
 * Not displayed as columns — consumers hide them — but they are what lets a table
 * resolve the participant behind a name and open a participant card, and they
 * survive to CSV/JSON export. A doubles side yields its PAIR id; the consumer
 * hydrates individuals from that, so a partner can be opened individually.
 */
function sideIds(matchUp: any) {
  return {
    side1ParticipantId: matchUp?.sides?.[0]?.participantId ?? matchUp?.sides?.[0]?.participant?.participantId ?? '',
    side2ParticipantId: matchUp?.sides?.[1]?.participantId ?? matchUp?.sides?.[1]?.participant?.participantId ?? '',
  };
}
