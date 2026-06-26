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
// CITIZEN PORTAL
// =============================================================

// Home Dashboard
app.get('/', (c) => {
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
    { title: 'Community Hero AI - Home' }
  )
})

// Report Issue page
app.get('/report', (c) => {
  return c.render(
    <div class="pt-[80px] pb-[120px]">
      <TopBar title="Report Issue" />
      <main class="px-container-margin max-w-2xl mx-auto space-y-lg mt-lg">
        {/* Photo / video upload */}
        <section class="bg-surface-container-low border border-outline-variant rounded-xl p-lg text-center">
          <input type="file" id="photo-input" accept="image/*,video/*" capture="environment" class="hidden" />
          <div id="photo-zone" class="cursor-pointer">
            <div id="photo-placeholder">
              <div class="w-16 h-16 mx-auto rounded-full bg-primary-fixed flex items-center justify-center mb-3">
                <span class="material-symbols-outlined text-primary text-[32px]">add_a_photo</span>
              </div>
              <p class="text-primary font-semibold text-[18px]">Add a Photo or Video</p>
              <p class="text-sm text-on-surface-variant mt-1">Photo or a short clip — clear evidence helps our AI &amp; teams resolve issues faster.</p>
            </div>
            <img id="photo-preview" class="hidden w-full rounded-lg max-h-72 object-cover" />
            <video id="video-preview" class="hidden w-full rounded-lg max-h-72 bg-black" controls playsinline></video>
            <p id="media-note" class="hidden text-xs text-on-surface-variant mt-2"></p>
          </div>
        </section>

        {/* AI analysis result */}
        <section id="ai-result" class="hidden bg-surface-lowest border-2 border-primary rounded-xl p-md">
          <div class="flex items-center gap-2 mb-3 text-primary">
            <span class="material-symbols-outlined">auto_awesome</span>
            <h3 class="font-bold">Gemini AI Analysis</h3>
            <span id="ai-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary-fixed text-primary"></span>
          </div>
          <div id="ai-content" class="space-y-3"></div>
        </section>

        {/* AI suggestions chips (manual) */}
        <section>
          <p class="text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wide flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">auto_awesome</span> AI Suggestions
          </p>
          <div id="category-chips" class="flex flex-wrap gap-2">
            {['Pothole', 'Illegal Dumping', 'Streetlight', 'Water Leak', 'Graffiti'].map((cat) => (
              <button
                data-cat={cat}
                class="cat-chip border border-outline-variant rounded-full px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition"
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Description */}
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md space-y-md">
          <div>
            <label class="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Description</label>
            <textarea
              id="description"
              rows={4}
              placeholder="Provide more details about the issue…"
              class="mt-2 w-full bg-surface-container-low border-0 rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary resize-none"
            ></textarea>
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

        <button id="analyze-btn" class="w-full bg-primary text-on-primary rounded-xl py-4 font-bold text-[16px] active:scale-[0.98] transition flex items-center justify-center gap-2">
          <span class="material-symbols-outlined">auto_awesome</span> Analyze with AI
        </button>
        <button id="submit-btn" class="hidden w-full bg-secondary text-white rounded-xl py-4 font-bold text-[16px] active:scale-[0.98] transition flex items-center justify-center gap-2">
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
      <TopBar title="Impact Dashboard" />
      <main class="px-container-margin max-w-3xl mx-auto mt-lg space-y-lg">
        <section id="ai-insight" class="bg-primary text-on-primary rounded-xl p-lg">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined">insights</span>
            <h2 class="font-bold text-[18px]">AI Weekly Summary</h2>
            <span id="insight-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/20"></span>
          </div>
          <p id="insight-text" class="text-sm text-primary-fixed leading-relaxed">Generating insights…</p>
        </section>

        {/* Predictive insights (Gemini forecast) */}
        <section id="predict-box" class="bg-tertiary-container rounded-xl p-lg border border-tertiary-fixed">
          <div class="flex items-center gap-2 mb-2 text-on-tertiary-container">
            <span class="material-symbols-outlined">trending_up</span>
            <h2 class="font-bold text-[18px]">AI Predictive Insights</h2>
            <span id="predict-source" class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/40 text-on-tertiary-container">Forecast</span>
          </div>
          <p id="predict-forecast" class="text-sm text-on-tertiary-container leading-relaxed mb-3">Forecasting trends…</p>
          <div class="grid grid-cols-2 gap-sm">
            <div class="bg-surface-lowest/70 rounded-lg p-2">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Emerging Hotspot</p>
              <p id="predict-hotspot" class="text-sm font-bold text-on-surface">—</p>
            </div>
            <div class="bg-surface-lowest/70 rounded-lg p-2">
              <p class="text-[10px] uppercase font-bold text-on-surface-variant">Likely to Rise</p>
              <p id="predict-category" class="text-sm font-bold text-on-surface">—</p>
            </div>
          </div>
          <div class="mt-3 flex items-start gap-2 bg-surface-lowest/70 rounded-lg p-2">
            <span class="material-symbols-outlined text-[18px] text-secondary">lightbulb</span>
            <p id="predict-reco" class="text-sm text-on-surface">—</p>
          </div>
        </section>

        <section class="grid grid-cols-3 gap-sm">
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md text-center">
            <p class="text-[11px] uppercase font-bold text-on-surface-variant">Most Reported</p>
            <p id="ins-most" class="font-bold text-on-surface mt-1 text-sm">—</p>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md text-center">
            <p class="text-[11px] uppercase font-bold text-on-surface-variant">Hotspot</p>
            <p id="ins-hotspot" class="font-bold text-on-surface mt-1 text-sm">—</p>
          </div>
          <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md text-center">
            <p class="text-[11px] uppercase font-bold text-on-surface-variant">Resolution Rate</p>
            <p id="ins-rate" class="font-bold text-secondary mt-1 text-sm">—</p>
          </div>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h3 class="font-semibold text-on-surface mb-3">Issues by Category</h3>
          <canvas id="categoryChart" height="200"></canvas>
        </section>

        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
          <h3 class="font-semibold text-on-surface mb-3">Issues by Status</h3>
          <canvas id="statusChart" height="200"></canvas>
        </section>
      </main>
      <BottomNav active="impact" />
      <script src="/static/impact.js"></script>
    </div>,
    { title: 'Impact Dashboard' }
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
            <h2 class="font-bold text-[20px] text-on-surface">Sign in to Community Hero</h2>
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
  if (user) return c.redirect(user.role === 'admin' ? '/admin' : '/authority')

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
          <p>Water Authority: <code>water@city.gov</code> / <code>Water@123</code></p>
        </div>

        <a href="/" class="block text-center text-sm text-primary font-bold mt-md hover:underline">← Back to citizen app</a>
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
  if (user.role !== 'authority') return c.redirect('/admin')

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
// ADMIN PORTAL (super-admin — password protected)
// =============================================================
app.get('/admin', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.redirect('/login')
  if (user.role !== 'admin') return c.redirect('/authority')

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
            <span class="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-primary-fixed text-primary">
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
          <a href="/" class="w-full bg-primary text-on-primary rounded-xl py-3 font-bold flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">home</span> Back to Home
          </a>
          <a href="/report" class="w-full border border-outline-variant text-primary rounded-xl py-3 font-bold flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">add_circle</span> Report an Issue
          </a>
        </div>
      </main>
    </div>,
    { title: 'Not Found · Community Hero AI' }
  )
})

export default app
