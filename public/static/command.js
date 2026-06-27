// Municipal Command Center — same clean design system as the contractor Field Ops,
// blue-themed. Top tab router + clean cards. Drives the full assignment loop.
(function () {
  if (!window.CH) return
  const { api, esc, timeAgo } = window.CH
  const $ = (id) => document.getElementById(id)
  const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')

  let map, markerLayer, catChart, deptChart, trendChart
  let authoritiesCache = null, allIssues = [], manageIssueId = null, currentTab = 'dashboard'
  const PIN = { critical: '#EF4444', high: '#F59E0B', medium: '#FACC15', resolved: '#10B981' }
  function pinColor(i) { if (i.status === 'Resolved') return PIN.resolved; if (i.severity >= 5) return PIN.critical; if (i.severity === 4) return PIN.high; return PIN.medium }
  function statusColor(s) { return { Resolved: '#10B981', Assigned: '#2563EB', Verified: '#8B5CF6', 'In Progress': '#F59E0B', Reported: '#94A3B8' }[s] || '#94A3B8' }

  // ---------- tab router ----------
  function showTab(tab) {
    currentTab = tab
    document.querySelectorAll('.ctr-view').forEach((v) => v.classList.toggle('hidden', v.id !== 'cview-' + tab))
    document.querySelectorAll('.ctr-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab))
    window.scrollTo(0, 0)
    onShow(tab)
  }
  function onShow(tab) {
    switch (tab) {
      case 'dashboard': loadCards(); loadHealth(); loadQueue(); loadActivity(); loadAlerts(); break
      case 'issues': loadIssues(); break
      case 'map': loadMap(); break
      case 'contractors': loadContractors(); break
      case 'departments': loadDepartments(); break
      case 'analytics': loadAnalytics(); break
      case 'budget': loadBudgets(); loadApprovals(); break
      case 'insights': loadPredict(); loadVolunteers(); break
    }
  }

  // ---------- summary cards ----------
  const CARD_META = {
    total_reports: ['Total Reports', 'summarize', '#2563EB'],
    open_issues: ['Open Issues', 'pending_actions', '#F59E0B'],
    critical_issues: ['Critical Issues', 'priority_high', '#EF4444'],
    resolved_today: ['Resolved Today', 'task_alt', '#10B981'],
    avg_resolution_hours: ['Avg Resolution', 'schedule', '#2563EB'],
    citizen_satisfaction: ['Satisfaction', 'sentiment_satisfied', '#10B981'],
    budget_utilized: ['Budget Used', 'account_balance', '#F59E0B'],
    pending_approvals: ['Approvals', 'how_to_reg', '#8B5CF6'],
  }
  function sparkline(series, color) {
    const w = 70, h = 26, max = Math.max(...series, 1), min = Math.min(...series, 0), r = max - min || 1
    const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / r) * (h - 4) - 2}`).join(' ')
    return `<svg class="mc-spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
  async function loadCards() {
    try {
      const { data } = await api.get('/command/summary')
      const el = $('cc-cards'); if (!el) return
      el.innerHTML = Object.entries(data.cards).map(([k, c]) => {
        const [label, icon, color] = CARD_META[k] || [k, 'circle', '#2563EB']
        const up = c.delta_pct >= 0
        return `<div class="mc-stat">
          <div class="mc-stat-top"><span class="mc-stat-ic material-symbols-outlined" style="color:${color};background:${color}1a">${icon}</span>
            ${c.delta_pct !== 0 ? `<span class="mc-delta ${up ? 'up' : 'down'}"><span class="material-symbols-outlined">${up ? 'trending_up' : 'trending_down'}</span>${Math.abs(c.delta_pct)}%</span>` : ''}</div>
          <div class="mc-stat-val">${c.value}${c.unit || ''}</div>
          <div class="mc-stat-foot"><span>${label}</span>${sparkline(c.spark, color)}</div></div>`
      }).join('')
    } catch (e) { if (e.response && e.response.status === 401) location.href = '/login' }
  }
  async function loadHealth() {
    try {
      const { data } = await api.get('/city-health')
      const score = Math.round(data.score || 0)
      if ($('cc-health-score')) $('cc-health-score').textContent = score
      const arc = $('cc-health-arc'); if (arc) arc.setAttribute('stroke-dasharray', `${score} 100`)
      if ($('cc-health-text')) $('cc-health-text').textContent = data.insight || data.summary || '—'
      const sub = $('cc-hero-sub'); if (sub && data.total != null) sub.textContent = `AI is monitoring ${data.total} civic issues across the city.`
    } catch (e) {}
  }

  // ---------- priority queue (dashboard) ----------
  async function loadQueue() {
    const el = $('cc-queue-mini'); if (!el) return
    try {
      let issues = (await api.get('/issues?limit=100')).data.issues || []
      issues = issues.filter((i) => i.status !== 'Resolved').sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)).slice(0, 7)
      el.innerHTML = issues.map((i) => `
        <div class="mc-q-row">
          <div class="mc-q-pri" style="background:${pinColor(i)}1a;color:${pinColor(i)}">${Math.round(i.priority_score || 0)}</div>
          <div class="mc-q-main"><div class="mc-q-title">${esc(i.title)}</div>
            <div class="mc-q-meta">${esc(i.category)} · sev ${i.severity} · ${esc(i.status)}</div></div>
          <button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-assign="${i.id}" data-cat="${esc(i.category)}" data-lat="${i.lat || ''}" data-lng="${i.lng || ''}" data-title="${esc(i.title)}">Assign</button>
        </div>`).join('') || '<p class="ctr-empty">Queue clear.</p>'
      el.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssign(b.dataset)))
    } catch (e) {}
  }

  // ---------- activity ----------
  async function loadActivity() {
    const el = $('cc-activity'); if (!el) return
    try {
      const { data } = await api.get('/activity')
      el.innerHTML = (data.activity || []).map((a) => `
        <div class="mc-tl-row"><span class="mc-tl-dot" style="background:${statusColor(a.status)}"></span>
          <div><p>${esc(a.message)}</p><small>#${a.issue_id} · ${esc(a.author || 'System')} · ${timeAgo(a.created_at)}</small></div></div>`).join('') || '<p class="ctr-empty">No recent activity.</p>'
    } catch (e) {}
  }

  // ---------- alerts (dashboard) ----------
  async function loadAlerts() {
    try {
      const issues = (await api.get('/issues?limit=200')).data.issues || []
      const emerg = issues.filter((i) => i.severity >= 5 && i.status !== 'Resolved').slice(0, 5)
      if ($('cc-emergencies')) $('cc-emergencies').innerHTML = emerg.map((i) => `<div class="mc-alert crit"><b>${esc(i.title)}</b><small>${esc(i.address || i.category)}</small></div>`).join('') || '<p class="ctr-empty">None right now.</p>'
      const byAddr = {}
      issues.filter((i) => i.status !== 'Resolved' && i.address).forEach((i) => { byAddr[i.address] = (byAddr[i.address] || 0) + 1 })
      const zones = Object.entries(byAddr).sort((a, b) => b[1] - a[1]).slice(0, 5)
      if ($('cc-risk')) $('cc-risk').innerHTML = zones.map(([a, n]) => `<div class="mc-alert"><b>${esc(a)}</b><small>${n} open issue${n > 1 ? 's' : ''}</small></div>`).join('') || '<p class="ctr-empty">No clusters.</p>'
    } catch (e) {}
  }

  // ---------- issues table ----------
  async function loadIssues(filter) {
    const el = $('cc-issues-table'); if (!el) return
    const af = document.querySelector('#cc-issue-filters .active')
    filter = filter || (af && af.dataset.filter) || 'all'
    try {
      allIssues = (await api.get('/issues?limit=200')).data.issues || []
      let rows = allIssues.slice()
      if (filter === 'open') rows = rows.filter((i) => i.status !== 'Resolved')
      else if (filter === 'critical') rows = rows.filter((i) => i.severity >= 5 && i.status !== 'Resolved')
      else if (filter === 'resolved') rows = rows.filter((i) => i.status === 'Resolved')
      rows.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
      el.innerHTML = rows.map((i) => `
        <tr>
          <td><b>${esc(i.title)}</b><small>${esc(i.address || '')}</small></td>
          <td>${esc(i.category)}</td>
          <td><span class="mc-sev" style="background:${pinColor(i)}1a;color:${pinColor(i)}">${i.severity}</span></td>
          <td><span class="mc-dot" style="background:${statusColor(i.status)}"></span> ${esc(i.status)}</td>
          <td>${esc(i.department || '—')}</td>
          <td style="display:flex;gap:6px;justify-content:flex-end">
            <button class="ctr-btn ctr-btn-line ctr-btn-sm" data-manage="${i.id}">Manage</button>
            <button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-assign="${i.id}" data-cat="${esc(i.category)}" data-lat="${i.lat || ''}" data-lng="${i.lng || ''}" data-title="${esc(i.title)}">Assign</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="6"><p class="ctr-empty">No issues match.</p></td></tr>'
      el.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(Number(b.dataset.manage))))
      el.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssign(b.dataset)))
    } catch (e) {}
  }
  async function ensureAuthorities() { if (authoritiesCache) return authoritiesCache; try { authoritiesCache = (await api.get('/authorities')).data.authorities || [] } catch (e) { authoritiesCache = [] } return authoritiesCache }
  async function openManage(id) {
    manageIssueId = id
    const issue = allIssues.find((x) => x.id === id) || {}
    $('cc-manage-title').textContent = 'Manage Issue #' + id
    $('cc-manage-sub').textContent = (issue.title || '') + (issue.category ? ' · ' + issue.category : '')
    const sel = $('cc-manage-authority'), auths = await ensureAuthorities()
    sel.innerHTML = '<option value="">— Select authority —</option>' + auths.map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(a.department)})</option>`).join('')
    $('cc-manage-status').value = issue.status || 'Reported'; $('cc-manage-note').value = ''
    $('cc-manage-modal').classList.remove('hidden')
  }
  async function saveManage() {
    if (!manageIssueId) return
    const authId = $('cc-manage-authority').value, status = $('cc-manage-status').value, note = $('cc-manage-note').value
    const btn = $('cc-manage-save'); btn.disabled = true; btn.textContent = 'Saving…'
    try {
      if (authId) await api.patch(`/issues/${manageIssueId}/assign`, { authority_id: Number(authId), message: note || undefined })
      else await api.patch(`/issues/${manageIssueId}/status`, { status, message: note || undefined })
      window.CH.toast('Issue updated'); $('cc-manage-modal').classList.add('hidden')
      loadIssues(); loadActivity(); loadCards()
    } catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Update failed', false) }
    btn.disabled = false; btn.textContent = 'Save changes'
  }

  // ---------- map ----------
  async function loadMap() {
    if (!window.L || !$('cc-map')) return
    if (!map) { map = L.map('cc-map', { zoomControl: true }).setView([30.7333, 76.7794], 12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map); markerLayer = L.layerGroup().addTo(map) }
    try {
      const { data } = await api.get('/issues?limit=200')
      markerLayer.clearLayers()
      ;(data.issues || []).forEach((i) => { if (i.lat == null || i.lng == null) return; const col = pinColor(i); L.circleMarker([i.lat, i.lng], { radius: i.severity >= 5 ? 10 : 7, color: col, fillColor: col, fillOpacity: 0.8, weight: 2 }).bindPopup(`<b>${esc(i.title)}</b><br>${esc(i.category)} · ${esc(i.status)}`).addTo(markerLayer) })
    } catch (e) {}
    setTimeout(() => map.invalidateSize(), 200)
  }

  // ---------- contractors ----------
  async function loadContractors() {
    const el = $('cc-contractors'); if (!el) return
    try {
      const { data } = await api.get('/contractors/nearby?lat=30.7415&lng=76.7822&radius_km=30')
      el.innerHTML = (data.contractors || []).map((c, idx) => `
        <div class="ctr-card mc-contractor ${idx === 0 ? 'top' : ''}">
          ${idx === 0 ? '<div class="ctr-card-flag" style="background:linear-gradient(90deg,#1d4ed8,#3b82f6)"><span class="material-symbols-outlined">auto_awesome</span> Gemini pick</div>' : ''}
          <div class="ctr-card-body">
            <div class="ctr-avatar">${esc((c.name || '?')[0])}</div>
            <div class="ctr-card-main"><b class="mc-c-name">${esc(c.name)}</b><small>${c.company ? esc(c.company) : 'Contractor'}</small>
              <div class="mc-c-stars">${'\u2605'.repeat(Math.round(c.rating))}<span>${c.rating}</span></div></div>
            <div class="mc-c-match" title="match score">${Math.round(c.match_score)}</div>
          </div>
          <div class="mc-c-meta"><span><span class="material-symbols-outlined">near_me</span>${c.distance_km == null ? 'n/a' : c.distance_km + ' km'}</span>
            <span><span class="material-symbols-outlined">task</span>${c.active_tasks} active</span>
            <span class="mc-avail ${c.availability}">${c.availability}</span></div>
          <div class="mc-c-skills">${(c.skills || []).map((s) => `<i>${esc(s)}</i>`).join('')}</div>
          ${idx === 0 && c.ai_recommendation ? `<div class="mc-c-ai"><span class="material-symbols-outlined">auto_awesome</span>${esc(c.ai_recommendation)}</div>` : ''}
        </div>`).join('') || '<p class="ctr-empty">No contractors on RADAR.</p>'
    } catch (e) {}
  }

  // ---------- departments ----------
  async function loadDepartments() {
    const el = $('cc-departments'); if (!el) return
    try {
      const { data } = await api.get('/departments')
      el.innerHTML = (data.departments || []).map((d) => {
        const rate = d.total ? Math.round((d.resolved / d.total) * 100) : 0
        return `<div class="ctr-card mc-dept">
          <div class="mc-dept-top"><span class="mc-dept-ic material-symbols-outlined">apartment</span>
            <div><b>${esc(d.department)}</b><small>${d.total} issues · ${d.open} open</small></div></div>
          <div class="mc-bar-row"><span>Resolution</span><b>${rate}%</b></div><div class="mc-bar"><i style="width:${rate}%;background:#10B981"></i></div>
          <div class="mc-bar-row"><span>Budget used</span><b>${d.utilization}%</b></div><div class="mc-bar"><i style="width:${Math.min(100, d.utilization)}%;background:${d.utilization > 85 ? '#EF4444' : '#2563EB'}"></i></div>
          <div class="mc-dept-meta">${inr(d.spent)} of ${inr(d.allocated)}</div>
        </div>`
      }).join('') || '<p class="ctr-empty">No department data.</p>'
    } catch (e) {}
  }

  // ---------- analytics ----------
  async function loadAnalytics() {
    try {
      const { data } = await api.get('/analytics')
      const PAL = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899']
      const cat = data.byCategory || []
      const ctx = $('cc-cat-chart')
      if (ctx && window.Chart) { if (catChart) catChart.destroy(); catChart = new Chart(ctx, { type: 'doughnut', data: { labels: cat.map((r) => r.category), datasets: [{ data: cat.map((r) => r.n), backgroundColor: PAL, borderWidth: 0 }] }, options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, cutout: '62%' } }) }
      const dept = data.byDepartment || []
      const dctx = $('cc-dept-chart')
      if (dctx && window.Chart) { if (deptChart) deptChart.destroy(); deptChart = new Chart(dctx, { type: 'bar', data: { labels: dept.map((d) => d.department), datasets: [{ label: 'Resolved', data: dept.map((d) => d.resolved), backgroundColor: '#10B981', borderRadius: 6 }, { label: 'Open', data: dept.map((d) => d.total - d.resolved), backgroundColor: '#F59E0B', borderRadius: 6 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true } } } }) }
      const tr = data.monthlyTrend || []
      const tctx = $('cc-trend-chart')
      if (tctx && window.Chart) { if (trendChart) trendChart.destroy(); trendChart = new Chart(tctx, { type: 'line', data: { labels: tr.map((t) => t.month), datasets: [{ label: 'Reports', data: tr.map((t) => t.n), borderColor: '#2563EB', backgroundColor: '#2563EB22', fill: true, tension: 0.4, pointRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }) }
    } catch (e) {}
  }

  // ---------- budget ----------
  async function loadBudgets() {
    const el = $('cc-budgets'); if (!el) return
    try {
      const { data } = await api.get('/budgets')
      el.innerHTML = (data.budgets || []).map((b) => `
        <div class="mc-budget"><div class="mc-budget-head"><b>${esc(b.department)}</b><span>${b.utilization}%</span></div>
          <div class="mc-bar"><i style="width:${Math.min(100, b.utilization)}%;background:${b.utilization > 85 ? '#EF4444' : b.utilization > 60 ? '#F59E0B' : '#10B981'}"></i></div>
          <div class="mc-budget-meta">${inr(b.spent)} spent · ${inr(b.available)} available</div></div>`).join('')
    } catch (e) {}
  }
  async function loadApprovals() {
    const el = $('cc-bud-approvals'); if (!el) return
    try {
      const { data } = await api.get('/command/approvals')
      el.innerHTML = (data.approvals || []).map((a) => `<div class="mc-li"><div><b>${esc(a.contractor)}</b><small>${esc(a.title)}</small></div><span class="mc-li-amt">${inr(a.est_cost)}</span></div>`).join('') || '<p class="ctr-empty">Nothing pending.</p>'
    } catch (e) {}
  }

  // ---------- predictive + volunteers ----------
  async function loadPredict() {
    try {
      const { data } = await api.get('/predict')
      if ($('cc-predict-text')) $('cc-predict-text').textContent = data.forecast || '—'
      const tags = []
      if (data.emerging_hotspot) tags.push(['place', 'Emerging hotspot', data.emerging_hotspot])
      if (data.rising_category) tags.push(['trending_up', 'Likely to rise', data.rising_category])
      if (data.recommendation) tags.push(['lightbulb', 'Recommended action', data.recommendation])
      if ($('cc-predict-tags')) $('cc-predict-tags').innerHTML = tags.map((t) => `<div class="mc-ptag"><span class="material-symbols-outlined">${t[0]}</span><div><small>${t[1]}</small><b>${esc(t[2])}</b></div></div>`).join('')
    } catch (e) {}
  }
  async function loadVolunteers() {
    const el = $('cc-volunteers'); if (!el) return
    try {
      const { data } = await api.get('/volunteers/nearby')
      el.innerHTML = (data.volunteers || []).map((v, i) => `<div class="mc-li"><span class="mc-rank">${i + 1}</span><div><b>${esc(v.name)}</b><small>${v.reports} reports · ${v.verification_rate}% on-site</small></div><span class="mc-li-amt">${v.score}</span></div>`).join('') || '<p class="ctr-empty">No volunteers yet.</p>'
    } catch (e) {}
  }

  // ---------- weather ----------
  async function loadWeather() {
    try {
      const { data } = await api.get('/weather?city=Chandigarh')
      if ($('cc-weather-text')) $('cc-weather-text').textContent = data.temp_c == null ? 'Weather' : `${data.temp_c}\u00B0C`
    } catch (e) {}
  }

  // ---------- assign / quotation flow ----------
  async function openAssign(d) {
    const body = $('cc-modal-body')
    $('cc-modal-title').textContent = 'Assign Job · ' + (d.title || ('#' + d.assign))
    body.innerHTML = '<div class="ctr-skel"></div>'
    $('cc-modal').classList.remove('hidden')
    const issueId = d.assign
    let contractors = []
    try { contractors = (await api.get(`/contractors/nearby?lat=${d.lat || 30.7415}&lng=${d.lng || 76.7822}&skill=${encodeURIComponent(d.cat || '')}&radius_km=40`)).data.contractors || [] } catch (e) {}
    let quotes = await getQuotes(issueId)
    if (!quotes.length && contractors.length) { await api.post(`/issues/${issueId}/quotations/request`, { contractor_ids: contractors.slice(0, 3).map((c) => c.user_id) }).catch(() => {}); quotes = await getQuotes(issueId) }
    renderAssign(issueId, contractors, quotes)
  }
  async function getQuotes(id) { try { return (await api.get(`/issues/${id}/quotations`)).data.quotes || [] } catch (e) { return [] } }
  function renderAssign(issueId, contractors, quotes) {
    const body = $('cc-modal-body')
    const radar = `<h4 class="mc-modal-sub"><span class="material-symbols-outlined">radar</span> RADAR — recommended contractors</h4>
      <div class="mc-radar">${contractors.slice(0, 4).map((c, i) => `<div class="mc-mr ${i === 0 ? 'best' : ''}"><b>${esc(c.name)}</b><small>${c.distance_km == null ? '' : c.distance_km + ' km · '}${c.rating}\u2605 · match ${Math.round(c.match_score)}</small>${i === 0 && c.ai_recommendation ? `<em>${esc(c.ai_recommendation)}</em>` : ''}</div>`).join('')}</div>`
    const table = quotes.length ? `<h4 class="mc-modal-sub"><span class="material-symbols-outlined">request_quote</span> Quotation comparison</h4>
      <table class="ctr-table mc-qt"><thead><tr><th>Contractor</th><th>Cost</th><th>Time</th><th>Rating</th><th>AI</th><th></th></tr></thead><tbody>
      ${quotes.map((q) => `<tr class="${q.recommended ? 'best' : ''}"><td>${esc(q.name)}${q.recommended ? ' <span class="mc-best">Gemini pick</span>' : ''}</td><td>${inr(q.est_cost)}</td><td>${q.est_days}d</td><td>${q.past_rating}\u2605</td><td><b style="color:${q.ai_value_score >= 80 ? '#10B981' : '#2563EB'}">${Math.round(q.ai_value_score)}</b></td><td><button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-pick="${q.quotation_id}" data-cid="${q.contractor_id}">Assign</button></td></tr>${q.recommended && q.ai_reason ? `<tr class="mc-qt-reason"><td colspan="6"><span class="material-symbols-outlined">auto_awesome</span>${esc(q.ai_reason)}</td></tr>` : ''}`).join('')}</tbody></table>` : '<p class="ctr-empty">No quotations available.</p>'
    body.innerHTML = radar + table
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '…'
      try { await api.post(`/issues/${issueId}/assign-job`, { contractor_id: Number(b.dataset.cid), quotation_id: Number(b.dataset.pick) }); window.CH.toast('Job assigned · escrow locked'); $('cc-modal').classList.add('hidden'); loadQueue(); loadCards(); loadActivity(); loadIssues() }
      catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Assign failed', false); b.disabled = false; b.textContent = 'Assign' }
    }))
  }

  // ---------- weekly report ----------
  async function openReport() {
    $('cc-report-modal').classList.remove('hidden')
    const body = $('cc-report-body'); body.innerHTML = '<div class="ctr-skel"></div>'
    try { const { data } = await api.get('/reports/weekly'); body.innerHTML = `<div class="ctr-tag ctr-tag-blue" style="margin-bottom:12px"><span class="material-symbols-outlined">auto_awesome</span> ${data.source === 'gemini' ? 'Generated by Gemini' : 'AI heuristic'}</div><p style="font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(data.report)}</p>` }
    catch (e) { body.innerHTML = '<p class="ctr-empty">Could not generate the report.</p>' }
  }

  function wire() {
    document.querySelectorAll('.ctr-tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)))
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)))
    document.querySelectorAll('#cc-issue-filters .ctr-filter').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#cc-issue-filters .ctr-filter').forEach((x) => x.classList.remove('active')); b.classList.add('active'); loadIssues(b.dataset.filter) }))
    const backlog = $('cc-backlog-btn')
    if (backlog) backlog.addEventListener('click', async () => { backlog.disabled = true; backlog.innerHTML = '<span class="material-symbols-outlined ctr-spin">progress_activity</span> Running…'; try { await api.post('/agent/run-backlog'); window.CH.toast('AI triage complete') } catch (e) { window.CH.toast('Triage failed', false) } backlog.disabled = false; backlog.innerHTML = '<span class="material-symbols-outlined">bolt</span> Run AI Triage'; loadCards(); loadQueue(); loadActivity() })
    ;['cc-report-btn', 'cc-report-btn2'].forEach((id) => { const b = $(id); if (b) b.addEventListener('click', openReport) })
    const close = (ids, m) => ids.forEach((id) => { const b = $(id); if (b) b.addEventListener('click', () => $(m).classList.add('hidden')) })
    close(['cc-modal-close'], 'cc-modal'); close(['cc-report-close'], 'cc-report-modal'); close(['cc-manage-close', 'cc-manage-cancel'], 'cc-manage-modal')
    $('cc-manage-save') && $('cc-manage-save').addEventListener('click', saveManage)
    ;['cc-modal', 'cc-report-modal', 'cc-manage-modal'].forEach((id) => { const m = $(id); if (m) m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden') }) })
    const ai = $('cc-ai-btn'); if (ai) ai.addEventListener('click', () => { const fab = document.querySelector('#ch-chat-fab, #chat-fab, .chat-fab'); if (fab) fab.click() })
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire(); showTab('dashboard'); loadWeather()
    setInterval(() => { if (currentTab === 'dashboard') { loadCards(); loadActivity() } }, 9000)
  })
})();
