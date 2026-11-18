import React, { useEffect, useRef, useState } from 'react';
import 'courthive-components/dist/courthive-components.css';

const SIDES = [
  { participantName: 'Susanne Tillich', seed: '1' },
  { participantName: 'Wendell Wirt', seed: '6' },
];
const DEFAULT_FORMAT = 'SET3-S:6/TB7';

/**
 * Live score entry demo.
 *
 * Opens `openScoreEntryDialog` from courthive-components, the dialog TMX opens to score a matchUp, and
 * shows the outcome the dialog reports through `onSubmit`. Nothing here builds or edits that outcome:
 * it is the object a host hands to `tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome })`.
 *
 * The reason codes offered for a status come from the factory's `POLICY_SCORING_USTA` fixture, the same
 * vocabulary a tournament gets by attaching that scoring policy.
 */
export default function ScoreEntryDemo() {
  const libraryRef = useRef(null);
  const dialogRef = useRef(null);
  const formatRef = useRef(DEFAULT_FORMAT);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([import('courthive-components'), import('tods-competition-factory')])
      .then(([components, factory]) => {
        if (!active) return;
        const { fixtures, policyConstants } = factory;
        const scoringPolicy = fixtures.policies.POLICY_SCORING_USTA[policyConstants.POLICY_TYPE_SCORING];
        libraryRef.current = {
          openScoreEntryDialog: components.openScoreEntryDialog,
          statusCodeGroups: scoringPolicy.matchUpStatusCodes,
        };
        setReady(true);
      })
      .catch((err) => {
        console.error('Failed to load the score entry dialog:', err);
        if (active) setError('Failed to load the score entry dialog');
      });

    return () => {
      active = false;
      dialogRef.current?.close();
    };
  }, []);

  const openDialog = () => {
    const library = libraryRef.current;
    if (!library) return;
    dialogRef.current?.close();
    dialogRef.current = library.openScoreEntryDialog({
      sides: SIDES,
      matchUpFormat: formatRef.current,
      context: 'Quarterfinal · Court 7',
      statusCodeGroups: library.statusCodeGroups,
      // Present so the format chip is a control; the chosen format also rides on `outcome.matchUpFormat`.
      onFormatChange: (matchUpFormat) => {
        formatRef.current = matchUpFormat;
      },
      onSubmit: (submitted) => setOutcome(structuredClone(submitted.outcome)),
      onClose: () => {
        dialogRef.current = null;
      },
    });
  };

  return (
    <div className="card margin-bottom--lg" data-demo="scoreEntry">
      <div className="card__body">
        <p>
          Enter a score, or click a player&apos;s name to record a retirement, walkover or default and pick a reason
          code. <strong>Other…</strong> holds the endings that resolve neither side. Submit to see the outcome the
          dialog reports.
        </p>
        <button type="button" className="button button--primary" disabled={!ready} onClick={openDialog}>
          {ready ? 'Open score entry' : 'Loading score entry…'}
        </button>
        {error && (
          <div className="alert alert--danger margin-top--md" role="alert">
            {error}
          </div>
        )}
        {outcome && (
          <div className="margin-top--md">
            <strong>
              Outcome reported by <code>onSubmit</code>
            </strong>
            <pre data-demo="scoreEntryOutcome" className="margin-top--sm margin-bottom--none">
              {JSON.stringify(outcome, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
