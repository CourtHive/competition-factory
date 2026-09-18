import React, { useEffect, useRef, useState } from 'react';

/**
 * Wrapper component for the Age Category Code editor from courthive-components
 */
export default function AgeCategoryEditor() {
  const containerRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Dynamically import courthive-components
    import('courthive-components')
      .then(({ getAgeCategoryModal }) => {
        if (containerRef.current) {
          // Clear previous content
          containerRef.current.innerHTML = '';

          // Create button
          const button = document.createElement('button');
          button.className = 'button button--primary button--lg';
          button.textContent = 'Open Age Category Editor';
          button.style.marginBottom = '1em';

          button.onclick = () => {
            getAgeCategoryModal({
              consideredDate: new Date().toISOString().split('T')[0],
              callback: (category) => {
                setResult(category);
                setError(null);
              },
            });
          };

          containerRef.current.appendChild(button);
        }
      })
      .catch((err) => {
        console.error('Failed to load Age Category editor:', err);
        setError('Failed to load editor. Please ensure courthive-components is installed.');
      });
  }, []);

  return (
    <div style={{ margin: '2em 0', padding: '2em', background: '#f6f8fa', borderRadius: '8px' }}>
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

      {result && (
        <div
          style={{
            marginTop: '1em',
            padding: '1em',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        >
          <strong>Selected Category:</strong>
          <pre
            style={{
              marginTop: '0.5em',
              padding: '1em',
              background: '#f5f5f5',
              borderRadius: '4px',
              overflow: 'auto',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
          <div style={{ marginTop: '0.5em', fontSize: '0.9em', color: '#666', fontStyle: 'italic' }}>
            Click the button again to test round-trip editing
          </div>
        </div>
      )}
    </div>
  );
}
