import React, { useEffect, useRef, useState } from 'react';
import 'courthive-components/dist/courthive-components.css';

const TopologyBuilderDemo = () => {
  const containerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    import('courthive-components').then((module) => {
      const { TopologyBuilderControl } = module;
      containerRef.current.innerHTML = '';

      const controller = new TopologyBuilderControl({});
      controller.render(containerRef.current);
      setLoaded(true);
    });
  }, []);

  return (
    <div>
      {!loaded && <div>Loading Topology Builder...</div>}
      <style>{`.tb-layout .button.is-success { display: none; }`}</style>
      <div ref={containerRef} style={{ height: '800px' }} />
    </div>
  );
};

export default TopologyBuilderDemo;
