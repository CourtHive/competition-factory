/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Competition Factory',
  tagline: 'Open-source engine for tournament management — draws, scheduling, scoring, and more.',
  url: 'https://courthive.github.io',
  baseUrl: '/competition-factory/',
  // trailingSlash is intentionally left UNSET. Docusaurus warns about this on a
  // GitHub Pages deploy, but the warning is cosmetic — and setting it either way
  // breaks internal links: the docs are authored with relative sibling links
  // ending in a slash (e.g. `./data-standards/`), which only resolve correctly
  // under the default. `true` re-bases them under the current page (404s);
  // `false` switches to flat .html output so the slash target has no folder.
  // Silencing the warning would require rewriting those relative links repo-wide.
  //
  // onBrokenLinks is 'throw' so the CI docs job can actually fail. Under 'warn' the build
  // still exits 0 with broken links in it, which makes a "docs build" gate report clean for a
  // site that is broken — a check that cannot report dirty is not a check. Verified at the time
  // of the change: the site builds clean under 'throw', so this fails only on NEW breakage.
  onBrokenLinks: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'CourtHive',
  projectName: 'competition-factory',
  markdown: {
    mermaid: true,
    hooks: {
      // 'throw' for the same reason as onBrokenLinks above: a markdown link to a file that does
      // not exist is a defect, and warning about it lets it ship.
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Competition Factory',
      logo: {
        alt: 'CourtHive Logo',
        src: 'img/CourtHive.svg',
        srcDark: 'img/CourtHive-dark.svg',
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/CourtHive/competition-factory',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} CourtHive`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  plugins: [
    [
      require.resolve('@cmfcmf/docusaurus-search-local'),
      {
        maxSearchResults: 8,
        indexBlog: false,
        style: undefined,
      },
    ],
  ],
};
