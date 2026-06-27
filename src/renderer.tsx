import { jsxRenderer } from 'hono/jsx-renderer'

// Bump this whenever static CSS/JS changes so browsers fetch the latest assets
// (prevents the "old styling cached" problem where pages look unchanged).
export const ASSET_VER = '24'

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title || 'TrustLens AI'}</title>
        <meta name="description" content="TrustLens AI — See. Verify. Solve. An AI-powered hyperlocal civic issue resolution platform where an autonomous Gemini agent triages, verifies, routes and resolves community issues." />
        <meta name="theme-color" content="#1D9E75" />
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
        // Warm, human-centered civic palette — earthy teal on sage cream.
        "primary": "#1D9E75",
        "on-primary": "#ffffff",
        "primary-container": "#E1F5EE",
        "on-primary-container": "#0F6E56",
        "primary-fixed": "#E1F5EE",
        "primary-fixed-dim": "#bfe9da",
        "surface-tint": "#1D9E75",
        "secondary": "#27AE60",
        "secondary-container": "#E1F5EE",
        "on-secondary-container": "#0F6E56",
        "tertiary": "#E67E22",
        "tertiary-fixed": "#fbe8d4",
        "on-tertiary-fixed": "#9a4a10",
        "tertiary-container": "#E67E22",
        "on-tertiary-container": "#7c3a08",
        "error": "#C0392B",
        "error-container": "#f6e1de",
        "on-error-container": "#8c2318",
        "background": "#F0EDDF",
        "on-background": "#1A1A1A",
        "surface": "#F0EDDF",
        "surface-lowest": "#FAFAF7",
        "surface-container-lowest": "#FAFAF7",
        "surface-container-low": "#f5f3e9",
        "surface-container": "#eceadd",
        "surface-container-high": "#e6e3d4",
        "surface-container-highest": "#e0ddce",
        "surface-variant": "#e6e3d4",
        "on-surface": "#1A1A1A",
        "on-surface-variant": "#5A5A52",
        "outline": "#c9c5b8",
        "outline-variant": "#E0DDD4",
      },
      fontFamily: { sans: ["Inter", "sans-serif"] },
      fontWeight: { medium: "500", semibold: "500", bold: "500", extrabold: "600" },
      borderRadius: { DEFAULT: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", full: "9999px" },
      spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "container-margin": "20px" },
    },
  },
}
`
