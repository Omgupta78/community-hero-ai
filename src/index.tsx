import { Hono } from 'hono'
import { renderer } from './renderer'
import api from './routes/api'
import { TopBar, BottomNav } from './components/layout'
import { getSessionUser } from './lib/auth'

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

        <p class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mt-10 mb-4">Log in as</p>
        <div class="grid md:grid-cols-3 gap-md text-left">
          <a href="/home" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-primary hover:shadow-lg transition active:scale-[0.98]">
            <div class="w-12 h-12 rounded-lg bg-primary text-on-primary flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[26px]">person</span>
            </div>
            <h2 class="font-bold text-[18px] text-on-surface">Citizen</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-3">Report a problem and watch it get fixed.</p>
            <span class="text-sm font-bold text-primary flex items-center gap-1">Log in as Citizen <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
          </a>
          <a href="/login" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-on-surface hover:shadow-lg transition active:scale-[0.98]">
            <div class="w-12 h-12 rounded-lg bg-on-surface text-surface-lowest flex items-center justify-center mb-3">
              <span class="material-symbols-outlined text-[26px]">apartment</span>
            </div>
            <h2 class="font-bold text-[18px] text-on-surface">Municipal Official</h2>
            <p class="text-sm text-on-surface-variant mt-1 mb-3">Command the agent and clear the backlog.</p>
            <span class="text-sm font-bold text-primary flex items-center gap-1">Log in as Official <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
          </a>
          <a href="/login" class="group bg-surface-lowest border border-outline-variant rounded-xl p-lg hover:border-secondary hover:shadow-lg transition active:scale-[0.98]">
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
            <a href="/map" class="bg-surface-lowest border border-outline-variant text-primary rounded-xl p-md flex flex-col items-center justify-center gap-sm min-h-[100px] active:scale-95 transition-transform hover:bg-surface-container">
              <span class="material-symbols-outlined text-[32px]">map</span>
              <span class="text-xs text-center font-medium">View Map</span>
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
  // Already logged in? Send to the right dashboard.
  const user = await getSessionUser(c)
  if (user) return c.redirect(user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : '/authority')

  return c.render(
    <div class="min-h-screen flex items-center justify-center px-container-margin py-12">
      <main class="w-full max-w-sm">
        <div class="text-center mb-lg">
          <div class="w-16 h-16 mx-auto rounded-full bg-primary-container flex items-center justify-center mb-3">
            <span class="material-symbols-outlined text-on-primary-container text-[34px]" style="font-variation-settings: 'FILL' 1;">shield_person</span>
          </div>
          <h1 class="text-[22px] font-bold text-on-surface">Staff Sign In</h1>
          <p class="text-sm text-on-surface-variant mt-1">Admins &amp; department authorities only</p>
        </div>

        <form id="login-form" class="bg-surface-lowest border border-outline-variant rounded-xl p-lg space-y-md">
          <div>
            <label class="text-xs font-bold uppercase text-on-surface-variant">Email</label>
            <input id="login-email" type="email" required autocomplete="username"
              placeholder="admin@city.gov"
              class="mt-1 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label class="text-xs font-bold uppercase text-on-surface-variant">Password</label>
            <input id="login-password" type="password" required autocomplete="current-password"
              placeholder="••••••••"
              class="mt-1 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary" />
          </div>
          <p id="login-error" class="hidden text-sm text-error font-medium"></p>
          <button id="login-btn" type="submit"
            class="w-full bg-primary text-on-primary rounded-lg py-3 font-bold active:scale-[0.98] transition flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">login</span> Sign In
          </button>
        </form>

        <div class="mt-md bg-surface-container-low rounded-xl p-md text-xs text-on-surface-variant">
          <p class="font-bold text-on-surface mb-1">Demo accounts</p>
          <p>Super Admin: <code>admin@city.gov</code> / <code>Admin@123</code></p>
          <p>Roads Authority: <code>roads@city.gov</code> / <code>Roads@123</code></p>
          <p>Responder: <code>builder@city.gov</code> / <code>Build@123</code></p>
        </div>

        {/* Open responder registration — any contractor can connect */}
        <div class="mt-md bg-surface-lowest border border-secondary/40 rounded-xl p-md">
          <button id="reg-toggle" class="w-full flex items-center justify-between text-left">
            <span class="flex items-center gap-2 font-bold text-on-surface text-sm">
              <span class="material-symbols-outlined text-secondary text-[20px]">construction</span>
              New responder? Join the network
            </span>
            <span id="reg-chevron" class="material-symbols-outlined text-on-surface-variant">expand_more</span>
          </button>
          <form id="register-form" class="hidden space-y-sm mt-3">
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

        <a href="/home" class="block text-center text-sm text-primary font-bold mt-md hover:underline">← Back to citizen app</a>
      </main>
      <script src="/static/login.js"></script>
    </div>,
    { title: 'Staff Sign In' }
  )
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
    <div class="pt-[80px] pb-[40px]">
      <TopBar title="Responder" authority />
      <main class="px-container-margin max-w-4xl mx-auto mt-lg space-y-lg">
        <section class="bg-primary text-on-primary rounded-xl p-lg flex items-center gap-4">
          <span class="material-symbols-outlined text-[40px]">construction</span>
          <div class="min-w-0">
            <p class="text-xs uppercase font-bold opacity-80">Signed in as</p>
            <h2 class="font-bold text-[20px] truncate">{user.name}</h2>
            <p class="text-sm opacity-90">Civic Responder</p>
          </div>
          <div class="ml-auto text-right">
            <p class="text-xs uppercase font-bold opacity-80">Total earned</p>
            <p class="text-2xl font-bold" id="c-earnings">₹—</p>
          </div>
        </section>

        <section class="grid grid-cols-3 gap-md">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md text-center">
            <p class="text-3xl font-bold text-on-surface" id="c-available">—</p>
            <p class="text-xs uppercase font-bold text-on-surface-variant mt-1">Open Jobs</p>
          </div>
          <div class="bg-secondary-container rounded-xl p-md text-center">
            <p class="text-3xl font-bold text-on-secondary-container" id="c-active">—</p>
            <p class="text-xs uppercase font-bold text-on-surface-variant mt-1">In Progress</p>
          </div>
          <div class="bg-secondary rounded-xl p-md text-center">
            <p class="text-3xl font-bold text-white" id="c-done">—</p>
            <p class="text-xs uppercase font-bold text-white mt-1">Completed</p>
          </div>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h2 class="font-bold text-[18px] text-on-surface mb-3">Available Jobs <span class="text-xs text-on-surface-variant">— ranked by bounty &amp; priority</span></h2>
          <div id="available-jobs" class="space-y-md"><div class="text-center text-on-surface-variant py-8">Loading jobs…</div></div>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h2 class="font-bold text-[18px] text-on-surface mb-3">My Jobs</h2>
          <div id="my-jobs" class="space-y-md"><div class="text-center text-on-surface-variant py-8">No jobs claimed yet.</div></div>
        </section>
      </main>

      {/* Proof-of-fix modal */}
      <div id="proof-modal" class="hidden fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div class="bg-surface-lowest rounded-xl p-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 class="font-bold text-[18px] text-on-surface mb-1">Prove the Fix <span id="proof-issue-id"></span></h3>
          <p id="proof-issue-title" class="text-sm text-on-surface-variant mb-4"></p>
          <input type="file" id="proof-input" accept="image/*" capture="environment" class="hidden" />
          <div id="proof-zone" class="cursor-pointer border-2 border-dashed border-outline-variant rounded-xl p-lg text-center mb-3">
            <div id="proof-placeholder">
              <span class="material-symbols-outlined text-primary text-[32px]">add_a_photo</span>
              <p class="text-sm text-on-surface-variant mt-1">Upload an "after" photo of the completed fix</p>
            </div>
            <img id="proof-preview" class="hidden w-full rounded-lg max-h-56 object-cover" />
          </div>
          <div id="proof-verdict" class="hidden rounded-lg p-3 mb-3 text-sm"></div>
          <div class="flex gap-2">
            <button id="proof-cancel" class="flex-1 border border-outline-variant rounded-lg py-3 font-bold text-on-surface">Close</button>
            <button id="proof-submit" class="flex-1 bg-primary text-on-primary rounded-lg py-3 font-bold flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">verified</span> Submit for AI Verification
            </button>
          </div>
        </div>
      </div>

      <script src="/static/contractor.js"></script>
    </div>,
    { title: 'Responder Dashboard' }
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
            <a href="/login" title="Switch role" class="cc-logout"><span class="material-symbols-outlined">logout</span></a>
          </div>
        </div>
      </aside>

      {/* ---------- MAIN ---------- */}
      <div class="cc-main">
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
          {/* HERO + CITY HEALTH */}
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
                <div class="cc-gauge-label">
                  <span id="cc-health-score">—</span><small>City Health</small>
                </div>
              </div>
              <div class="cc-health-insight">
                <div class="cc-tag cc-tag-ai"><span class="material-symbols-outlined">auto_awesome</span> AI Insight</div>
                <p id="cc-health-text">Generating city health insight…</p>
              </div>
            </div>
          </section>

          {/* SUMMARY CARDS */}
          <section id="cc-cards" class="cc-cards"></section>

          {/* MAP + PRIORITY QUEUE */}
          <section id="map-section" class="cc-grid-2">
            <div class="cc-card">
              <div class="cc-card-head"><h2><span class="material-symbols-outlined">map</span> Live AI Map</h2>
                <div class="cc-legend">
                  <span><i style="background:#EF4444"></i>Critical</span><span><i style="background:#F59E0B"></i>High</span>
                  <span><i style="background:#FACC15"></i>Medium</span><span><i style="background:#10B981"></i>Resolved</span>
                </div>
              </div>
              <div id="cc-map" class="cc-map"></div>
            </div>
            <div class="cc-card" id="queue-section">
              <div class="cc-card-head"><h2><span class="material-symbols-outlined">auto_awesome</span> AI Priority Queue</h2>
                <span class="cc-tag">Ranked by Gemini</span></div>
              <div id="cc-queue" class="cc-queue cc-scrolly"><div class="cc-skel-list"></div></div>
            </div>
          </section>

          {/* CONTRACTORS + RADAR */}
          <section id="contractors-section" class="cc-card">
            <div class="cc-card-head"><h2><span class="material-symbols-outlined">engineering</span> Smart Contractor Management</h2>
              <span class="cc-tag cc-tag-ai"><span class="material-symbols-outlined">radar</span> RADAR — nearby contractors</span></div>
            <div id="cc-contractors" class="cc-contractor-grid"><div class="cc-skel-list"></div></div>
          </section>

          {/* ANALYTICS */}
          <section id="analytics-section" class="cc-grid-2">
            <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">donut_large</span> Issues by Category</h2></div><canvas id="cc-cat-chart" height="240"></canvas></div>
            <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">stacked_bar_chart</span> Department Performance</h2></div><canvas id="cc-dept-chart" height="240"></canvas></div>
          </section>
          <section class="cc-grid-2">
            <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">trending_up</span> Monthly Trend</h2></div><canvas id="cc-trend-chart" height="220"></canvas></div>
            <div class="cc-card" id="budgets-section"><div class="cc-card-head"><h2><span class="material-symbols-outlined">account_balance</span> Budget Utilisation</h2><span class="cc-tag">Simulated</span></div><div id="cc-budgets" class="cc-budget-list"></div></div>
          </section>

          {/* PREDICTIVE + VOLUNTEERS + ACTIVITY */}
          <section id="insights-section" class="cc-grid-3">
            <div class="cc-card cc-predict"><div class="cc-card-head"><h2><span class="material-symbols-outlined">insights</span> Predictive AI</h2></div>
              <p id="cc-predict-text" class="cc-predict-text">Forecasting…</p>
              <div id="cc-predict-tags" class="cc-predict-tags"></div>
            </div>
            <div class="cc-card" id="volunteers-section"><div class="cc-card-head"><h2><span class="material-symbols-outlined">volunteer_activism</span> Community Volunteers</h2></div>
              <div id="cc-volunteers" class="cc-vol-list cc-scrolly"></div></div>
            <div class="cc-card"><div class="cc-card-head"><h2><span class="material-symbols-outlined">history</span> Real-time Activity</h2></div>
              <div id="cc-activity" class="cc-timeline cc-scrolly"></div></div>
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

      <script src="/static/command.js"></script>
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
