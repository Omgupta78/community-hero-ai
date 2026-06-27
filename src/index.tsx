import { Hono } from 'hono'
import { renderer, ASSET_VER } from './renderer'
import api from './routes/api'
import { TopBar, BottomNav } from './components/layout'
import { getSessionUser, clearCookie } from './lib/auth'

type Bindings = {
  DB: D1Database
  GEMINI_API_KEY?: string
  FIREBASE_PROJECT_ID?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)
app.route('/api', api)

// =============================================================
// LANDING — role selection entry (The Civic Resolution Network)
// =============================================================
app.get('/', (c) => {
  return c.render(
    <div class="min-h-screen flex flex-col items-center justify-center px-container-margin py-12 bg-gradient-to-b from-primary-fixed/40 to-background">
      <main class="w-full max-w-4xl mx-auto text-center">
        <img src="/static/logo.svg" alt="TrustLens AI" class="w-20 h-20 mx-auto mb-3 drop-shadow tl-float" />
        <h1 class="text-[36px] font-bold leading-none">
          <span class="text-primary">Trust</span><span class="text-secondary">Lens</span>
          <span class="align-middle text-[15px] font-bold text-on-primary bg-primary rounded-md px-1.5 py-0.5 ml-1">AI</span>
        </h1>
        <p class="text-sm font-bold tracking-[0.25em] text-on-surface-variant mt-3 uppercase">See · Verify · Solve</p>
        <p class="text-on-surface-variant max-w-xl mx-auto mt-3">
          AI-powered hyperlocal civic issue resolution platform — <b class="text-on-surface">one autonomous agent runs the whole loop, from a citizen's photo to a verified fix.</b>
        </p>

        <a href="/tour" class="group inline-flex items-center gap-2 mt-10 bg-on-surface text-surface-lowest rounded-full pl-5 pr-4 py-3 font-bold text-sm hover:shadow-lg transition active:scale-95">
          <span class="material-symbols-outlined text-[20px]">play_circle</span>
          Take the Guided Tour
          <span class="text-[11px] font-medium opacity-70 hidden sm:inline">— see the full loop in ~90s</span>
          <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </a>

        <p class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mt-8 mb-4">Or log in as</p>
        <div class="grid md:grid-cols-3 gap-md text-left">
          <a href="/home" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-primary hover:shadow-lg transition active:scale-[0.98]">
            <div class="w-12 h-12 rounded-lg bg-primary text-on-primary flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[26px]">person</span>
            </div>
            <h2 class="font-bold text-[18px] text-on-surface">Citizen</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-3">Report a problem and watch it get fixed.</p>
            <span class="text-sm font-bold text-primary flex items-center gap-1">Log in as Citizen <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
          </a>
          <a href="/login?as=municipal" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-on-surface hover:shadow-lg transition active:scale-[0.98]">
            <div class="w-12 h-12 rounded-lg bg-on-surface text-surface-lowest flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[26px]">apartment</span>
            </div>
            <h2 class="font-bold text-[18px] text-on-surface">Municipal Official</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-3">Command the agent and clear the backlog.</p>
            <span class="text-sm font-bold text-primary flex items-center gap-1">Log in as Official <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
          </a>
          <a href="/login?as=contractor" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-secondary hover:shadow-lg transition active:scale-[0.98]">
            <div class="w-12 h-12 rounded-lg bg-secondary text-white flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[26px]">construction</span>
            </div>
            <h2 class="font-bold text-[18px] text-on-surface">Contractor / Responder</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-3">Win jobs, prove the fix, get paid.</p>
            <span class="text-sm font-bold text-secondary flex items-center gap-1">Log in as Responder <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
          </a>
        </div>

        <div class="flex items-center justify-center gap-lg mt-8 text-xs text-on-surface-variant flex-wrap">
          <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px] text-primary">shield</span><b class="text-on-surface">Trust</b> — transparency &amp; accountability</span>
          <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px] text-secondary">center_focus_strong</span><b class="text-on-surface">Lens</b> — AI analyzes every issue accurately</span>
        </div>
        <p class="text-xs text-on-surface-variant mt-4">You can switch roles anytime.</p>
      </main>
    </div>,
    { title: 'TrustLens AI — See. Verify. Solve.' }
  )
})

// =============================================================
// GUIDED TOUR — interactive walkthrough of the full civic loop
// =============================================================
app.get('/tour', (c) => {
  return c.render(
    <div class="tour-scope" id="tour-root">
      <header class="tour-top">
        <a href="/" class="tour-brand">
          <img src="/static/logo.svg" class="w-7 h-7" alt="" />
          <span><b>Trust</b>Lens<span class="tour-badge">AI</span></span>
        </a>
        <a href="/" class="tour-skip">Skip tour <span class="material-symbols-outlined">close</span></a>
      </header>

      <div class="tour-progress"><div id="tour-bar" class="tour-bar"></div></div>

      <main class="tour-main">
        <div id="tour-stage" class="tour-stage"></div>
        <div class="tour-controls">
          <button id="tour-prev" class="tour-btn tour-btn-line"><span class="material-symbols-outlined">arrow_back</span> Back</button>
          <div id="tour-dots" class="tour-dots"></div>
          <button id="tour-next" class="tour-btn tour-btn-primary">Next <span class="material-symbols-outlined">arrow_forward</span></button>
        </div>
      </main>

      <script src={`/static/tour.js?v=${ASSET_VER}`}></script>
    </div>,
    { title: 'Guided Tour · TrustLens AI' }
  )
})

// =============================================================
// CITIZEN PORTAL
// =============================================================

// Home Dashboard (citizen)
app.get('/home', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar />
      <main class="px-container-margin max-w-3xl mx-auto space-y-xl">
        {/* Hero stats */}
        <section class="mt-lg">
          <div class="bg-surface-container-low rounded-xl p-lg border border-outline-variant relative overflow-hidden">
            <div class="absolute -right-10 -top-10 w-32 h-32 bg-primary-container rounded-full opacity-20 blur-2xl"></div>
            <h2 class="text-[18px] font-semibold text-on-surface mb-sm">Community Impact</h2>
            <div class="flex items-end gap-sm">
              <span class="text-[32px] font-bold leading-none text-primary" id="stat-resolved">—</span>
              <span class="text-sm text-on-surface-variant mb-1">Issues resolved in your area</span>
            </div>
            <div class="mt-md flex items-center gap-xs text-secondary">
              <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">trending_up</span>
              <span class="text-xs font-bold tracking-wide">AI-powered civic problem solving</span>
            </div>
          </div>
        </section>

        {/* Stat cards */}
        <section class="grid grid-cols-2 gap-md">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <div class="flex items-center gap-2 text-primary mb-1">
              <span class="material-symbols-outlined">report</span>
              <span class="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Open Issues</span>
            </div>
            <span class="text-2xl font-bold text-on-surface" id="stat-open">—</span>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <div class="flex items-center gap-2 text-secondary mb-1">
              <span class="material-symbols-outlined">task_alt</span>
              <span class="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Resolved</span>
            </div>
            <span class="text-2xl font-bold text-on-surface" id="stat-resolved2">—</span>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <div class="flex items-center gap-2 text-tertiary mb-1">
              <span class="material-symbols-outlined">folder_shared</span>
              <span class="text-xs font-bold uppercase tracking-wide text-on-surface-variant">My Reports</span>
            </div>
            <span class="text-2xl font-bold text-on-surface" id="stat-mine">—</span>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <div class="flex items-center gap-2 text-primary mb-1">
              <span class="material-symbols-outlined">military_tech</span>
              <span class="text-xs font-bold uppercase tracking-wide text-on-surface-variant">My Score</span>
            </div>
            <span class="text-2xl font-bold text-on-surface" id="stat-score">—</span>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <h3 class="text-xs font-bold text-on-surface-variant mb-md uppercase tracking-widest">Quick Actions</h3>
          <div class="grid grid-cols-4 gap-sm">
            <a href="/report" class="bg-primary-container text-on-primary-container rounded-xl p-md flex flex-col items-center justify-center gap-sm min-h-[100px] active:scale-95 transition-transform hover:bg-surface-tint hover:text-on-primary">
              <span class="material-symbols-outlined text-[32px]">add_circle</span>
              <span class="text-xs text-center font-medium">Report Issue</span>
            </a>
            <a href="/impact" class="bg-surface-lowest border border-outline-variant text-primary rounded-xl p-md flex flex-col items-center justify-center gap-sm min-h-[100px] active:scale-95 transition-transform hover:bg-surface-container">
              <span class="material-symbols-outlined text-[32px]">insights</span>
              <span class="text-xs text-center font-medium">Impact</span>
            </a>
            <a href="/verify" class="bg-surface-lowest border border-outline-variant text-primary rounded-xl p-md flex flex-col items-center justify-center gap-sm min-h-[100px] active:scale-95 transition-transform hover:bg-surface-container">
              <span class="material-symbols-outlined text-[32px]">verified</span>
              <span class="text-xs text-center font-medium">Verify Reports</span>
            </a>
            <a href="/leaderboard" class="bg-surface-lowest border border-outline-variant text-primary rounded-xl p-md flex flex-col items-center justify-center gap-sm min-h-[100px] active:scale-95 transition-transform hover:bg-surface-container">
              <span class="material-symbols-outlined text-[32px]">leaderboard</span>
              <span class="text-xs text-center font-medium">Leaderboard</span>
            </a>
          </div>
        </section>

        {/* Recent issues */}
        <section>
          <div class="flex justify-between items-center mb-md">
            <h3 class="text-[18px] font-semibold text-on-surface">Recent Local Issues</h3>
            <a href="/map" class="text-xs font-bold text-primary flex items-center gap-xs hover:underline">
              View All <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          </div>
          <div id="recent-issues" class="space-y-md">
            <div class="text-center text-on-surface-variant py-8">Loading issues…</div>
          </div>
        </section>
      </main>
      <BottomNav active="home" />
      <script src="/static/home.js"></script>
    </div>,
    { title: 'TrustLens AI — Home' }
  )
})

// Report Issue page
app.get('/report', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[120px]">
      <TopBar title="Report Issue" />
      <main class="px-container-margin max-w-2xl mx-auto space-y-lg mt-lg">
        {/* Header */}
        <div class="text-center">
          <h1 class="text-[26px] font-bold text-on-surface">Snap to report</h1>
          <p class="text-sm text-on-surface-variant mt-1">One photo. Gemini does the paperwork — no category hunting needed.</p>
        </div>

        {/* Quick example starters */}
        <div id="example-chips" class="flex flex-wrap gap-2 justify-center">
          {['Burst water pipe', 'Deep pothole', 'Downed live wire', 'Illegal dumping', 'Broken streetlight'].map((x) => (
            <button data-ex={x} class="ex-chip border border-outline-variant rounded-full px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-secondary">bolt</span>{x}
            </button>
          ))}
        </div>

        {/* Photo / video upload + AI triage */}
        <section class="bg-surface-container-low border-2 border-dashed border-outline-variant rounded-xl p-lg text-center">
          <input type="file" id="photo-input" accept="image/*,video/*" capture="environment" class="hidden" />
          <div id="photo-zone" class="cursor-pointer">
            <div id="photo-placeholder">
              <div class="w-16 h-16 mx-auto rounded-full bg-primary-fixed flex items-center justify-center mb-3">
                <span class="material-symbols-outlined text-primary text-[32px]">add_a_photo</span>
              </div>
              <p class="text-on-surface font-semibold text-[16px]">Add a photo or short video</p>
              <p class="text-sm text-on-surface-variant mt-1">Clear evidence helps Gemini fill the form automatically.</p>
            </div>
            <img id="photo-preview" class="hidden w-full rounded-lg max-h-72 object-cover" />
            <video id="video-preview" class="hidden w-full rounded-lg max-h-72 bg-black" controls playsinline></video>
          </div>
          <p id="media-note" class="hidden text-xs text-on-surface-variant mt-2"></p>
          <div class="flex gap-2 justify-center mt-4">
            <button id="upload-btn" class="bg-primary text-on-primary rounded-full px-5 py-2.5 font-bold text-sm flex items-center gap-2 active:scale-95 transition">
              <span class="material-symbols-outlined text-[18px]">upload</span> Upload photo
            </button>
            <button id="analyze-btn" class="bg-secondary text-white rounded-full px-5 py-2.5 font-bold text-sm flex items-center gap-2 active:scale-95 transition">
              <span class="material-symbols-outlined text-[18px]">auto_awesome</span> AI triage
            </button>
          </div>
        </section>

        {/* AI verification banner (genuine / needs evidence / suspect) */}
        <div id="ai-verify" class="hidden rounded-xl p-3 text-sm flex items-start gap-2"></div>

        {/* Form — AI-filled, editable */}
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md space-y-md">
          <div>
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Describe it</label>
              <span class="text-[11px] font-bold text-secondary flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">auto_awesome</span>AI-assisted</span>
            </div>
            <textarea
              id="description"
              rows={3}
              placeholder="The AI fills this from your photo. Edit if needed."
              class="mt-2 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary resize-none"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-md">
            <div>
              <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Category · <span class="text-secondary">AI</span></label>
              <select id="category-select" class="mt-2 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary">
                {['Pothole', 'Illegal Dumping', 'Streetlight', 'Water Leak', 'Graffiti', 'Other'].map((x) => <option>{x}</option>)}
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Severity · <span class="text-secondary">AI</span></label>
              <select id="severity-select" class="mt-2 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary">
                <option value="5">Critical (5)</option>
                <option value="4">High (4)</option>
                <option value="3" selected>Medium (3)</option>
                <option value="2">Low (2)</option>
                <option value="1">Minor (1)</option>
              </select>
            </div>
          </div>

          {/* Gemini routing strip */}
          <div id="ai-result" class="hidden bg-primary-fixed rounded-lg p-3">
            <div class="flex items-center gap-2 text-primary mb-1">
              <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
              <span class="font-bold text-sm">Gemini routing</span>
              <span id="ai-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/60 text-primary"></span>
            </div>
            <div id="ai-content" class="text-sm text-on-surface"></div>
          </div>

          <div>
            <div class="flex justify-between items-center">
              <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Location</label>
              <button id="gps-btn" class="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                <span class="material-symbols-outlined text-[16px]">my_location</span> Update Location
              </button>
            </div>
            <input
              id="address"
              type="text"
              value="Sector 17, Chandigarh"
              class="mt-2 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary"
            />
            <p class="text-xs text-on-surface-variant mt-1" id="gps-status">Auto-detected from GPS</p>
          </div>

          <div class="flex items-center justify-between border-t border-surface-variant pt-md">
            <div>
              <p class="font-semibold text-on-surface">Report Anonymously</p>
              <p class="text-xs text-on-surface-variant">Your name will not be shared publicly.</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="anon-toggle" class="sr-only peer" />
              <div class="w-11 h-6 bg-surface-variant rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
        </section>

        <button id="submit-btn" class="w-full bg-secondary text-white rounded-xl py-4 font-bold text-[16px] active:scale-[0.98] transition flex items-center justify-center gap-2">
          <span class="material-symbols-outlined">send</span> Submit Report
        </button>
      </main>
      <BottomNav active="report" />
      <input type="hidden" id="lat" /><input type="hidden" id="lng" />
      <script src="/static/report.js"></script>
    </div>,
    { title: 'Report Issue' }
  )
})

// Map page
app.get('/map', (c) => {
  return c.render(
    <div class="pt-[64px] pb-[80px]">
      <TopBar title="Community Map" />
      <div class="fixed top-[64px] left-0 right-0 z-[900] bg-surface-lowest border-b border-outline-variant">
        <div class="max-w-5xl mx-auto flex gap-2 px-container-margin py-2 overflow-x-auto">
          <button data-filter="all" class="map-filter bg-primary text-on-primary rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap">All</button>
          <button data-filter="mine" class="map-filter bg-surface-container text-on-surface rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap">My Reports</button>
          <button data-filter="verify" class="map-filter bg-surface-container text-on-surface rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap">Needs Verification</button>
        </div>
      </div>
      <div id="map" class="fixed top-[112px] bottom-[80px] left-0 right-0"></div>
      <BottomNav active="map" />
      <script src="/static/map.js"></script>
    </div>,
    { title: 'Community Map' }
  )
})

// Verify reports page
app.get('/verify', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar title="Verify Reports" />
      <main class="px-container-margin max-w-2xl mx-auto mt-lg space-y-md">
        <div class="bg-primary-fixed rounded-xl p-md flex items-start gap-3">
          <span class="material-symbols-outlined text-primary">groups</span>
          <p class="text-sm text-on-surface">Help your community by confirming reports are genuine. Verified reports get prioritized by the AI queue faster.</p>
        </div>
        <div id="verify-list" class="space-y-md">
          <div class="text-center text-on-surface-variant py-8">Loading reports to verify…</div>
        </div>
      </main>
      <BottomNav active="home" />
      <script src="/static/verify.js"></script>
    </div>,
    { title: 'Verify Reports' }
  )
})

// My Reports — the citizen's own reports with live status tracking
app.get('/my-reports', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar title="My Reports" />
      <main class="px-container-margin max-w-2xl mx-auto mt-lg space-y-lg">
        {/* Summary */}
        <section class="grid grid-cols-3 gap-md">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md text-center">
            <p class="text-2xl font-bold text-on-surface" id="mr-total">—</p>
            <p class="text-[11px] uppercase font-bold text-on-surface-variant mt-1">Reported</p>
          </div>
          <div class="bg-tertiary-fixed rounded-xl p-md text-center">
            <p class="text-2xl font-bold text-on-tertiary-fixed" id="mr-open">—</p>
            <p class="text-[11px] uppercase font-bold text-on-tertiary-fixed mt-1">In Progress</p>
          </div>
          <div class="bg-secondary-container rounded-xl p-md text-center">
            <p class="text-2xl font-bold text-on-secondary-container" id="mr-resolved">—</p>
            <p class="text-[11px] uppercase font-bold text-on-secondary-container mt-1">Resolved</p>
          </div>
        </section>

        {/* Sign-in hint (shown only when not signed in) */}
        <div id="mr-signin" class="hidden bg-primary-fixed rounded-xl p-md flex items-start gap-3">
          <span class="material-symbols-outlined text-primary">info</span>
          <p class="text-sm text-on-surface">Sign in on your <a href="/profile" class="font-bold text-primary underline">Profile</a> to track all the reports you submit across devices.</p>
        </div>

        {/* Filters */}
        <div id="mr-filters" class="flex gap-2 overflow-x-auto">
          <button data-f="all" class="mr-filter bg-primary text-on-primary rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap">All</button>
          <button data-f="open" class="mr-filter bg-surface-container text-on-surface rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap">In Progress</button>
          <button data-f="resolved" class="mr-filter bg-surface-container text-on-surface rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap">Resolved</button>
        </div>

        <div id="mr-list" class="space-y-md">
          <div class="text-center text-on-surface-variant py-8">Loading your reports…</div>
        </div>

        <a href="/report" class="block text-center bg-secondary text-white rounded-xl py-3.5 font-bold active:scale-[0.98] transition">
          <span class="material-symbols-outlined align-middle mr-1">add_circle</span> Report a new issue
        </a>
      </main>
      <BottomNav active="myreports" />
      <script src={`/static/my-reports.js?v=${ASSET_VER}`}></script>
    </div>,
    { title: 'My Reports' }
  )
})

// Impact dashboard
app.get('/impact', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar title="Impact" />
      <main class="px-container-margin max-w-3xl mx-auto mt-lg space-y-lg">
        {/* Hero — headline impact numbers */}
        <section class="bg-gradient-to-br from-primary to-surface-tint text-on-primary rounded-xl p-lg relative overflow-hidden">
          <div class="absolute -right-12 -top-12 w-44 h-44 bg-white/10 rounded-full blur-2xl"></div>
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">insights</span>
            <h2 class="font-bold text-[18px]">Community Impact</h2>
          </div>
          <p class="text-sm text-primary-fixed">What TrustLens AI and your neighbours are fixing — live.</p>
          <div class="grid grid-cols-3 gap-3 mt-4">
            <div><p class="text-[28px] font-bold leading-none" id="imp-resolved">—</p><p class="text-[10px] uppercase font-bold opacity-80 mt-1">Resolved</p></div>
            <div><p class="text-[28px] font-bold leading-none" id="imp-total">—</p><p class="text-[10px] uppercase font-bold opacity-80 mt-1">Total reports</p></div>
            <div><p class="text-[28px] font-bold leading-none" id="imp-rate">—</p><p class="text-[10px] uppercase font-bold opacity-80 mt-1">Resolution rate</p></div>
          </div>
        </section>

        {/* Environmental & civic impact */}
        <section>
          <h3 class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Environmental &amp; Civic Impact</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-md">
            <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
              <span class="material-symbols-outlined text-primary">construction</span>
              <p class="text-2xl font-bold text-on-surface mt-1" id="env-potholes">—</p>
              <p class="text-xs text-on-surface-variant">Potholes filled</p>
            </div>
            <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
              <span class="material-symbols-outlined text-primary">water_drop</span>
              <p class="text-2xl font-bold text-on-surface mt-1" id="env-leaks">—</p>
              <p class="text-xs text-on-surface-variant">Leaks fixed · <span id="env-water" class="font-bold">—</span> L saved</p>
            </div>
            <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
              <span class="material-symbols-outlined text-tertiary">lightbulb</span>
              <p class="text-2xl font-bold text-on-surface mt-1" id="env-lights">—</p>
              <p class="text-xs text-on-surface-variant">Streetlights restored</p>
            </div>
            <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
              <span class="material-symbols-outlined text-secondary">recycling</span>
              <p class="text-2xl font-bold text-on-surface mt-1" id="env-waste">—</p>
              <p class="text-xs text-on-surface-variant">Waste sites cleared · <span id="env-tonnes" class="font-bold">—</span> t</p>
            </div>
            <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
              <span class="material-symbols-outlined text-tertiary">format_paint</span>
              <p class="text-2xl font-bold text-on-surface mt-1" id="env-graffiti">—</p>
              <p class="text-xs text-on-surface-variant">Graffiti removed</p>
            </div>
            <div class="bg-secondary-container rounded-xl p-md">
              <span class="material-symbols-outlined text-on-secondary-container">eco</span>
              <p class="text-2xl font-bold text-on-secondary-container mt-1" id="env-co2">—</p>
              <p class="text-xs text-on-secondary-container">kg CO₂ saved (est.)</p>
            </div>
          </div>
        </section>

        {/* AI Weekly Summary */}
        <section id="ai-insight" class="bg-surface-lowest border border-outline-variant rounded-xl p-lg">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-primary">auto_awesome</span>
            <h2 class="font-bold text-[16px] text-on-surface">AI Weekly Summary</h2>
            <span id="insight-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary-fixed text-primary"></span>
          </div>
          <p id="insight-text" class="text-sm text-on-surface-variant leading-relaxed">Generating insights…</p>
          <div class="grid grid-cols-3 gap-sm mt-3">
            <div class="bg-surface-container-low rounded-lg p-2 text-center">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Most reported</p>
              <p id="ins-most" class="font-bold text-on-surface text-sm mt-0.5">—</p>
            </div>
            <div class="bg-surface-container-low rounded-lg p-2 text-center">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Hotspot</p>
              <p id="ins-hotspot" class="font-bold text-on-surface text-sm mt-0.5">—</p>
            </div>
            <div class="bg-surface-container-low rounded-lg p-2 text-center">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Resolution</p>
              <p id="ins-rate" class="font-bold text-secondary text-sm mt-0.5">—</p>
            </div>
          </div>
        </section>

        {/* AI Predictive Insights */}
        <section id="predict-box" class="bg-tertiary-container rounded-xl p-lg">
          <div class="flex items-center gap-2 mb-2 text-on-tertiary-container">
            <span class="material-symbols-outlined">trending_up</span>
            <h2 class="font-bold text-[16px]">AI Predictive Insights</h2>
            <span id="predict-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/40 text-on-tertiary-container">Forecast</span>
          </div>
          <p id="predict-forecast" class="text-sm text-on-tertiary-container leading-relaxed mb-3">Forecasting trends…</p>
          <div class="grid grid-cols-2 gap-sm">
            <div class="bg-surface-lowest/70 rounded-lg p-2">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Emerging hotspot</p>
              <p id="predict-hotspot" class="text-sm font-bold text-on-surface">—</p>
            </div>
            <div class="bg-surface-lowest/70 rounded-lg p-2">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Likely to rise</p>
              <p id="predict-category" class="text-sm font-bold text-on-surface">—</p>
            </div>
          </div>
          <div class="mt-3 flex items-start gap-2 bg-surface-lowest/70 rounded-lg p-2">
            <span class="material-symbols-outlined text-[18px] text-secondary">lightbulb</span>
            <p id="predict-reco" class="text-sm text-on-surface">—</p>
          </div>
        </section>

        {/* Charts */}
        <section class="grid md:grid-cols-2 gap-lg">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <h3 class="font-semibold text-on-surface mb-3 text-sm">Issues by Category</h3>
            <canvas id="categoryChart" height="220"></canvas>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <h3 class="font-semibold text-on-surface mb-3 text-sm">Issues by Status</h3>
            <canvas id="statusChart" height="220"></canvas>
          </div>
        </section>
      </main>
      <BottomNav active="impact" />
      <script src="/static/impact.js"></script>
    </div>,
    { title: 'Impact' }
  )
})

// Profile page
app.get('/profile', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar title="My Profile" />
      <main class="px-container-margin max-w-2xl mx-auto mt-lg space-y-lg">
        {/* Signed-OUT view */}
        <section id="signed-out" class="hidden">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-lg text-center">
            <div class="w-16 h-16 mx-auto rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[36px]">account_circle</span>
            </div>
            <h2 class="font-bold text-[20px] text-on-surface">Sign in to TrustLens AI</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-lg">Track your reports, earn community points, and verify neighbors' issues.</p>

            <button id="google-signin" class="w-full bg-surface-lowest border border-outline-variant rounded-lg py-3 font-bold text-on-surface flex items-center justify-center gap-3 hover:bg-surface-container transition mb-md">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-5 h-5" alt="" />
              Continue with Google
            </button>

            <div class="flex items-center gap-3 my-md">
              <span class="flex-1 h-px bg-outline-variant"></span>
              <span class="text-xs text-on-surface-variant">or use email</span>
              <span class="flex-1 h-px bg-outline-variant"></span>
            </div>

            <form id="email-form" class="space-y-sm text-left">
              <input id="reg-name" type="text" placeholder="Name (for sign up)" autocomplete="name"
                class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary" />
              <input id="email-input" type="email" required placeholder="you@example.com" autocomplete="email"
                class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary" />
              <input id="password-input" type="password" required placeholder="Password (min 6 chars)" autocomplete="current-password"
                class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary" />
              <p id="auth-error" class="hidden text-sm text-error font-medium"></p>
              <div class="flex gap-2 pt-1">
                <button type="submit" id="email-signin" class="flex-1 bg-primary text-on-primary rounded-lg py-3 font-bold active:scale-[0.98] transition">Sign In</button>
                <button type="button" id="email-register" class="flex-1 border border-primary text-primary rounded-lg py-3 font-bold active:scale-[0.98] transition">Sign Up</button>
              </div>
            </form>
          </div>
        </section>

        {/* Signed-IN view */}
        <div id="signed-in" class="hidden space-y-lg">
          <section class="bg-surface-lowest border border-outline-variant rounded-xl p-lg flex items-center gap-4">
            <div id="p-avatar" class="w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center overflow-hidden shrink-0">
              <span class="material-symbols-outlined text-[36px]">person</span>
            </div>
            <div class="min-w-0">
              <h2 class="font-bold text-[20px] text-on-surface truncate" id="p-name">Citizen</h2>
              <p class="text-sm text-on-surface-variant truncate" id="p-email">—</p>
            </div>
          </section>
          <section class="grid grid-cols-2 gap-md">
            <div class="bg-primary-fixed rounded-xl p-md text-center">
              <p class="text-3xl font-bold text-primary" id="p-score">—</p>
              <p class="text-xs font-bold uppercase text-on-surface-variant mt-1">Community Score</p>
            </div>
            <div class="bg-secondary-container rounded-xl p-md text-center">
              <p class="text-3xl font-bold text-on-secondary-container" id="p-reports">—</p>
              <p class="text-xs font-bold uppercase text-on-surface-variant mt-1">Reports Filed</p>
            </div>
          </section>

          {/* Reputation tier + progress */}
          <section class="bg-surface-lowest border border-outline-variant rounded-xl p-lg">
            <div class="flex items-center gap-3 mb-2">
              <span id="p-tier-icon" class="material-symbols-outlined text-[32px] text-primary" style="font-variation-settings:'FILL' 1;">military_tech</span>
              <div class="min-w-0">
                <p class="font-bold text-on-surface text-[18px]" id="p-tier-name">—</p>
                <p class="text-xs text-on-surface-variant">Community rank <span id="p-rank" class="font-bold text-on-surface">—</span></p>
              </div>
              <a href="/leaderboard" class="ml-auto text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                Leaderboard <span class="material-symbols-outlined text-[16px]">leaderboard</span>
              </a>
            </div>
            <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div id="p-tier-bar" class="h-full bg-primary rounded-full transition-all" style="width:0%"></div>
            </div>
            <p id="p-tier-next" class="text-[11px] text-on-surface-variant mt-1">—</p>
          </section>
          <section>
            <h3 class="text-[18px] font-semibold text-on-surface mb-md">My Reports</h3>
            <div id="my-reports" class="space-y-md">
              <div class="text-center text-on-surface-variant py-8">Loading…</div>
            </div>
          </section>
          <button id="firebase-signout" class="w-full bg-error-container text-on-error-container rounded-xl py-3 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
            <span class="material-symbols-outlined text-[20px]">logout</span> Sign Out
          </button>
        </div>
      </main>
      <BottomNav active="profile" />
      <script src="/static/profile.js"></script>
    </div>,
    { title: 'My Profile' }
  )
})

// Community leaderboard (gamification)
app.get('/leaderboard', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[100px]">
      <TopBar title="Community Heroes" />
      <main class="px-container-margin max-w-2xl mx-auto mt-lg space-y-lg">
        <section class="bg-primary text-on-primary rounded-xl p-lg relative overflow-hidden">
          <div class="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">leaderboard</span>
            <h2 class="font-bold text-[18px]">Top Community Heroes</h2>
          </div>
          <p class="text-sm text-primary-fixed">Earn points by reporting real issues and verifying neighbors' reports on-site. Climb the tiers from Newcomer to Platinum Hero.</p>
        </section>

        <section id="leaderboard-list" class="space-y-2">
          <div class="text-center text-on-surface-variant py-8">Loading heroes…</div>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h3 class="font-bold text-sm text-on-surface mb-3">Hero Tiers</h3>
          <div class="grid grid-cols-1 gap-2 text-sm">
            <div class="flex items-center gap-2"><span class="material-symbols-outlined text-on-surface-variant">eco</span> Newcomer <span class="ml-auto text-on-surface-variant">0+</span></div>
            <div class="flex items-center gap-2"><span class="material-symbols-outlined text-tertiary-container">military_tech</span> Bronze Hero <span class="ml-auto text-on-surface-variant">50+</span></div>
            <div class="flex items-center gap-2"><span class="material-symbols-outlined text-outline">military_tech</span> Silver Hero <span class="ml-auto text-on-surface-variant">150+</span></div>
            <div class="flex items-center gap-2"><span class="material-symbols-outlined text-tertiary">workspace_premium</span> Gold Hero <span class="ml-auto text-on-surface-variant">350+</span></div>
            <div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary">diamond</span> Platinum Hero <span class="ml-auto text-on-surface-variant">750+</span></div>
          </div>
        </section>
      </main>
      <BottomNav active="impact" />
      <script src="/static/leaderboard.js"></script>
    </div>,
    { title: 'Community Heroes' }
  )
})

// Issue detail page
app.get('/issue/:id', (c) => {
  const id = c.req.param('id')
  return c.render(
    <div class="pt-[80px] pb-[120px]">
      <TopBar title="Issue Details" />
      <main class="px-container-margin max-w-2xl mx-auto mt-lg" id="issue-detail" data-id={id}>
        <div class="text-center text-on-surface-variant py-8">Loading…</div>
      </main>
      <BottomNav active="home" />
      <script src="/static/detail.js"></script>
    </div>,
    { title: 'Issue Details' }
  )
})

// =============================================================
// STAFF LOGIN
// =============================================================
app.get('/login', async (c) => {
  // Role hint from the landing cards: ?as=municipal | contractor
  const as = c.req.query('as') || ''
  const expected: Record<string, string[]> = { municipal: ['admin', 'authority'], contractor: ['contractor'] }
  const wantRoles = expected[as]

  const user = await getSessionUser(c)
  if (user) {
    const dest = user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : '/authority'
    // If they asked for a portal that doesn't match their current session, sign
    // them out so they can log in with the correct account (this is why both
    // role cards used to land on the same dashboard).
    if (wantRoles && !wantRoles.includes(user.role)) {
      c.header('Set-Cookie', clearCookie())
    } else {
      return c.redirect(dest)
    }
  }

  const isContractor = as === 'contractor'
  const accent = isContractor ? 'secondary' : 'primary'
  const heading = isContractor ? 'Contractor Sign In' : as === 'municipal' ? 'Municipal Sign In' : 'Staff Sign In'
  const sub = isContractor ? 'Responders & contractors' : as === 'municipal' ? 'Commissioner & department authorities' : 'Admins & department authorities'
  // Pre-filled demo credentials so judges/inspectors can just click "Sign In".
  const demoEmail = isContractor ? 'builder@city.gov' : 'admin@city.gov'
  const demoPass = isContractor ? 'Build@123' : 'Admin@123'

  return c.render(
    <div class="min-h-screen flex items-center justify-center px-container-margin py-12">
      <main class="w-full max-w-sm">
        <div class="text-center mb-lg">
          <div class={`w-16 h-16 mx-auto rounded-full ${isContractor ? 'bg-secondary-container' : 'bg-primary-container'} flex items-center justify-center mb-3`}>
            <span class={`material-symbols-outlined ${isContractor ? 'text-on-secondary-container' : 'text-on-primary-container'} text-[34px]`} style="font-variation-settings: 'FILL' 1;">{isContractor ? 'construction' : 'shield_person'}</span>
          </div>
          <h1 class="text-[22px] font-bold text-on-surface">{heading}</h1>
          <p class="text-sm text-on-surface-variant mt-1">{sub}</p>
        </div>

        <form id="login-form" class="bg-surface-lowest border border-outline-variant rounded-xl p-lg space-y-md">
          <input type="hidden" id="login-as" value={as} />
          <div>
            <label class="text-xs font-bold uppercase text-on-surface-variant">Email</label>
            <input id="login-email" type="email" required autocomplete="username"
              value={demoEmail}
              placeholder={isContractor ? 'builder@city.gov' : 'admin@city.gov'}
              class={`mt-1 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-${accent}`} />
          </div>
          <div>
            <label class="text-xs font-bold uppercase text-on-surface-variant">Password</label>
            <input id="login-password" type="password" required autocomplete="current-password"
              value={demoPass}
              placeholder="••••••••"
              class={`mt-1 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-${accent}`} />
          </div>
          <p class="text-[11px] text-on-surface-variant flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-secondary">bolt</span>
            Demo credentials pre-filled — just tap Sign In.
          </p>
          <p id="login-error" class="hidden text-sm text-error font-medium"></p>
          <button id="login-btn" type="submit"
            class={`w-full ${isContractor ? 'bg-secondary text-white' : 'bg-primary text-on-primary'} rounded-lg py-3 font-bold active:scale-[0.98] transition flex items-center justify-center gap-2`}>
            <span class="material-symbols-outlined">login</span> Sign In
          </button>
        </form>

        <div class="mt-md bg-surface-container-low rounded-xl p-md text-xs text-on-surface-variant">
          <p class="font-bold text-on-surface mb-1">Demo accounts</p>
          {isContractor ? (
            <p>Responder: <code>builder@city.gov</code> / <code>Build@123</code></p>
          ) : (
            <>
              <p>Super Admin: <code>admin@city.gov</code> / <code>Admin@123</code></p>
              <p>Roads Authority: <code>roads@city.gov</code> / <code>Roads@123</code></p>
              <p>Responder: <code>builder@city.gov</code> / <code>Build@123</code></p>
            </>
          )}
        </div>

        {/* Open responder registration — any contractor can connect */}
        <div class={`mt-md bg-surface-lowest border ${isContractor ? 'border-secondary' : 'border-secondary/40'} rounded-xl p-md`}>
          <button id="reg-toggle" class="w-full flex items-center justify-between text-left">
            <span class="flex items-center gap-2 font-bold text-on-surface text-sm">
              <span class="material-symbols-outlined text-secondary text-[20px]">construction</span>
              New responder? Join the network
            </span>
            <span id="reg-chevron" class="material-symbols-outlined text-on-surface-variant">{isContractor ? 'expand_less' : 'expand_more'}</span>
          </button>
          <form id="register-form" class={isContractor ? 'space-y-sm mt-3' : 'hidden space-y-sm mt-3'}>
            <input id="reg-name" type="text" required placeholder="Your name or company"
              class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-secondary" />
            <input id="reg-email" type="email" required autocomplete="email" placeholder="you@example.com"
              class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-secondary" />
            <input id="reg-password" type="password" required placeholder="Password (min 6 chars)"
              class="w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-secondary" />
            <p id="reg-error" class="hidden text-sm text-error font-medium"></p>
            <button id="reg-btn" type="submit" class="w-full bg-secondary text-white rounded-lg py-3 font-bold active:scale-[0.98] transition flex items-center justify-center gap-2">
              <span class="material-symbols-outlined">how_to_reg</span> Create responder account
            </button>
          </form>
        </div>

        <a href="/" class="block text-center text-sm text-primary font-bold mt-md hover:underline">← Back to role selection</a>
      </main>
      <script src={`/static/login.js?v=${ASSET_VER}`}></script>
    </div>,
    { title: heading }
  )
})

// Logout (GET) — clears the session cookie and returns to role selection.
// Used by every "Switch role" link so you can move between portals cleanly.
app.get('/logout', (c) => {
  c.header('Set-Cookie', clearCookie())
  return c.redirect('/')
})

// =============================================================
// AUTHORITY (DEPARTMENT) DASHBOARD — sees only its assigned issues
// =============================================================
app.get('/authority', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'authority') return c.redirect(user.role === 'admin' ? '/admin' : '/contractor')

  return c.render(
    <div class="pt-[80px] pb-[40px]">
      <TopBar title="My Department" authority />
      <main class="px-container-margin max-w-4xl mx-auto mt-lg space-y-lg">
        <section class="bg-primary text-on-primary rounded-xl p-lg flex items-center gap-4">
          <span class="material-symbols-outlined text-[40px]">badge</span>
          <div>
            <p class="text-xs uppercase font-bold opacity-80">Signed in as</p>
            <h2 class="font-bold text-[20px]" id="auth-name">{user.name}</h2>
            <p class="text-sm opacity-90"><span id="auth-dept">{user.department}</span> Department</p>
          </div>
        </section>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-md">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-surface-variant">Assigned to me</p>
            <p class="text-3xl font-bold text-on-surface mt-1" id="d-total">—</p>
          </div>
          <div class="bg-tertiary-fixed rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-tertiary-fixed">Open</p>
            <p class="text-3xl font-bold text-on-tertiary-fixed mt-1" id="d-open">—</p>
          </div>
          <div class="bg-secondary-container rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-secondary-container">In Progress</p>
            <p class="text-3xl font-bold text-on-secondary-container mt-1" id="d-progress">—</p>
          </div>
          <div class="bg-secondary rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-white">Resolved</p>
            <p class="text-3xl font-bold text-white mt-1" id="d-resolved">—</p>
          </div>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h2 class="font-bold text-[18px] text-on-surface mb-3">Issues Assigned to Your Department</h2>
          <div id="dept-issues" class="space-y-md">
            <div class="text-center text-on-surface-variant py-8">Loading your issues…</div>
          </div>
        </section>
      </main>

      {/* Status update modal (authority — no department change, only status + message) */}
      <div id="status-modal" class="hidden fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div class="bg-surface-lowest rounded-xl p-lg max-w-md w-full">
          <h3 class="font-bold text-[18px] text-on-surface mb-1">Update Issue <span id="modal-issue-id"></span></h3>
          <p id="modal-issue-title" class="text-sm text-on-surface-variant mb-4"></p>
          <label class="text-xs font-bold uppercase text-on-surface-variant">New Status</label>
          <select id="modal-status" class="mt-1 mb-3 w-full bg-surface-container-low border-0 rounded-lg p-3">
            <option>Assigned</option><option>In Progress</option><option>Resolved</option>
          </select>
          <label class="text-xs font-bold uppercase text-on-surface-variant">Update for citizens</label>
          <textarea id="modal-message" rows={3} class="mt-1 mb-4 w-full bg-surface-container-low border-0 rounded-lg p-3 resize-none" placeholder="Progress message…"></textarea>
          <div class="flex gap-2">
            <button id="modal-cancel" class="flex-1 border border-outline-variant rounded-lg py-3 font-bold text-on-surface">Cancel</button>
            <button id="modal-save" class="flex-1 bg-primary text-on-primary rounded-lg py-3 font-bold">Save Update</button>
          </div>
        </div>
      </div>

      <script src="/static/authority.js"></script>
    </div>,
    { title: 'Department Dashboard' }
  )
})

// =============================================================
// CONTRACTOR / RESPONDER PORTAL — claim jobs, prove fixes, get paid
// =============================================================
app.get('/contractor', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'contractor') return c.redirect(user.role === 'admin' ? '/admin' : '/authority')

  return c.render(
    <div class="ctr-scope" id="ctr-root">
      {/* ---------- TOP BAR ---------- */}
      <header class="ctr-topbar">
        <a href="/" class="ctr-brand">
          <img src="/static/logo.svg" class="w-8 h-8" alt="TrustLens AI" />
          <span><b>Trust</b>Lens<span class="ctr-badge">Field Ops</span></span>
        </a>
        <nav class="ctr-tabs" id="ctr-tabs">
          <button class="ctr-tab active" data-tab="dashboard"><span class="material-symbols-outlined">grid_view</span>Dashboard</button>
          <button class="ctr-tab" data-tab="jobs"><span class="material-symbols-outlined">assignment</span>My Jobs</button>
          <button class="ctr-tab" data-tab="board"><span class="material-symbols-outlined">work</span>Job Board</button>
          <button class="ctr-tab" data-tab="map"><span class="material-symbols-outlined">map</span>Map</button>
          <button class="ctr-tab" data-tab="earnings"><span class="material-symbols-outlined">account_balance_wallet</span>Earnings</button>
          <button class="ctr-tab" data-tab="profile"><span class="material-symbols-outlined">badge</span>Profile</button>
        </nav>
        <div class="ctr-topbar-right">
          <div class="ctr-avail" id="ctr-avail">
            <span class="ctr-avail-dot"></span>
            <select id="ctr-avail-select" title="Your availability">
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <button id="ctr-ai-btn" class="ctr-chip" title="Ask the AI assistant"><span class="material-symbols-outlined">support_agent</span></button>
          <div class="ctr-profile"><div class="ctr-avatar">{(user.name || 'C')[0]}</div>
            <div class="ctr-profile-meta"><b>{user.name}</b><small>Civic Responder</small></div></div>
          <a href="/logout" class="ctr-switch" title="Switch role"><span class="material-symbols-outlined">logout</span></a>
        </div>
      </header>

      <main class="ctr-main">
        {/* Role identity ribbon (inline-styled so it shows even with cached CSS) */}
        <div style="background:linear-gradient(90deg,#0f766e,#0d9488);color:#fff;padding:8px 20px;font-weight:800;font-size:12px;letter-spacing:1.5px;display:flex;align-items:center;gap:8px;text-transform:uppercase;border-radius:0 0 14px 14px;margin-bottom:6px;">
          <span class="material-symbols-outlined" style="font-size:18px;">construction</span>Contractor · Field Ops · Responder view
        </div>
        {/* ===================== DASHBOARD ===================== */}
        <section class="ctr-view" id="cview-dashboard">
          <div class="ctr-hero">
            <div class="ctr-hero-text">
              <p class="ctr-eyebrow">Welcome back</p>
              <h1>{user.name}</h1>
              <p class="ctr-hero-sub">Win jobs from the city, prove the fix with a photo, get paid the moment AI verifies it.</p>
            </div>
            <div class="ctr-earn-card">
              <p class="ctr-earn-label"><span class="material-symbols-outlined">account_balance_wallet</span> Total earned</p>
              <p class="ctr-earn-val" id="ctr-earnings">₹—</p>
              <div class="ctr-earn-foot"><span id="ctr-rating">★ —</span><span id="ctr-jobs-done">— jobs completed</span></div>
            </div>
          </div>

          <section class="ctr-kpis">
            <div class="ctr-kpi"><span class="ctr-kpi-ic material-symbols-outlined" style="color:#2563EB;background:#2563EB1a">verified_user</span>
              <div><p class="ctr-kpi-val" id="ctr-k-assigned">—</p><p class="ctr-kpi-label">Assigned by City</p></div></div>
            <div class="ctr-kpi"><span class="ctr-kpi-ic material-symbols-outlined" style="color:#F59E0B;background:#F59E0B1a">pending_actions</span>
              <div><p class="ctr-kpi-val" id="ctr-k-active">—</p><p class="ctr-kpi-label">In Progress</p></div></div>
            <div class="ctr-kpi"><span class="ctr-kpi-ic material-symbols-outlined" style="color:#10B981;background:#10B9811a">task_alt</span>
              <div><p class="ctr-kpi-val" id="ctr-k-done">—</p><p class="ctr-kpi-label">Completed</p></div></div>
            <div class="ctr-kpi"><span class="ctr-kpi-ic material-symbols-outlined" style="color:#8B5CF6;background:#8B5CF61a">lock</span>
              <div><p class="ctr-kpi-val" id="ctr-k-escrow">₹—</p><p class="ctr-kpi-label">In Escrow</p></div></div>
          </section>

          <div class="ctr-block-head"><h2><span class="material-symbols-outlined">bolt</span> Jobs needing action</h2>
            <button class="ctr-link" data-goto="jobs">View all my jobs</button></div>
          <div id="ctr-active-list" class="ctr-grid"><div class="ctr-skel"></div></div>
        </section>

        {/* ===================== MY JOBS ===================== */}
        <section class="ctr-view hidden" id="cview-jobs">
          <div class="ctr-view-head"><h1><span class="material-symbols-outlined">assignment</span> My Jobs</h1>
            <div class="ctr-filters" id="ctr-job-filters">
              <button class="ctr-filter active" data-jf="all">All</button>
              <button class="ctr-filter" data-jf="city">Assigned by City</button>
              <button class="ctr-filter" data-jf="active">Active</button>
              <button class="ctr-filter" data-jf="done">Completed</button>
            </div></div>
          <div id="ctr-jobs-list" class="ctr-grid"><div class="ctr-skel"></div></div>
        </section>

        {/* ===================== JOB BOARD ===================== */}
        <section class="ctr-view hidden" id="cview-board">
          <div class="ctr-view-head"><h1><span class="material-symbols-outlined">work</span> Open Job Board</h1>
            <span class="ctr-tag">Ranked by bounty &amp; priority</span></div>
          <p class="ctr-block-sub">Claim a job outright, or submit a quotation (bid) and let the City's AI compare your value against other responders.</p>
          <div id="ctr-board-list" class="ctr-grid"><div class="ctr-skel"></div></div>
        </section>

        {/* ===================== MAP ===================== */}
        <section class="ctr-view hidden" id="cview-map">
          <div class="ctr-view-head"><h1><span class="material-symbols-outlined">map</span> Job Map</h1>
            <div class="ctr-legend"><span><i style="background:#2563EB"></i>My jobs</span><span><i style="background:#F59E0B"></i>Open jobs</span></div></div>
          <div class="ctr-card-plain"><div id="ctr-map" class="ctr-map"></div></div>
        </section>

        {/* ===================== EARNINGS ===================== */}
        <section class="ctr-view hidden" id="cview-earnings">
          <div class="ctr-view-head"><h1><span class="material-symbols-outlined">account_balance_wallet</span> Earnings</h1></div>
          <div class="ctr-wallet">
            <div class="ctr-wallet-main"><p class="ctr-earn-label"><span class="material-symbols-outlined">payments</span> Total earned</p>
              <p class="ctr-earn-val" id="ctr-earn-total">₹—</p>
              <div class="ctr-wallet-stats"><div><b id="ctr-earn-jobs">—</b><span>paid jobs</span></div><div><b id="ctr-earn-escrow">₹—</b><span>in escrow</span></div></div></div>
          </div>
          <div class="ctr-block-head"><h2><span class="material-symbols-outlined">receipt_long</span> Payment history</h2></div>
          <div id="ctr-earn-history" class="ctr-earn-list"><div class="ctr-skel"></div></div>
        </section>

        {/* ===================== PROFILE ===================== */}
        <section class="ctr-view hidden" id="cview-profile">
          <div class="ctr-view-head"><h1><span class="material-symbols-outlined">badge</span> My Profile</h1></div>
          <div class="ctr-profile-grid">
            <div class="ctr-card-plain ctr-profile-card">
              <div class="ctr-prof-top"><div class="ctr-avatar ctr-avatar-lg">{(user.name || 'C')[0]}</div>
                <div><b id="ctr-prof-name">{user.name}</b><small id="ctr-prof-company">Contractor</small>
                  <div class="ctr-prof-stars" id="ctr-prof-rating">★ —</div></div></div>
              <div class="ctr-prof-stats">
                <div><b id="ctr-prof-jobs">—</b><span>jobs done</span></div>
                <div><b id="ctr-prof-active">—</b><span>active</span></div>
                <div><b id="ctr-prof-radius">—</b><span>km radius</span></div>
              </div>
            </div>
            <div class="ctr-card-plain">
              <h3 class="ctr-form-title">Edit profile</h3>
              <label class="ctr-field-label">Company / crew name</label>
              <input id="ctr-f-company" class="ctr-input" placeholder="e.g. FixIt Civic Works" />
              <label class="ctr-field-label">Skills (comma separated)</label>
              <input id="ctr-f-skills" class="ctr-input" placeholder="Pothole, Water Leak, Streetlight" />
              <label class="ctr-field-label">Base location</label>
              <div class="ctr-row"><input id="ctr-f-address" class="ctr-input" placeholder="Sector 17, Chandigarh" />
                <button id="ctr-f-gps" class="ctr-btn ctr-btn-line" title="Use my location"><span class="material-symbols-outlined">my_location</span></button></div>
              <label class="ctr-field-label">Service radius: <b id="ctr-f-radius-val">10</b> km</label>
              <input id="ctr-f-radius" type="range" min="1" max="50" value="10" class="ctr-range" />
              <button id="ctr-f-save" class="ctr-btn ctr-btn-primary ctr-btn-block"><span class="material-symbols-outlined">save</span> Save profile</button>
            </div>
          </div>
        </section>

        <p class="ctr-footnote">Powered by <b>Gemini 2.5 Flash</b> · Before/after fixes are AI-verified · Escrow released automatically on verification.</p>
      </main>

      {/* ---------- JOB DETAIL DRAWER ---------- */}
      <div id="ctr-drawer" class="ctr-drawer hidden">
        <div class="ctr-drawer-card">
          <div class="ctr-drawer-head"><h3 id="ctr-drawer-title">Job</h3>
            <button id="ctr-drawer-close" class="ctr-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div id="ctr-drawer-body" class="ctr-drawer-body"></div>
        </div>
      </div>

      {/* ---------- QUOTE MODAL ---------- */}
      <div id="ctr-quote-modal" class="ctr-modal hidden">
        <div class="ctr-modal-card ctr-modal-sm">
          <div class="ctr-modal-head"><h3>Submit a quotation</h3><button id="ctr-quote-close" class="ctr-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div class="ctr-modal-body">
            <p id="ctr-quote-title" class="ctr-proof-title"></p>
            <label class="ctr-field-label">Estimated cost (₹)</label>
            <input id="ctr-q-cost" type="number" class="ctr-input" placeholder="18000" />
            <label class="ctr-field-label">Completion time (days)</label>
            <input id="ctr-q-days" type="number" step="0.5" class="ctr-input" placeholder="2" />
            <div class="ctr-modal-actions">
              <button id="ctr-quote-cancel" class="ctr-btn ctr-btn-line">Cancel</button>
              <button id="ctr-quote-submit" class="ctr-btn ctr-btn-primary"><span class="material-symbols-outlined">send</span> Submit bid</button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- PROOF-OF-FIX MODAL ---------- */}
      <div id="ctr-proof-modal" class="ctr-modal hidden">
        <div class="ctr-modal-card">
          <div class="ctr-modal-head"><h3>Prove the Fix <span id="ctr-proof-id"></span></h3>
            <button id="ctr-proof-close" class="ctr-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div class="ctr-modal-body">
            <p id="ctr-proof-title" class="ctr-proof-title"></p>
            <div id="ctr-proof-payout" class="ctr-proof-payout"></div>
            <div class="ctr-beforeafter">
              <div class="ctr-ba-col"><span class="ctr-ba-label">Before (reported)</span>
                <div id="ctr-before" class="ctr-ba-img ctr-ba-empty"><span class="material-symbols-outlined">image</span></div></div>
              <div class="ctr-ba-col"><span class="ctr-ba-label">After (your fix)</span>
                <div id="ctr-proof-zone" class="ctr-ba-img ctr-ba-drop"><div id="ctr-proof-ph"><span class="material-symbols-outlined">add_a_photo</span><small>Tap to add photo</small></div>
                  <img id="ctr-proof-preview" class="hidden" /></div></div>
            </div>
            <input type="file" id="ctr-proof-input" accept="image/*" capture="environment" class="hidden" />
            <div id="ctr-proof-verdict" class="hidden ctr-verdict"></div>
            <div class="ctr-modal-actions">
              <button id="ctr-proof-cancel" class="ctr-btn ctr-btn-line">Close</button>
              <button id="ctr-proof-submit" class="ctr-btn ctr-btn-primary"><span class="material-symbols-outlined">verified</span> Submit for AI Verification</button>
            </div>
          </div>
        </div>
      </div>

      <script src={`/static/contractor.js?v=${ASSET_VER}`}></script>
    </div>,
    { title: 'Field Ops · TrustLens AI Responder' }
  )
})

// =============================================================
// ADMIN PORTAL (super-admin — password protected)
// =============================================================
// MUNICIPAL AI COMMAND CENTER (desktop control room — admin only)
// =============================================================
app.get('/command', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'admin') return c.redirect(user.role === 'contractor' ? '/contractor' : '/authority')

  const NAV: [string, string, string][] = [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['map', 'Live Issue Map', 'map'],
    ['issues', 'Issue Management', 'inbox'],
    ['queue', 'AI Priority Queue', 'auto_awesome'],
    ['contractors', 'Contractors', 'engineering'],
    ['volunteers', 'Community Volunteers', 'volunteer_activism'],
    ['departments', 'Departments', 'apartment'],
    ['analytics', 'Analytics', 'bar_chart'],
    ['insights', 'AI Insights', 'lightbulb'],
    ['budgets', 'Budget & Quotations', 'account_balance'],
  ]

  return c.render(
    <div class="cc-scope" id="cc-root">
      {/* ---------- LEFT SIDEBAR ---------- */}
      <aside class="cc-sidebar">
        <a href="/" class="cc-brand">
          <img src="/static/logo.svg" class="w-8 h-8" alt="TrustLens AI" />
          <span><b>Trust</b>Lens<span class="cc-brand-badge">AI</span></span>
        </a>
        <nav class="cc-nav">
          {NAV.map(([id, label, icon]) => (
            <a class="cc-nav-item" data-section={id} href={'#' + id}>
              <span class="material-symbols-outlined">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div class="cc-sidebar-foot">
          <button id="cc-dark-toggle" class="cc-darkbtn">
            <span class="material-symbols-outlined">dark_mode</span><span>Dark Mode</span>
          </button>
          <div class="cc-profile">
            <div class="cc-avatar">{(user.name || 'A')[0]}</div>
            <div class="cc-profile-meta">
              <b>{user.name}</b>
              <small>Municipal Commissioner</small>
            </div>
            <a href="/logout" title="Switch role" class="cc-logout"><span class="material-symbols-outlined">logout</span></a>
          </div>
        </div>
      </aside>

      {/* ---------- MAIN ---------- */}
      <div class="cc-main">
        {/* Role identity ribbon (inline-styled so it shows even with cached CSS) */}
        <div style="background:linear-gradient(90deg,#1d4ed8,#2563eb);color:#fff;padding:8px 24px;font-weight:800;font-size:12px;letter-spacing:1.5px;display:flex;align-items:center;gap:8px;text-transform:uppercase;">
          <span class="material-symbols-outlined" style="font-size:18px;">apartment</span>Municipal Command Center · Commissioner view
        </div>
        {/* TOP NAVBAR */}
        <header class="cc-topbar">
          <div class="cc-search">
            <span class="material-symbols-outlined">search</span>
            <input id="cc-search-input" placeholder="Search issues, contractors, departments…" autocomplete="off" />
            <div id="cc-search-results" class="cc-search-results hidden"></div>
          </div>
          <div class="cc-topbar-right">
            <button id="cc-ai-btn" class="cc-chip cc-chip-ai"><span class="material-symbols-outlined">auto_awesome</span> AI Assistant</button>
            <div id="cc-weather" class="cc-chip"><span class="material-symbols-outlined">partly_cloudy_day</span><span id="cc-weather-text">—</span></div>
            <div class="cc-chip"><span class="material-symbols-outlined">location_on</span> Chandigarh</div>
            <div class="cc-avatar cc-avatar-sm">{(user.name || 'A')[0]}</div>
          </div>
        </header>

        <main class="cc-content">
          {/* ===================== DASHBOARD ===================== */}
          <section class="cc-view" id="view-dashboard">
            <section class="cc-hero">
              <div class="cc-hero-left">
                <p class="cc-eyebrow">Welcome back</p>
                <h1>Municipal Commissioner</h1>
                <p id="cc-hero-sub" class="cc-hero-sub">AI is monitoring civic issues across the city.</p>
                <div class="cc-hero-actions">
                  <button id="cc-backlog-btn" class="cc-btn cc-btn-primary"><span class="material-symbols-outlined">bolt</span> Run AI Triage</button>
                  <button id="cc-report-btn" class="cc-btn cc-btn-ghost"><span class="material-symbols-outlined">summarize</span> Weekly Report</button>
                </div>
              </div>
              <div class="cc-card cc-health">
                <div class="cc-health-gauge">
                  <svg viewBox="0 0 36 36" class="cc-gauge-svg">
                    <path class="cc-gauge-bg" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" />
                    <path id="cc-health-arc" class="cc-gauge-arc" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" stroke-dasharray="0 100" />
                  </svg>
                  <div class="cc-gauge-label"><span id="cc-health-score">—</span><small>City Health</small></div>
                </div>
                <div class="cc-health-insight">
                  <div class="cc-tag cc-tag-ai"><span class="material-symbols-outlined">auto_awesome</span> AI Insight</div>
                  <p id="cc-health-text">Generating city health insight…</p>
                </div>
              </div>
            </section>

            <section id="cc-cards" class="cc-cards"></section>

            <div class="cc-grid-2">
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">auto_awesome</span> Top Priority Issues</h2>
                <button class="cc-link" data-goto="queue">View all</button></div>
                <div id="cc-queue-mini" class="cc-queue cc-scrolly"><div class="cc-skel-list"></div></div></div>
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">history</span> Real-time Activity</h2></div>
                <div id="cc-activity" class="cc-timeline cc-scrolly"></div></div>
            </div>
          </section>

          {/* ===================== LIVE MAP ===================== */}
          <section class="cc-view hidden" id="view-map">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">map</span> Live Issue Map</h1>
              <div class="cc-legend">
                <span><i style="background:#EF4444"></i>Critical</span><span><i style="background:#F59E0B"></i>High</span>
                <span><i style="background:#FACC15"></i>Medium</span><span><i style="background:#10B981"></i>Resolved</span>
              </div></div>
            <div class="cc-card"><div id="cc-map" class="cc-map cc-map-tall"></div></div>
          </section>

          {/* ===================== ISSUE MANAGEMENT ===================== */}
          <section class="cc-view hidden" id="view-issues">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">inbox</span> Issue Management</h1>
              <div class="cc-filters" id="cc-issue-filters">
                <button class="cc-filter active" data-filter="all">All</button>
                <button class="cc-filter" data-filter="open">Open</button>
                <button class="cc-filter" data-filter="critical">Critical</button>
                <button class="cc-filter" data-filter="resolved">Resolved</button>
              </div></div>
            <div class="cc-card">
              <div class="cc-table-wrap">
                <table class="cc-table">
                  <thead><tr><th>Issue</th><th>Category</th><th>Severity</th><th>Status</th><th>Assigned</th><th></th></tr></thead>
                  <tbody id="cc-issues-table"><tr><td colspan="6"><div class="cc-skel-list"></div></td></tr></tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===================== PRIORITY QUEUE ===================== */}
          <section class="cc-view hidden" id="view-queue">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">auto_awesome</span> AI Priority Queue</h1>
              <span class="cc-tag cc-tag-ai"><span class="material-symbols-outlined">smart_toy</span> Ranked by Gemini</span></div>
            <div class="cc-card"><div id="cc-queue" class="cc-queue"><div class="cc-skel-list"></div></div></div>
          </section>

          {/* ===================== CONTRACTORS ===================== */}
          <section class="cc-view hidden" id="view-contractors">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">engineering</span> Smart Contractor Management</h1>
              <span class="cc-tag cc-tag-ai"><span class="material-symbols-outlined">radar</span> RADAR — nearby contractors</span></div>
            <div id="cc-contractors" class="cc-contractor-grid"><div class="cc-skel-list"></div></div>
          </section>

          {/* ===================== VOLUNTEERS ===================== */}
          <section class="cc-view hidden" id="view-volunteers">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">volunteer_activism</span> Community Volunteers</h1></div>
            <div class="cc-card"><div id="cc-volunteers" class="cc-vol-list"></div></div>
          </section>

          {/* ===================== DEPARTMENTS ===================== */}
          <section class="cc-view hidden" id="view-departments">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">apartment</span> Departments</h1></div>
            <div id="cc-departments" class="cc-dept-grid"><div class="cc-skel-list"></div></div>
          </section>

          {/* ===================== ANALYTICS ===================== */}
          <section class="cc-view hidden" id="view-analytics">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">bar_chart</span> Analytics</h1></div>
            <div class="cc-grid-2">
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">donut_large</span> Issues by Category</h2></div><canvas id="cc-cat-chart" height="240"></canvas></div>
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">stacked_bar_chart</span> Department Performance</h2></div><canvas id="cc-dept-chart" height="240"></canvas></div>
            </div>
            <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">trending_up</span> Monthly Trend</h2></div><canvas id="cc-trend-chart" height="200"></canvas></div>
          </section>

          {/* ===================== AI INSIGHTS ===================== */}
          <section class="cc-view hidden" id="view-insights">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">lightbulb</span> AI Insights</h1>
              <button id="cc-report-btn2" class="cc-btn cc-btn-primary cc-btn-sm"><span class="material-symbols-outlined">summarize</span> Weekly Report</button></div>
            <div class="cc-card cc-predict"><div class="cc-card-head"><h2><span class="material-symbols-outlined">insights</span> Predictive Forecast</h2>
              <span class="cc-tag cc-tag-ai">Gemini</span></div>
              <p id="cc-predict-text" class="cc-predict-text">Forecasting…</p>
              <div id="cc-predict-tags" class="cc-predict-tags"></div>
            </div>
          </section>

          {/* ===================== BUDGET & QUOTATIONS ===================== */}
          <section class="cc-view hidden" id="view-budgets">
            <div class="cc-view-head"><h1><span class="material-symbols-outlined">account_balance</span> Budget &amp; Quotations</h1>
              <span class="cc-tag">Simulated figures</span></div>
            <div class="cc-grid-2">
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">savings</span> Budget Utilisation</h2></div>
                <div id="cc-budgets" class="cc-budget-list"></div></div>
              <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">how_to_reg</span> Pending Quotation Approvals</h2></div>
                <div id="cc-bud-approvals" class="cc-approvals-list cc-scrolly"></div></div>
            </div>
          </section>

          <p class="cc-footnote">Powered by <b>Gemini 2.5 Flash</b> · Maps © OpenStreetMap · Budget &amp; some contractor figures are simulated demo data.</p>
        </main>
      </div>

      {/* ---------- RIGHT ALERTS RAIL ---------- */}
      <aside class="cc-rail">
        <h3><span class="material-symbols-outlined">notifications_active</span> Alerts</h3>
        <div class="cc-rail-block"><h4>Today's Emergencies</h4><div id="cc-emergencies" class="cc-rail-list"></div></div>
        <div class="cc-rail-block"><h4>Weather</h4><div id="cc-rail-weather" class="cc-rail-list"></div></div>
        <div class="cc-rail-block"><h4>High-Risk Zones</h4><div id="cc-risk" class="cc-rail-list"></div></div>
        <div class="cc-rail-block"><h4>Pending Approvals</h4><div id="cc-approvals" class="cc-rail-list"></div></div>
      </aside>

      {/* ---------- ASSIGN / QUOTATION MODAL ---------- */}
      <div id="cc-modal" class="cc-modal hidden">
        <div class="cc-modal-card">
          <div class="cc-modal-head"><h3 id="cc-modal-title">Assign Job</h3><button id="cc-modal-close" class="cc-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div id="cc-modal-body" class="cc-modal-body"></div>
        </div>
      </div>

      {/* ---------- WEEKLY REPORT MODAL ---------- */}
      <div id="cc-report-modal" class="cc-modal hidden">
        <div class="cc-modal-card">
          <div class="cc-modal-head"><h3><span class="material-symbols-outlined">summarize</span> AI Weekly Report</h3><button id="cc-report-close" class="cc-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div id="cc-report-body" class="cc-modal-body"><div class="cc-skel-list"></div></div>
        </div>
      </div>

      {/* ---------- MANAGE ISSUE MODAL ---------- */}
      <div id="cc-manage-modal" class="cc-modal hidden">
        <div class="cc-modal-card">
          <div class="cc-modal-head"><h3 id="cc-manage-title">Manage Issue</h3><button id="cc-manage-close" class="cc-icon-btn"><span class="material-symbols-outlined">close</span></button></div>
          <div class="cc-modal-body">
            <p id="cc-manage-sub" class="cc-manage-sub"></p>
            <label class="cc-field-label">Assign to department authority</label>
            <select id="cc-manage-authority" class="cc-input"><option value="">— Select authority —</option></select>
            <label class="cc-field-label">Or set status directly</label>
            <select id="cc-manage-status" class="cc-input">
              <option>Reported</option><option>Verified</option><option>Assigned</option><option>In Progress</option><option>Resolved</option>
            </select>
            <label class="cc-field-label">Official note (optional)</label>
            <textarea id="cc-manage-note" rows={2} class="cc-input" placeholder="Message shown to citizens…"></textarea>
            <div class="cc-modal-actions">
              <button id="cc-manage-cancel" class="cc-btn cc-btn-ghost-line">Cancel</button>
              <button id="cc-manage-save" class="cc-btn cc-btn-primary">Save changes</button>
            </div>
          </div>
        </div>
      </div>

      <script src={`/static/command.js?v=${ASSET_VER}`}></script>
    </div>,
    { title: 'Municipal AI Command Center · TrustLens AI' }
  )
})

// =============================================================
app.get('/admin', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'admin') return c.redirect(user.role === 'contractor' ? '/contractor' : '/authority')
  // The Command Center is the upgraded admin surface.
  return c.redirect('/command')
})

// Legacy compact admin operations view (kept reachable at /admin/classic).
app.get('/admin/classic', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'admin') return c.redirect(user.role === 'contractor' ? '/contractor' : '/authority')

  return c.render(
    <div class="pt-[80px] pb-[40px]">
      <TopBar title="Operations" admin />
      <main class="px-container-margin max-w-5xl mx-auto mt-lg space-y-lg">
        {/* AI City Health Score — composite civic health + Gemini insight */}
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-lg">
          <div class="flex flex-col md:flex-row md:items-center gap-lg">
            <div class="flex items-center gap-4 shrink-0">
              <div class="relative w-24 h-24">
                <svg viewBox="0 0 36 36" class="w-24 h-24 -rotate-90">
                  <path d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" fill="none" stroke="#e1e2e4" stroke-width="3"></path>
                  <path id="ch-health-arc" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" fill="none" stroke="#003d9b" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 100"></path>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span id="ch-health-score" class="text-2xl font-bold text-on-surface leading-none">—</span>
                  <span class="text-[9px] uppercase font-bold text-on-surface-variant">/ 100</span>
                </div>
              </div>
              <div>
                <div class="flex items-center gap-2 text-primary">
                  <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">ecg_heart</span>
                  <h2 class="font-bold text-[18px] text-on-surface">AI City Health Score</h2>
                </div>
                <p class="text-xs text-on-surface-variant mt-0.5">Live composite of civic systems</p>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div id="ch-health-systems" class="grid grid-cols-1 sm:grid-cols-2 gap-x-lg gap-y-2"></div>
              <div class="mt-3 flex items-start gap-2 bg-primary-fixed rounded-lg p-2.5">
                <span class="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
                <p id="ch-health-insight" class="text-sm text-on-surface">Generating city health insight…</p>
              </div>
            </div>
          </div>
        </section>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-md">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-surface-variant">Total Reports</p>
            <p class="text-3xl font-bold text-on-surface mt-1" id="a-total">—</p>
          </div>
          <div class="bg-error-container rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-error-container">Critical</p>
            <p class="text-3xl font-bold text-on-error-container mt-1" id="a-critical">—</p>
          </div>
          <div class="bg-tertiary-fixed rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-tertiary-fixed">Pending</p>
            <p class="text-3xl font-bold text-on-tertiary-fixed mt-1" id="a-pending">—</p>
          </div>
          <div class="bg-secondary-container rounded-xl p-md">
            <p class="text-xs uppercase font-bold text-on-secondary-container">Resolved</p>
            <p class="text-3xl font-bold text-on-secondary-container mt-1" id="a-resolved">—</p>
          </div>
        </section>

        {/* AI Priority Queue */}
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-primary">auto_awesome</span>
            <h2 class="font-bold text-[18px] text-on-surface">AI Priority Queue</h2>
            <span class="text-xs text-on-surface-variant ml-2">Auto-ranked by Gemini severity &amp; impact</span>
          </div>
          <div id="priority-queue" class="space-y-2">
            <div class="text-center text-on-surface-variant py-8">Loading queue…</div>
          </div>
        </section>

        {/* Autonomous AI Agent activity feed */}
        <section class="bg-surface-lowest border border-primary/30 rounded-xl p-md">
          <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-primary" style="font-variation-settings:'FILL' 1;">smart_toy</span>
            <h2 class="font-bold text-[18px] text-on-surface">Autonomous Agent Activity</h2>
            <button id="agent-backlog-btn" class="ml-auto text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-on-primary flex items-center gap-1 active:scale-95 transition">
              <span class="material-symbols-outlined text-[16px]">bolt</span> Clear Backlog
            </button>
            <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-primary-fixed text-primary">
              <span id="agent-processed">0</span> auto-triaged
            </span>
          </div>
          <div id="agent-activity" class="space-y-2 max-h-72 overflow-y-auto">
            <div class="text-center text-on-surface-variant py-8">Loading agent activity…</div>
          </div>
        </section>

        {/* Issue Queue table */}
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md overflow-x-auto">
          <h2 class="font-bold text-[18px] text-on-surface mb-3">Issue Queue</h2>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-on-surface-variant border-b border-outline-variant">
                <th class="py-2 pr-2">Issue</th>
                <th class="py-2 px-2">Category</th>
                <th class="py-2 px-2">Severity</th>
                <th class="py-2 px-2">Status</th>
                <th class="py-2 px-2">Assigned To</th>
                <th class="py-2 pl-2">Action</th>
              </tr>
            </thead>
            <tbody id="issue-table"></tbody>
          </table>
        </section>

        {/* Analytics */}
        <section class="grid md:grid-cols-2 gap-lg">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <h3 class="font-semibold text-on-surface mb-3">Category Breakdown</h3>
            <canvas id="adminCategoryChart" height="220"></canvas>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
            <h3 class="font-semibold text-on-surface mb-3">Status Distribution</h3>
            <canvas id="adminStatusChart" height="220"></canvas>
          </div>
        </section>
      </main>

      {/* Status update modal */}
      <div id="status-modal" class="hidden fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div class="bg-surface-lowest rounded-xl p-lg max-w-md w-full">
          <h3 class="font-bold text-[18px] text-on-surface mb-1">Manage Issue <span id="modal-issue-id"></span></h3>
          <p id="modal-issue-title" class="text-sm text-on-surface-variant mb-4"></p>

          <label class="text-xs font-bold uppercase text-on-surface-variant">Assign to Authority</label>
          <select id="modal-authority" class="mt-1 mb-1 w-full bg-surface-container-low border-0 rounded-lg p-3">
            <option value="">— Select department authority —</option>
          </select>
          <p class="text-[11px] text-on-surface-variant mb-3">Assigning routes the issue to that department and marks it <b>Assigned</b>.</p>

          <label class="text-xs font-bold uppercase text-on-surface-variant">Or change status directly</label>
          <select id="modal-status" class="mt-1 mb-3 w-full bg-surface-container-low border-0 rounded-lg p-3">
            <option>Reported</option><option>Verified</option><option>Assigned</option>
            <option>In Progress</option><option>Resolved</option>
          </select>

          <label class="text-xs font-bold uppercase text-on-surface-variant">Official Update / Note</label>
          <textarea id="modal-message" rows={3} class="mt-1 mb-4 w-full bg-surface-container-low border-0 rounded-lg p-3 resize-none" placeholder="Message to citizens…"></textarea>
          <div class="flex gap-2">
            <button id="modal-cancel" class="flex-1 border border-outline-variant rounded-lg py-3 font-bold text-on-surface">Cancel</button>
            <button id="modal-save" class="flex-1 bg-primary text-on-primary rounded-lg py-3 font-bold">Save</button>
          </div>
        </div>
      </div>

      <script src="/static/admin.js"></script>
    </div>,
    { title: 'Admin Operations' }
  )
})

// Branded 404
app.notFound((c) => {
  c.status(404)
  return c.render(
    <div class="min-h-screen flex items-center justify-center px-container-margin py-12">
      <main class="w-full max-w-sm text-center">
        <div class="w-20 h-20 mx-auto rounded-full bg-primary-container flex items-center justify-center mb-4">
          <span class="material-symbols-outlined text-on-primary-container text-[44px]">explore_off</span>
        </div>
        <h1 class="text-[28px] font-bold text-on-surface">Page not found</h1>
        <p class="text-sm text-on-surface-variant mt-2 mb-lg">This page took a detour. Let's get you back to your community.</p>
        <div class="flex flex-col gap-2">
          <a href="/home" class="w-full bg-primary text-on-primary rounded-xl py-3 font-bold flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">home</span> Back to Home
          </a>
          <a href="/report" class="w-full border border-outline-variant text-primary rounded-xl py-3 font-bold flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">add_circle</span> Report an Issue
          </a>
        </div>
      </main>
    </div>,
    { title: 'Not Found · TrustLens AI' }
  )
})

export default app
