/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Competition Factory',
  tagline: 'Open-source engine for tournament management — draws, scheduling, scoring, and more.',
  url: 'https://courthive.github.com',
  baseUrl: '/competition-factory/',
  onBrokenLinks: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'CourtHive',
  projectName: 'competition-factory',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
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
