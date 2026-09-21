import React, { useEffect, useRef, useState } from 'react';
import { createJsonViewer } from '../helpers/jsonViewer';

/**
 * Flight Profile Editor Demo
 * Demonstrates the getFlightProfileModal from courthive-components
 */
export default function FlightProfileDemo() {
  const containerRef = useRef(null);
  const resultsRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Dynamically import courthive-components
    import('courthive-components')
      .then(({ getFlightProfileModal }) => {
        if (containerRef.current) {
          // Clear previous content
          containerRef.current.innerHTML = '';

          // Create description
          const description = document.createElement('div');
          description.style.marginBottom = '1em';
          description.style.color = '#666';
          description.innerHTML =
            'Configure flight profiles to automatically segment participants into multiple draws based on ratings or rankings. ' +
            'Choose the number of flights, distribution method, naming convention, and rating scale.';

          // Create button
          const button = document.createElement('button');
          button.className = 'button button--primary button--lg';
          button.textContent = '✈️ Configure Flight Profile';
          button.style.marginBottom = '1em';

          button.onclick = () => {
            getFlightProfileModal({
              editorConfig: {
                eventType: 'SINGLES',
                labels: {
                  title: 'Flight Profile Configuration',
                },
              },
              callback: (modalOutput) => {
                // Enrich modal output with eventType (like in Storybook helper)
                const flightProfile = {
                  ...modalOutput,
                  scaleAttributes: {
                    ...modalOutput.scaleAttributes,
                    eventType: 'SINGLES', // Add eventType from context
                  },
                };

                setResult(flightProfile);
                setError(null);

                // Display results with JSON viewer
                if (resultsRef.current && flightProfile) {
                  resultsRef.current.innerHTML = '';

                  // Create header
                  const header = document.createElement('div');
                  header.style.marginBottom = '1em';
                  header.style.padding = '1em';
                  header.style.backgroundColor = '#f0f0f0';
                  header.style.borderRadius = '4px';
                  header.innerHTML = `
                    <strong style="font-size: 1.2em;">Flight Profile Configuration</strong><br/>
                    <span style="color: #666;">
                      Flights: ${flightProfile.flightsCount || 'N/A'} | 
                      Split Method: ${flightProfile.splitMethod || 'N/A'}
                    </span>
                  `;

                  resultsRef.current.appendChild(header);

                  // Display JSON viewer
                  createJsonViewer(resultsRef.current, flightProfile, { expanded: 2 });
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
        setError('Failed to load flight profile editor');
      });
  }, []);

  return (
    <div style={{ marginBottom: '2em' }}>
      <div ref={containerRef} />
      {error && <div style={{ color: 'red', padding: '1em', backgroundColor: '#fee' }}>{error}</div>}
      <div ref={resultsRef} />
    </div>
  );
}
