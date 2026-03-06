import React, { useEffect, useRef, useState } from 'react';
import 'courthive-components/dist/courthive-components.css';

/**
 * Read-only topology viewer for draw type documentation pages.
 * Renders a pre-loaded topology with draggable nodes but no editing controls.
 *
 * Props:
 *   initialState - TopologyState with nodes, edges, drawName
 *   height       - Container height in px (default 400)
 */
const TopologyViewer = ({ initialState, height = 400 }) => {
  const containerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    import('courthive-components').then((module) => {
      const { TopologyBuilderControl } = module;
      containerRef.current.innerHTML = '';

      const controller = new TopologyBuilderControl({
        initialState: {
          ...initialState,
          templateName: initialState.templateName ?? initialState.drawName,
        },
        readOnly: true,
        hideDelete: true,
        hideGenerate: true,
        hideTemplates: true,
      });
      controller.render(containerRef.current);
      setLoaded(true);
    });
  }, []);

  return (
    <div>
      {!loaded && <div>Loading topology...</div>}
      <div ref={containerRef} style={{ height: `${height}px` }} />
    </div>
  );
};

export default TopologyViewer;
