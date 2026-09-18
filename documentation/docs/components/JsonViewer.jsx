import React, { useEffect, useRef } from 'react';
import { createJsonViewer } from '../helpers/jsonViewer';

/**
 * React wrapper for JsonViewer - Modern replacement for RenderJSON
 *
 * @param {Object} props
 * @param {any} props.data - The data to display
 * @param {number} props.expandToLevel - Number of levels to expand (default: 1)
 * @param {boolean} props.expandRoot - Whether to expand root (default: true)
 * @param {string} props.root - Label for root node (default: 'root')
 * @param {boolean} props.hideRoot - Whether to hide root node (default: false)
 * @param {boolean} props.sortObjectKeys - Whether to sort keys (ignored, always sorted)
 * @param {string} props.colorScheme - Color scheme (ignored, always uses default)
 * @param {boolean} props.invertTheme - Theme inversion (ignored, always uses default)
 */
export const JsonViewer = ({
  data,
  expandToLevel = 1,
  expandRoot = true,
  root = 'root',
  hideRoot = false,
  sortObjectKeys = true, // Ignored for compatibility
  colorScheme = 'summerfruit', // Ignored for compatibility
  invertTheme = true, // Ignored for compatibility
}) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current && data) {
      // Clear previous content
      containerRef.current.innerHTML = '';

      // Calculate effective expand level
      const expanded = expandRoot ? expandToLevel : 0;

      // Create the viewer
      viewerRef.current = createJsonViewer(containerRef.current, data, {
        expanded,
      });

      // Apply hideRoot styling if needed
      if (hideRoot) {
        // Find and hide the first level of the tree
        const firstLine = containerRef.current.querySelector('.json-viewer-line');
        if (firstLine) {
          firstLine.style.display = 'none';
        }
        // Adjust children container to remove indentation
        const firstChildren = containerRef.current.querySelector('.json-viewer-children');
        if (firstChildren) {
          firstChildren.style.marginLeft = '0';
          firstChildren.style.borderLeft = 'none';
          firstChildren.style.paddingLeft = '0';
        }
      }
    }
  }, [data, expandToLevel, expandRoot, hideRoot]);

  return <div ref={containerRef} className="json-viewer-container" style={{ marginBottom: '1em' }} />;
};

export default JsonViewer;
