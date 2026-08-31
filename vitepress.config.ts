import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/',
  title: 'actionstack',
  description: 'Documentation and guides.',
  mpa: true,

  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Pricing', link: '/PRICING' },
      { text: 'Changelog', link: '/CHANGELOG' },
      { text: 'API Reference', link: '/api/' },
      {
        text: 'Legal',
        items: [
          { text: 'Terms of Service', link: '/TERMS-OF-SERVICE' },
          { text: 'Privacy Policy', link: '/PRIVACY-POLICY' },
          { text: 'Refund Policy', link: '/REFUND-POLICY' }
        ]
      },
      { text: 'GitHub', link: 'https://github.com/epikodelabs/actionstack-community' }
    ],

    sidebar: {
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Enumerations', link: '/api/#enumerations' },
            { text: 'Functions', link: '/api/#functions' },
            { text: 'Interfaces', link: '/api/#interfaces' },
            { text: 'Type Aliases', link: '/api/#type-aliases' },
            { text: 'Variables', link: '/api/#variables' }
          ]
        }
      ],
      '/': [
        {
          text: 'Documentation',
          items: [
            { text: 'Getting Started', link: '/' },
            { text: 'Changelog', link: '/CHANGELOG' },
            { text: 'Angular', link: '/ANGULAR' },
            { text: 'Middleware', link: '/MIDDLEWARE' },
            { text: 'Modules', link: '/MODULES' },
            { text: 'Pricing', link: '/PRICING' },
            { text: 'Starter', link: '/STARTER' },
            { text: 'React', link: '/REACT' },
            { text: 'Why', link: '/WHY' }
          ]
        },
        {
          text: 'Legal',
          items: [
            { text: 'Terms of Service', link: '/TERMS-OF-SERVICE' },
            { text: 'Privacy Policy', link: '/PRIVACY-POLICY' },
            { text: 'Refund Policy', link: '/REFUND-POLICY' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Full API Docs', link: '/api/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/epikodelabs/actionstack-community' }
    ],

    footer: {
      message: 'Released under the GNU AGPL v3.',
      copyright: 'Copyright (c) 2026 epikodelabs'
    },

    search: {
      provider: 'local'
    },

    lastUpdated: {
      text: 'Updated at',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'medium'
      }
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true
  },

  head: [
    ['meta', { charset: 'utf-8' }],
    ['link', { rel: 'icon', href: '/actionstack/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'actionstack' }]
  ]
})
