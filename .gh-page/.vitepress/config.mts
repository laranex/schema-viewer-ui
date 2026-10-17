import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const base = '/schema-viewer-ui/'
const repository = 'https://github.com/laranex/schema-viewer-ui'
const require = createRequire(import.meta.url)

export default defineConfig({
  title: 'Laranex Schema Viewer UI',
  description: 'One JSON contract, one shared viewer: the laranex-schema contract and the interactive ERD viewer behind the Laravel, Python and Node.js schema viewers.',
  lang: 'en-US',
  base,
  cleanUrls: false,
  appearance: 'dark',
  srcDir: '../docs',
  vite: {
    publicDir: fileURLToPath(new URL('../public', import.meta.url)),
    // Markdown lives outside the Node project; resolve Vue from this project.
    resolve: { alias: [
      { find: /^vue$/, replacement: require.resolve('vue/dist/vue.runtime.esm-bundler.js') },
      { find: 'vue/server-renderer', replacement: require.resolve('vue/server-renderer') },
    ] },
    // The package root has its own node_modules (newer, ESM-only entities and estree-walker); keep Vue's server-side
    // packages external so Node loads them with this project's dependencies instead of bundling them from the root.
    ssr: { external: ['@vue/compiler-ssr', '@vue/compiler-dom', '@vue/compiler-core'] },
  },
  lastUpdated: false,
  sitemap: { hostname: 'https://laranex.github.io/schema-viewer-ui/' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Laranex Schema Viewer UI' }],
  ],
  markdown: { theme: { light: 'github-light', dark: 'github-dark' }, lineNumbers: false },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Laranex',
    nav: [
      { text: 'Schema Viewer UI', link: '/introduction' },
      { text: 'Contract', link: '/contract' },
      { text: 'Live demo', link: '/demo' },
      { text: 'Laranex projects', link: 'https://laranex.vercel.app/' },
    ],
    sidebar: [
      { text: 'GET STARTED', items: [
        { text: 'Introduction', link: '/introduction' },
        { text: 'Installation', link: '/installation' },
        { text: 'Quick start', link: '/quick-start' },
        { text: 'Live demo', link: '/demo' },
      ] },
      { text: 'THE VIEWER', items: [
        { text: 'Using the viewer', link: '/viewer' },
        { text: 'Comparisons, migrations, inferences', link: '/views' },
        { text: 'Integrating a host', link: '/integration' },
        { text: 'React API', link: '/react' },
      ] },
      { text: 'THE CONTRACT', items: [
        { text: 'laranex-schema 1.0', link: '/contract' },
        { text: 'Validation & conformance', link: '/conformance' },
      ] },
      { text: 'REFERENCE', items: [
        { text: 'Roadmap', link: '/roadmap' },
        { text: 'Troubleshooting', link: '/troubleshooting' },
      ] },
    ],
    search: { provider: 'local', options: { detailedView: true } },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [
      { icon: 'github', link: repository },
      { icon: 'npm', link: 'https://www.npmjs.com/package/laranex-schema-viewer-ui' },
    ],
    editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Improve this page on GitHub' },
    footer: { message: 'Open source under the MIT license.', copyright: 'Laranex · Built by developers, for developers.' },
    docFooter: { prev: 'Previous page', next: 'Next page' },
    externalLinkIcon: true,
  },
})
