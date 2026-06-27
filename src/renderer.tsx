import { jsxRenderer } from 'hono/jsx-renderer'

// Bump this whenever static CSS/JS changes so browsers fetch the latest assets
// (prevents the "old styling cached" problem where pages look unchanged).
export const ASSET_VER = '12'

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title || 'TrustLens AI'}</title>
        <meta name="description" content="TrustLens AI — See. Verify. Solve. An AI-powered hyperlocal civic issue resolution platform where an autonomous Gemini agent triages, verifies, routes and resolves community issues." />
        <meta name="theme-color" content="#2563EB" />
        {/* Social / link preview */}
        <meta property="og:title" content="TrustLens AI — See. Verify. Solve." />
        <meta property="og:description" content="AI-powered hyperlocal civic issue resolution platform. One autonomous agent runs the whole loop." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <link rel="icon" type="image/svg+xml" href="/static/logo.svg" />
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
        <link href={`/static/style.css?v=${ASSET_VER}`} rel="stylesheet" />
        <script src="/static/firebase-config.js"></script>
        <script src={`/static/common.js?v=${ASSET_VER}`}></script>
        <script src={`/static/chat.js?v=${ASSET_VER}`}></script>
        <script src={`/static/notifications.js?v=${ASSET_VER}`}></script>
        <script type="module" src={`/static/firebase-auth.js?v=${ASSET_VER}`}></script>
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
        "primary": "#2563EB",
        "on-primary": "#ffffff",
        "primary-container": "#dbe8ff",
        "on-primary-container": "#1e3a8a",
        "primary-fixed": "#eff5ff",
        "primary-fixed-dim": "#bfd6ff",
        "surface-tint": "#3b82f6",
        "secondary": "#10B981",
        "secondary-container": "#d1fae5",
        "on-secondary-container": "#065f46",
        "tertiary": "#b45309",
        "tertiary-fixed": "#fff0d6",
        "on-tertiary-fixed": "#7c2d12",
        "tertiary-container": "#f59e0b",
        "on-tertiary-container": "#7c2d12",
        "error": "#ef4444",
        "error-container": "#fee2e2",
        "on-error-container": "#991b1b",
        "background": "#f6f8fc",
        "on-background": "#0f172a",
        "surface": "#f6f8fc",
        "surface-lowest": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f1f5f9",
        "surface-container": "#e9eef5",
        "surface-container-high": "#e2e8f0",
        "surface-container-highest": "#dbe2ea",
        "surface-variant": "#e2e8f0",
        "on-surface": "#0f172a",
        "on-surface-variant": "#475569",
        "outline": "#94a3b8",
        "outline-variant": "#cbd5e1",
      },
      fontFamily: { sans: ["Inter", "sans-serif"] },
      borderRadius: { DEFAULT: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", full: "9999px" },
      spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "container-margin": "20px" },
    },
  },
}
`
