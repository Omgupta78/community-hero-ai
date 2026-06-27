// My Reports — the citizen's own reports with a 7-stage pipeline tracker
// and an expandable "Watch the agent" AI decision log per report.
(function () {
  if (!window.CH) return
  const { api, esc, timeAgo, CAT_ICON, severityBadge } = window.CH
  const $ = (id) => document.getElementById(id)
  let reports = []
  let filter = 'all'
  const agentCache = {} // issueId -> updates[] (fetched lazily on expand)

  // 7-stage civic pipeline: report → community verify → assign contractor →
  // fix on site → AI re-verify the fix → release payment → AI prevents recurrence.
  const STAGES = ['Reported', 'Verified', 'Assigned', 'Fixing', 'Re-verified', 'Paid', 'Prevented']
  function stageIndex(i) {
    switch (i.status) {
      case 'Resolved': return 5
      case 'In Progress': return i.fix_verified ? 4 : 3
      case 'Assigned': return 2
      case 'Verified': return 1
      default: return 0
    }
  }

  function tracker(i) {
    const cur = stageIndex(i)
    const resolved = i.status === 'Resolved'
    return `<div class="mr-track mr-track-7">${STAGES.map((s, k) => {
      let done, active
      if (resolved) { done = k <= 5; active = k === 6 } // Paid done; AI now preventing recurrence
      else { done = k < cur; active = k === cur }
      return `<div class="mr-step ${done ? 'done' : ''} ${active ? 'cur' : ''}"><i></i><span>${s}</span></div>`
    }).join('')}</div>`
  }

  function card(i) {
    const resolved = i.status === 'Resolved'
    const thumb = i.photo_data
      ? `<img src="${i.photo_data}" class="mr-thumb" alt="" />`
      : `<div class="mr-thumb mr-thumb-ph"><span class="material-symbols-outlined">${CAT_ICON[i.category] || 'place'}</span></div>`
    const confirmCta = resolved && i.fix_verified
      ? `<a href="/verify-fix/${i.id}" class="mr-confirm-cta"><span class="material-symbols-outlined text-[18px]">task_alt</span> Confirm this fix — release payment</a>`
      : ''
    return `<div class="mr-card ${resolved ? 'mr-card-done' : ''}" data-id="${i.id}">
      <a href="/issue/${i.id}" class="mr-card-link">
        <div class="mr-card-top">
          ${thumb}
          <div class="mr-card-main">
            <div class="mr-card-title">${esc(i.title)}</div>
            <div class="mr-card-meta">${esc(i.category)} · ${esc(i.address || '')} · ${timeAgo(i.created_at)}</div>
          </div>
          <span class="mr-badge ${resolved ? 'done' : ''}">${esc(i.status)}</span>
        </div>
      </a>
      ${tracker(i)}
      ${confirmCta}
      <button class="mr-agent-toggle" data-agent="${i.id}">
        <span class="material-symbols-outlined text-[18px]">smart_toy</span>
        <span>Watch the agent</span>
        <span class="material-symbols-outlined mr-chev">expand_more</span>
      </button>
      <div class="mr-agent hidden" id="mr-agent-${i.id}"><div class="mr-agent-line">Loading AI decisions…</div></div>
    </div>`
  }

  // Build a readable AI decision log from the issue + its timeline updates.
  function agentLog(i, updates) {
    const lines = []
    const sev = severityBadge(i.severity)[1]
    lines.push(`AI categorised as: ${i.category} — Severity ${i.severity} (${sev})`)
    if (i.department) lines.push(`AI routed to: ${i.department} Dept`)
    for (const u of updates || []) {
      const m = (u.message || '')
      let r
      if ((r = m.match(/assigned to (.+?);\s*escrow\s*₹?([\d,]+)/i)))
        lines.push(`AI matched contractor: ${r[1].trim()} (escrow ₹${r[2]})`)
      if ((r = m.match(/AI-verified\s*\((\d+)%\s*confidence/i)))
        lines.push(`Gemini verified fix: surface match ${r[1]}% confidence`)
      if ((r = m.match(/escrow\s*₹?([\d,]+)\s*released to ([^.\u2014]+)/i)))
        lines.push(`Escrow released: ₹${r[1]} to ${r[2].trim()}`)
    }
    if (lines.length === 1) lines.push('Awaiting contractor assignment…')
    return lines
  }

  async function toggleAgent(id, btn) {
    const panel = $(`mr-agent-${id}`)
    if (!panel) return
    const wasHidden = panel.classList.contains('hidden')
    panel.classList.toggle('hidden')
    btn.classList.toggle('open', wasHidden)
    if (!wasHidden) return
    const issue = reports.find((r) => String(r.id) === String(id))
    try {
      if (!agentCache[id]) {
        const { data } = await api.get('/issues/' + id)
        agentCache[id] = data.updates || []
      }
      const lines = agentLog(issue || {}, agentCache[id])
      panel.innerHTML = lines.map((l) => `<div class="mr-agent-line">› ${esc(l)}</div>`).join('')
    } catch (e) {
      panel.innerHTML = '<div class="mr-agent-line">Could not load AI decisions.</div>'
    }
  }

  function render() {
    const el = $('mr-list'); if (!el) return
    let rows = reports
    if (filter === 'open') rows = reports.filter((r) => r.status !== 'Resolved')
    else if (filter === 'resolved') rows = reports.filter((r) => r.status === 'Resolved')
    el.innerHTML = rows.length
      ? rows.map(card).join('')
      : `<div class="text-center text-on-surface-variant py-10">
           <span class="material-symbols-outlined text-[40px] text-outline">inbox</span>
           <p class="mt-2 text-sm">No reports in this view.</p>
         </div>`
    el.querySelectorAll('.mr-agent-toggle').forEach((b) =>
      b.addEventListener('click', (e) => { e.preventDefault(); toggleAgent(b.dataset.agent, b) }))
  }

  async function load() {
    try {
      const [meRes, issRes] = await Promise.all([
        api.get('/me').catch(() => ({ data: {} })),
        api.get('/issues', { params: { mine: 'true', limit: 100 } }),
      ])
      const me = meRes.data || {}
      if ($('mr-signin')) $('mr-signin').classList.toggle('hidden', !!me.authenticated)
      reports = (issRes.data.issues || []).sort((a, b) => (b.id - a.id))
      $('mr-total').textContent = reports.length
      $('mr-open').textContent = reports.filter((r) => r.status !== 'Resolved').length
      $('mr-resolved').textContent = reports.filter((r) => r.status === 'Resolved').length
      render()
    } catch (e) {
      const el = $('mr-list'); if (el) el.innerHTML = '<div class="text-center text-on-surface-variant py-8">Could not load your reports.</div>'
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#mr-filters .mr-filter').forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.f
      document.querySelectorAll('#mr-filters .mr-filter').forEach((x) => {
        x.classList.toggle('bg-primary', x === b); x.classList.toggle('text-on-primary', x === b)
        x.classList.toggle('bg-surface-container', x !== b); x.classList.toggle('text-on-surface', x !== b)
      })
      render()
    }))
    load()
    setInterval(load, 8000)
  })
})();
