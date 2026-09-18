import React, { useEffect, useRef, useState } from 'react';
import { createJsonViewer } from '../helpers/jsonViewer';

/**
 * Mock Participants Generator Demo
 * Demonstrates the getMockParticipantsModal from courthive-components
 */
export default function MockParticipantsDemo() {
  const containerRef = useRef(null);
  const resultsRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Dynamically import courthive-components
    import('courthive-components')
      .then(({ getMockParticipantsModal }) => {
        if (containerRef.current) {
          // Clear previous content
          containerRef.current.innerHTML = '';

          // Create description
          const description = document.createElement('div');
          description.style.marginBottom = '1em';
          description.style.color = '#666';
          description.innerHTML =
            'Generate mock participants with demographics, ratings, and rankings. ' +
            'Configure participant count, sex, ratings, and age ranges, then view the generated data.';

          // Create button
          const button = document.createElement('button');
          button.className = 'button button--primary button--lg';
          button.textContent = '🎯 Generate Mock Participants';
          button.style.marginBottom = '1em';

          button.onclick = () => {
            // Get tournament end date for birthdate generation
            const consideredDate = new Date().toISOString().split('T')[0];

            getMockParticipantsModal({
              consideredDate,
              callback: (participants) => {
                setResult(participants);
                setError(null);

                // Display results with JSON viewer
                if (resultsRef.current && participants?.length > 0) {
                  resultsRef.current.innerHTML = '';

                  // Create header
                  const header = document.createElement('div');
                  header.style.marginBottom = '1em';
                  header.innerHTML = `<strong style="color: #2e7d32; font-size: 1.1em;">✓ Generated ${participants.length} Participants</strong>`;
                  resultsRef.current.appendChild(header);

                  // Create JSON viewer container
                  const viewerContainer = document.createElement('div');
                  viewerContainer.style.marginTop = '1em';

                  // Display participants with JsonViewer
                  createJsonViewer(viewerContainer, participants, { expanded: 2 });

                  resultsRef.current.appendChild(viewerContainer);
                }
              },
            });
          };

          containerRef.current.appendChild(description);
          containerRef.current.appendChild(button);
        }
      })
      .catch((err) => {
        console.error('Failed to load Mock Participants modal:', err);
        setError('Failed to load modal. Please ensure courthive-components is installed.');
      });
  }, []);

  return (
    <div style={{ margin: '1em 0', padding: '1.5em', background: '#f6f8fa', borderRadius: '8px' }}>
      <h3 style={{ marginTop: 0, color: '#1976d2' }}>Interactive Demo</h3>

      <div ref={containerRef}></div>

      {error && (
        <div
          style={{
            padding: '1em',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c00',
            marginTop: '1em',
          }}
        >
          {error}
        </div>
      )}

      <div ref={resultsRef}></div>

      {result && (
        <div
          style={{
            marginTop: '1em',
            padding: '0.75em',
            background: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: '4px',
            fontSize: '0.9em',
            color: '#1565c0',
          }}
        >
          <strong>💡 Tip:</strong> Click the button again to generate a new set with different configurations. Use the
          arrows to expand/collapse participant details.
        </div>
      )}
    </div>
  );
}
