/**
 * Interactive JSON Viewer
 * A lightweight, expandable JSON tree viewer with syntax highlighting
 * Copied from courthive-components for use in documentation demos
 */

interface JsonViewerOptions {
  expanded?: number; // Number of levels to expand by default
  theme?: 'light' | 'dark';
}

export class JsonViewer {
  private readonly container: HTMLElement;
  private readonly options: JsonViewerOptions;

  constructor(container: HTMLElement, data: any, options: JsonViewerOptions = {}) {
    this.container = container;
    this.options = {
      expanded: options.expanded ?? 1,
      theme: options.theme ?? 'light',
    };

    this.render(data);
  }

  private render(data: any) {
    this.container.innerHTML = '';
    this.container.style.fontFamily = 'Monaco, Menlo, "Ubuntu Mono", monospace';
    this.container.style.fontSize = '13px';
    this.container.style.lineHeight = '1.5';

    // Add custom styles
    this.injectStyles();

    const tree = this.createNode(data, 0, '');
    this.container.appendChild(tree);
  }

  private injectStyles() {
    const styleId = 'json-viewer-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .json-viewer-container {
        background: #f8f8f8;
        padding: 12px;
        border-radius: 4px;
        overflow: auto;
        max-height: 600px;
      }
      
      .json-viewer-line {
        display: flex;
        align-items: flex-start;
        margin: 2px 0;
      }
      
      .json-viewer-toggle {
        cursor: pointer;
        user-select: none;
        width: 16px;
        flex-shrink: 0;
        color: #666;
        font-weight: bold;
      }
      
      .json-viewer-toggle:hover {
        color: #1976d2;
      }
      
      .json-viewer-key {
        color: #881391;
        font-weight: 500;
        margin-right: 6px;
      }
      
      .json-viewer-string {
        color: #c41a16;
      }
      
      .json-viewer-number {
        color: #1c00cf;
      }
      
      .json-viewer-boolean {
        color: #0d22aa;
        font-weight: bold;
      }
      
      .json-viewer-null {
        color: #808080;
        font-style: italic;
      }
      
      .json-viewer-bracket {
        color: #000;
        font-weight: bold;
      }
      
      .json-viewer-children {
        margin-left: 20px;
        border-left: 1px solid #ddd;
        padding-left: 8px;
      }
      
      .json-viewer-collapsed {
        display: none;
      }
      
      .json-viewer-summary {
        color: #999;
        font-style: italic;
        margin-left: 6px;
      }
      
      .json-viewer-comma {
        color: #000;
      }
    `;
    document.head.appendChild(style);
  }

  private createNode(value: any, level: number, key: string, isLast = true): HTMLElement {
    const wrapper = document.createElement('div');

    if (value === null) {
      wrapper.appendChild(this.createLine(key, this.span('null', 'json-viewer-null'), isLast));
    } else if (typeof value === 'string') {
      wrapper.appendChild(this.createLine(key, this.span(`"${value}"`, 'json-viewer-string'), isLast));
    } else if (typeof value === 'number') {
      wrapper.appendChild(this.createLine(key, this.span(String(value), 'json-viewer-number'), isLast));
    } else if (typeof value === 'boolean') {
      wrapper.appendChild(this.createLine(key, this.span(String(value), 'json-viewer-boolean'), isLast));
    } else if (Array.isArray(value)) {
      wrapper.appendChild(this.createComplexNode(value, level, key, true, isLast));
    } else if (typeof value === 'object') {
      wrapper.appendChild(this.createComplexNode(value, level, key, false, isLast));
    }

    return wrapper;
  }

  private createLine(key: string, valueSpan: HTMLElement, isLast: boolean): HTMLElement {
    const line = document.createElement('div');
    line.className = 'json-viewer-line';

    // Empty toggle space for alignment
    const toggle = document.createElement('span');
    toggle.className = 'json-viewer-toggle';
    toggle.textContent = ' ';
    line.appendChild(toggle);

    if (key) {
      const keySpan = this.span(`${key}: `, 'json-viewer-key');
      line.appendChild(keySpan);
    }

    line.appendChild(valueSpan);

    if (!isLast) {
      line.appendChild(this.span(',', 'json-viewer-comma'));
    }

    return line;
  }

  private createComplexNode(value: any, level: number, key: string, isArray: boolean, isLast: boolean): HTMLElement {
    const container = document.createElement('div');

    const headerLine = document.createElement('div');
    headerLine.className = 'json-viewer-line';

    // Toggle button
    const toggle = document.createElement('span');
    toggle.className = 'json-viewer-toggle';
    const expanded = level < (this.options.expanded ?? 1);
    toggle.textContent = expanded ? '▼' : '▶';
    headerLine.appendChild(toggle);

    // Key
    if (key) {
      const keySpan = this.span(`${key}: `, 'json-viewer-key');
      headerLine.appendChild(keySpan);
    }

    // Opening bracket
    const openBracket = isArray ? '[' : '{';
    headerLine.appendChild(this.span(openBracket, 'json-viewer-bracket'));

    // Summary when collapsed
    const summary = document.createElement('span');
    summary.className = 'json-viewer-summary';
    if (isArray) {
      summary.textContent = ` ${value.length} items `;
    } else {
      const keys = Object.keys(value);
      summary.textContent = ` ${keys.length} keys `;
    }
    if (!expanded) {
      headerLine.appendChild(summary);
    }

    // Closing bracket (for collapsed view)
    const closeBracketCollapsed = document.createElement('span');
    closeBracketCollapsed.className = 'json-viewer-bracket';
    closeBracketCollapsed.textContent = isArray ? ']' : '}';
    if (!expanded) {
      headerLine.appendChild(closeBracketCollapsed);
    }

    if (!isLast) {
      const comma = this.span(',', 'json-viewer-comma');
      if (!expanded) {
        headerLine.appendChild(comma);
      }
    }

    container.appendChild(headerLine);

    // Children container
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'json-viewer-children';
    if (!expanded) {
      childrenContainer.classList.add('json-viewer-collapsed');
    }

    const entries = isArray ? value.map((v: any, i: number) => [i, v]) : Object.entries(value);

    entries.forEach(([k, v]: [any, any], index: number) => {
      const childKey = isArray ? '' : String(k);
      const childIsLast = index === entries.length - 1;
      childrenContainer.appendChild(this.createNode(v, level + 1, childKey, childIsLast));
    });

    container.appendChild(childrenContainer);

    // Closing bracket line (for expanded view)
    const closingLine = document.createElement('div');
    closingLine.className = 'json-viewer-line';
    if (!expanded) {
      closingLine.classList.add('json-viewer-collapsed');
    }

    const emptyToggle = document.createElement('span');
    emptyToggle.className = 'json-viewer-toggle';
    emptyToggle.textContent = ' ';
    closingLine.appendChild(emptyToggle);

    closingLine.appendChild(this.span(isArray ? ']' : '}', 'json-viewer-bracket'));
    if (!isLast) {
      closingLine.appendChild(this.span(',', 'json-viewer-comma'));
    }

    container.appendChild(closingLine);

    // Toggle functionality
    toggle.addEventListener('click', () => {
      const isCurrentlyExpanded = toggle.textContent === '▼';
      toggle.textContent = isCurrentlyExpanded ? '▶' : '▼';

      if (isCurrentlyExpanded) {
        // Collapse
        childrenContainer.classList.add('json-viewer-collapsed');
        closingLine.classList.add('json-viewer-collapsed');
        headerLine.appendChild(summary);
        headerLine.appendChild(closeBracketCollapsed);
        if (!isLast) {
          headerLine.appendChild(this.span(',', 'json-viewer-comma'));
        }
      } else {
        // Expand
        childrenContainer.classList.remove('json-viewer-collapsed');
        closingLine.classList.remove('json-viewer-collapsed');
        // Remove summary and collapsed bracket from header
        if (summary.parentNode) summary.remove();
        if (closeBracketCollapsed.parentNode) closeBracketCollapsed.remove();
        // Remove comma from header if it was added
        const headerComma = headerLine.querySelector('.json-viewer-comma');
        if (headerComma) headerComma.remove();
      }
    });

    return container;
  }

  private span(text: string, className: string): HTMLElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  // Public method to update data
  public update(data: any) {
    this.render(data);
  }
}

/**
 * Helper function to create a JSON viewer
 */
export function createJsonViewer(container: HTMLElement, data: any, options?: JsonViewerOptions) {
  container.className = 'json-viewer-container';
  return new JsonViewer(container, data, options);
}
