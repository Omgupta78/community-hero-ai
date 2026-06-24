import { Hono } from 'hono'
import { renderer } from './renderer'
import api from './routes/api'
import { TopBar, BottomNav } from './components/layout'
import { getSessionUser } from './lib/auth'

type Bindings = {
  DB: D1Database
  GEMINI_API_KEY?: string
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
          <div class="grid grid-cols-3 gap-sm">
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
        {/* Photo upload */}
        <section class="bg-surface-container-low border border-outline-variant rounded-xl p-lg text-center">
          <input type="file" id="photo-input" accept="image/*" capture="environment" class="hidden" />
          <div id="photo-zone" class="cursor-pointer">
            <div id="photo-placeholder">
              <div class="w-16 h-16 mx-auto rounded-full bg-primary-fixed flex items-center justify-center mb-3">
                <span class="material-symbols-outlined text-primary text-[32px]">photo_camera</span>
              </div>
              <p class="text-primary font-semibold text-[18px]">Take a Photo or Video</p>
              <p class="text-sm text-on-surface-variant mt-1">Clear visual evidence helps our AI &amp; teams resolve issues faster.</p>
            </div>
            <img id="photo-preview" class="hidden w-full rounded-lg max-h-72 object-cover" />
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
              value="123 Main St, Springfield"
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
        <section class="bg-surface-lowest border border-outline-variant rounded-xl p-lg flex items-center gap-4">
          <div class="w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
            <span class="material-symbols-outlined text-[36px]">person</span>
          </div>
          <div>
            <h2 class="font-bold text-[20px] text-on-surface" id="p-name">Demo Citizen</h2>
            <p class="text-sm text-on-surface-variant" id="p-email">demo@communityhero.ai</p>
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
        <section>
          <h3 class="text-[18px] font-semibold text-on-surface mb-md">My Reports</h3>
          <div id="my-reports" class="space-y-md">
            <div class="text-center text-on-surface-variant py-8">Loading…</div>
          </div>
        </section>
        <div class="bg-surface-container-low rounded-xl p-md text-center">
          <p class="text-sm text-on-surface-variant flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">login</span>
            Signed in with Google (demo mode)
          </p>
        </div>
      </main>
      <BottomNav active="profile" />
      <script src="/static/profile.js"></script>
    </div>,
    { title: 'My Profile' }
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

export default app
