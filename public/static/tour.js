// Guided Tour — walks through the full TrustLens AI civic loop in ~90 seconds.
(function () {
  const $ = (id) => document.getElementById(id)

  const STEPS = [
    {
      tag: 'The problem', color: '#1D9E75', icon: 'photo_camera',
      title: '1 · A citizen spots a problem',
      body: 'A resident snaps a photo of a pothole, water leak, or broken streetlight. One tap — no forms, no category hunting.',
      visual: `<div class="tv-phone"><div class="tv-photo"><span class="material-symbols-outlined">add_a_photo</span></div><div class="tv-cap">Snap &amp; report</div></div>`,
      role: 'Citizen', href: '/home',
    },
    {
      tag: 'AI triage', color: '#EA580C', icon: 'auto_awesome',
      title: '2 · Gemini triages it instantly',
      body: 'The autonomous agent reads the photo, classifies the category and severity, scores priority, checks for duplicates and routes it to the right department — in seconds.',
      visual: `<div class="tv-chips"><span class="tv-chip">Category: Pothole</span><span class="tv-chip">Severity: 5/5</span><span class="tv-chip">Priority: 92</span><span class="tv-chip">→ Road Maintenance</span></div>`,
    },
    {
      tag: 'Community trust', color: '#10B981', icon: 'groups',
      title: '3 · Neighbours verify it',
      body: 'Nearby citizens confirm the report. On-site verifications (proof-of-presence) count double, so a few random clicks can\u2019t fake a fix. Verified issues get prioritised.',
      visual: `<div class="tv-verify"><div class="tv-ver-row"><span class="material-symbols-outlined">verified</span> 4 confirmations · trust weight 7</div><div class="tv-bar"><i style="width:85%"></i></div></div>`,
    },
    {
      tag: 'Predictive AI', color: '#EA580C', icon: 'insights',
      title: '4 · The AI predicts what\u2019s next',
      body: 'Beyond reacting, Gemini forecasts hotspots: \u201cSector 17 is likely to see 3\u20135 more pothole reports this week based on rainfall + history.\u201d The City can pre-assign crews before complaints even arrive.',
      visual: `<div class="tv-chips"><span class="tv-chip">🌧️ Rainfall forecast</span><span class="tv-chip">Hotspot: Sector 17</span><span class="tv-chip">Predicted: 3–5 potholes</span><span class="tv-chip">→ Pre-assign Roads</span></div>`,
    },
    {
      tag: 'Municipal command', color: '#1D9E75', icon: 'apartment',
      title: '5 · The City assigns a contractor',
      body: 'In the Municipal Command Center, RADAR finds the nearest qualified contractor, Gemini compares quotations and recommends the best value, and the Commissioner assigns the job — locking payment in escrow.',
      visual: `<div class="tv-radar"><div class="tv-radar-pulse"></div><span class="material-symbols-outlined">radar</span><div class="tv-radar-pick">Gemini pick · 4.8★ · 2.6 km · ₹16,000 escrow locked</div></div>`,
      role: 'Municipal Official', href: '/login',
    },
    {
      tag: 'Field ops', color: '#1D9E75', icon: 'construction',
      title: '6 · The contractor fixes it',
      body: 'The responder sees the escrow-backed job in their Field Ops portal, does the work, and uploads an \u201cafter\u201d photo as proof of the completed fix.',
      visual: `<div class="tv-ba"><div class="tv-ba-img tv-before">Before</div><span class="material-symbols-outlined">arrow_forward</span><div class="tv-ba-img tv-after">After</div></div>`,
      role: 'Contractor / Responder', href: '/login',
    },
    {
      tag: 'AI verification', color: '#F59E0B', icon: 'fact_check',
      title: '7 · Gemini verifies the fix',
      body: 'The AI compares the before and after photos and judges whether the issue is genuinely resolved — with a confidence score. No human spot-check needed.',
      visual: `<div class="tv-verdict"><span class="material-symbols-outlined">verified</span><b>Fix verified — 96% confidence</b><p>Pothole filled and road surface restored.</p></div>`,
    },
    {
      tag: 'Citizen confirms', color: '#1D9E75', icon: 'thumb_up',
      title: '8 · The citizen confirms the fix',
      body: 'The original reporter gets a notification: \u201cYour issue has been fixed! Confirm to release payment.\u201d They see the before/after side by side, tap \u201cYes, it\u2019s fixed!\u201d, and can send a thank-you note to the contractor.',
      visual: `<div class="tv-verdict"><span class="material-symbols-outlined">thumb_up</span><b>✅ Yes, it\u2019s fixed!</b><p>“Great work, fixed quickly!” — Demo Citizen</p></div>`,
      role: 'Citizen', href: '/confirm-fix',
    },
    {
      tag: 'Closed loop', color: '#10B981', icon: 'paid',
      title: '9 · Escrow released, loop closed',
      body: 'The moment the citizen confirms, the locked escrow is released to the contractor, the budget updates, and the issue is marked Resolved. From photo to paid-for fix — citizens and AI ran the whole loop together.',
      visual: `<div class="tv-done"><span class="material-symbols-outlined">payments</span><b>₹16,000 released</b><span class="tv-done-sub">Issue resolved · contractor thanked</span></div>`,
    },
  ]

  let i = 0

  function render() {
    const s = STEPS[i]
    $('tour-stage').innerHTML = `
      <div class="tour-card" style="--accent:${s.color}">
        <span class="tour-tag" style="background:${s.color}1a;color:${s.color}"><span class="material-symbols-outlined">${s.icon}</span>${s.tag}</span>
        <h1 class="tour-title">${s.title}</h1>
        <p class="tour-body">${s.body}</p>
        <div class="tour-visual">${s.visual}</div>
        ${s.role ? `<a href="${s.href}" class="tour-rolelink" style="color:${s.color}">Enter as ${s.role}<span class="material-symbols-outlined">arrow_forward</span></a>` : ''}
      </div>`
    // animate in
    const card = $('tour-stage').firstElementChild
    card.classList.add('tour-in')

    $('tour-bar').style.width = ((i + 1) / STEPS.length) * 100 + '%'
    $('tour-dots').innerHTML = STEPS.map((_, k) => `<span class="tour-dot ${k === i ? 'on' : ''}" data-k="${k}"></span>`).join('')
    $('tour-dots').querySelectorAll('.tour-dot').forEach((d) => d.addEventListener('click', () => { i = Number(d.dataset.k); render() }))

    $('tour-prev').style.visibility = i === 0 ? 'hidden' : 'visible'
    const next = $('tour-next')
    if (i === STEPS.length - 1) next.innerHTML = 'Enter the app <span class="material-symbols-outlined">rocket_launch</span>'
    else next.innerHTML = 'Next <span class="material-symbols-outlined">arrow_forward</span>'
  }

  function next() { if (i < STEPS.length - 1) { i++; render() } else { window.location.href = '/' } }
  function prev() { if (i > 0) { i--; render() } }

  document.addEventListener('DOMContentLoaded', () => {
    render()
    $('tour-next').addEventListener('click', next)
    $('tour-prev').addEventListener('click', prev)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') window.location.href = '/'
    })
  })
})();
