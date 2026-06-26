import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title || 'Community Hero AI'}</title>
        <meta name="description" content="AI-powered hyperlocal civic issue reporting. Citizens report problems with a photo or video; an autonomous Gemini agent triages, prioritizes, and routes them — the community verifies and the city resolves." />
        <meta name="theme-color" content="#003d9b" />
        {/* Social / link preview */}
        <meta property="og:title" content="Community Hero AI" />
        <meta property="og:description" content="Turn citizen reports into prioritized, accountable civic action with an autonomous AI agent." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <link href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script dangerouslySetInnerHTML={{ __html: tailwindConfig }} />
        <link href="/static/style.css" rel="stylesheet" />
        <script src="/static/firebase-config.js"></script>
        <script src="/static/common.js"></script>
        <script src="/static/chat.js"></script>
        <script src="/static/notifications.js"></script>
        <script type="module" src="/static/firebase-auth.js"></script>
      </head>
      <body class="bg-background text-on-background min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
})

const tailwindConfig = `
tailwind.config = {
  theme: {
    extend: {
      colors: {
        "primary": "#003d9b",
        "on-primary": "#ffffff",
        "primary-container": "#0052cc",
        "on-primary-container": "#c4d2ff",
        "primary-fixed": "#dae2ff",
        "primary-fixed-dim": "#b2c5ff",
        "surface-tint": "#0c56d0",
        "secondary": "#006c47",
        "secondary-container": "#82f9be",
        "on-secondary-container": "#00734c",
        "tertiary": "#5e3c00",
        "tertiary-fixed": "#ffddb3",
        "on-tertiary-fixed": "#291800",
        "tertiary-container": "#7d5200",
        "on-tertiary-container": "#ffca81",
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        "background": "#f8f9fb",
        "on-background": "#191c1e",
        "surface": "#f8f9fb",
        "surface-lowest": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f4f6",
        "surface-container": "#edeef0",
        "surface-container-high": "#e7e8ea",
        "surface-container-highest": "#e1e2e4",
        "surface-variant": "#e1e2e4",
        "on-surface": "#191c1e",
        "on-surface-variant": "#434654",
        "outline": "#737685",
        "outline-variant": "#c3c6d6",
      },
      fontFamily: { sans: ["Inter", "sans-serif"] },
      borderRadius: { DEFAULT: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", full: "9999px" },
      spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "container-margin": "20px" },
    },
  },
}
`
