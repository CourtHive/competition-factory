import React, { useEffect, useRef, useState } from 'react';
import { createJsonViewer } from '../helpers/jsonViewer';

/**
 * MatchUp Format Editor Demo
 * Demonstrates the getMatchUpFormatModal from courthive-components
 */
export default function MatchUpFormatDemo() {
  const containerRef = useRef(null);
  const resultsRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Dynamically import courthive-components
    import('courthive-components')
      .then(({ getMatchUpFormatModal }) => {
        if (containerRef.current) {
          // Clear previous content
          containerRef.current.innerHTML = '';

          // Create description
          const description = document.createElement('div');
          description.style.marginBottom = '1em';
          description.style.color = '#666';
          description.innerHTML =
            'Configure matchUp format codes interactively. ' +
            'Choose the number of sets, scoring format, tiebreak rules, and final set variations. ' +
            'The editor will generate the TODS-compliant matchUpFormat code.';

          // Create button
          const button = document.createElement('button');
          button.className = 'button button--primary button--lg';
          button.textContent = '🎾 Configure Match Format';
          button.style.marginBottom = '1em';

          button.onclick = () => {
            getMatchUpFormatModal({
              matchUpFormat: result?.matchUpFormat, // Re-launch with last value
              callback: (matchUpFormat) => {
                // Store the result so we can re-launch with it
                const formatResult = {
                  matchUpFormat,
                  timestamp: new Date().toISOString(),
                };

                setResult(formatResult);
                setError(null);

                // Display results with JSON viewer
                if (resultsRef.current && matchUpFormat) {
                  resultsRef.current.innerHTML = '';

                  // Create header
                  const header = document.createElement('div');
                  header.style.marginBottom = '1em';
                  header.style.padding = '1em';
                  header.style.backgroundColor = '#f0f0f0';
                  header.style.borderRadius = '4px';
                  header.innerHTML = `
                    <strong style="font-size: 1.2em;">Match Format Code</strong><br/>
                    <code style="font-size: 1.1em; background: #fff; padding: 0.5em; display: inline-block; margin-top: 0.5em; border-radius: 3px;">
                      ${matchUpFormat}
                    </code>
                  `;

                  resultsRef.current.appendChild(header);

                  // Display JSON viewer with full result
                  createJsonViewer(resultsRef.current, formatResult, { expanded: 2 });
                }
              },
            });
          };

          containerRef.current.appendChild(description);
          containerRef.current.appendChild(button);
        }
      })
      .catch((err) => {
        console.error('Failed to load courthive-components:', err);
        setError('Failed to load matchUp format editor');
      });
  }, [result]); // Re-run when result changes to update button handler with latest value

  return (
    <div style={{ marginBottom: '2em' }}>
      <div ref={containerRef} />
      {error && <div style={{ color: 'red', padding: '1em', backgroundColor: '#fee' }}>{error}</div>}
      <div ref={resultsRef} />
    </div>
  );
}
