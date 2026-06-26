// Municipal AI Command Center controller — view-router + lazy section loading.
// Reuses window.CH (axios instance + helpers). Vanilla JS.
(function () {
  if (!window.CH) return
  const { api, esc, timeAgo } = window.CH
  const $ = (id) => document.getElementById(id)
  const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')

  let map, markerLayer, catChart, deptChart, trendChart
  let authoritiesCache = null
  let allIssues = []
  let manageIssueId = null
  let currentView = 'dashboard'
  const loaded = {} // lazy-load guards
  const PIN = { critical: '#EF4444', high: '#F59E0B', medium: '#FACC15', resolved: '#10B981' }

  function pinColor(i) {
    if (i.status === 'Resolved') return PIN.resolved
    if (i.severity >= 5) return PIN.critical
    if (i.severity === 4) return PIN.high
    return PIN.medium
  }
  function statusColor(s) {
    return { Resolved: '#10B981', Assigned: '#2563EB', Verified: '#8B5CF6', 'In Progress': '#F59E0B', Reported: '#94A3B8' }[s] || '#94A3B8'
  }

  // ===================== VIEW ROUTER =====================
  function showView(name) {
    currentView = name
    document.querySelectorAll('.cc-view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + name))
    document.querySelectorAll('.cc-nav-item').forEach((a) => a.classList.toggle('active', a.dataset.section === name))
    const content = document.querySelector('.cc-content')
    if (content) content.scrollTop = 0
    onShow(name)
  }
  function onShow(name) {
    switch (name) {
      case 'dashboard': loadCards(); loadHealth(); loadQueue('cc-queue-mini', 6); loadActivity(); break
      case 'map': initMap(); loadMap(); setTimeout(() => map && map.invalidateSize(), 250); break
      case 'issues': loadIssues(); break
      case 'queue': loadQueue('cc-queue', 20); break
      case 'contractors': loadContractors(); break
      case 'volunteers': loadVolunteers(); break
      case 'departments': loadDepartments(); break
      case 'analytics': loadAnalytics(); break
      case 'insights': loadPredict(); break
      case 'budgets': loadBudgets(); loadBudgetApprovals(); break
    }
  }

  // ===================== SUMMARY CARDS =====================
  const CARD_META = {
    total_reports: ['Total Reports', 'summarize', '#2563EB'],
    open_issues: ['Open Issues', 'pending_actions', '#F59E0B'],
    critical_issues: ['Critical Issues', 'priority_high', '#EF4444'],
    resolved_today: ['Resolved Today', 'task_alt', '#10B981'],
    avg_resolution_hours: ['Avg Resolution', 'schedule', '#2563EB'],
    citizen_satisfaction: ['Citizen Satisfaction', 'sentiment_satisfied', '#10B981'],
    budget_utilized: ['Budget Utilised', 'account_balance', '#F59E0B'],
    pending_approvals: ['Pending Approvals', 'how_to_reg', '#8B5CF6'],
  }
  function sparkline(series, color) {
    const w = 80, h = 28, max = Math.max(...series, 1), min = Math.min(...series, 0), range = max - min || 1
    const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
    return `<svg class="cc-spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
  async function loadCards() {
    try {
      const { data } = await api.get('/command/summary')
      const el = $('cc-cards'); if (!el) return
      el.innerHTML = Object.entries(data.cards).map(([k, c]) => {
        const [label, icon, color] = CARD_META[k] || [k, 'circle', '#2563EB']
        const up = c.delta_pct >= 0
        return `<div class="cc-card cc-stat">
          <div class="cc-stat-top"><span class="cc-stat-icon material-symbols-outlined" style="color:${color};background:${color}1a">${icon}</span>
            ${c.delta_pct !== 0 ? `<span class="cc-delta ${up ? 'up' : 'down'}"><span class="material-symbols-outlined">${up ? 'trending_up' : 'trending_down'}</span>${Math.abs(c.delta_pct)}%</span>` : ''}</div>
          <div class="cc-stat-val">${c.value}${c.unit || ''}</div>
          <div class="cc-stat-foot"><span>${label}</span>${sparkline(c.spark, color)}</div>
        </div>`
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
      const sub = $('cc-hero-sub')
      if (sub && data.total != null) sub.textContent = `AI is monitoring ${data.total} civic issues across the city.`
    } catch (e) {}
  }

  // ===================== MAP =====================
  function initMap() {
    if (map || !window.L || !$('cc-map')) return
    map = L.map('cc-map', { zoomControl: true }).setView([30.7333, 76.7794], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
    markerLayer = L.layerGroup().addTo(map)
  }
  async function loadMap() {
    initMap(); if (!markerLayer) return
    try {
      const { data } = await api.get('/issues?limit=200')
      markerLayer.clearLayers()
      ;(data.issues || []).forEach((i) => {
        if (i.lat == null || i.lng == null) return
        const color = pinColor(i)
        L.circleMarker([i.lat, i.lng], { radius: i.severity >= 5 ? 10 : 7, color, fillColor: color, fillOpacity: 0.8, weight: 2 })
          .bindPopup(`<b>${esc(i.title)}</b><br>${esc(i.category)} · sev ${i.severity}<br>${esc(i.status)}`)
          .addTo(markerLayer)
      })
    } catch (e) {}
  }

  // ===================== PRIORITY QUEUE =====================
  async function loadQueue(targetId, limit) {
    const el = $(targetId); if (!el) return
    try {
      let issues = (await api.get('/issues?limit=100')).data.issues || []
      issues = issues.filter((i) => i.status !== 'Resolved').sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
      el.innerHTML = issues.slice(0, limit).map((i) => `
        <div class="cc-q-row">
          <div class="cc-q-pri" style="background:${pinColor(i)}1a;color:${pinColor(i)}">${Math.round(i.priority_score || 0)}</div>
          <div class="cc-q-main"><div class="cc-q-title">${esc(i.title)}</div>
            <div class="cc-q-meta">${esc(i.category)} · sev ${i.severity} · ${esc(i.status)} · ${esc(i.address || '')}</div></div>
          <button class="cc-btn cc-btn-sm cc-btn-primary" data-assign="${i.id}" data-cat="${esc(i.category)}" data-lat="${i.lat || ''}" data-lng="${i.lng || ''}" data-title="${esc(i.title)}">Assign</button>
        </div>`).join('') || '<p class="cc-empty">No open issues in the queue.</p>'
      el.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssign(b.dataset)))
    } catch (e) {}
  }

  // ===================== ISSUE MANAGEMENT =====================
  async function loadIssues(filter) {
    const el = $('cc-issues-table'); if (!el) return
    filter = filter || (document.querySelector('#cc-issue-filters .active') || {}).dataset && (document.querySelector('#cc-issue-filters .active')).dataset.filter || 'all'
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
          <td><span class="cc-sev" style="background:${pinColor(i)}1a;color:${pinColor(i)}">${i.severity}</span></td>
          <td><span class="cc-status" style="color:${statusColor(i.status)}">●</span> ${esc(i.status)}</td>
          <td>${esc(i.department || '—')}</td>
          <td><button class="cc-btn cc-btn-sm cc-btn-ghost-line" data-manage="${i.id}">Manage</button></td>
        </tr>`).join('') || '<tr><td colspan="6"><p class="cc-empty">No issues match this filter.</p></td></tr>'
      el.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(Number(b.dataset.manage))))
    } catch (e) {}
  }
  async function ensureAuthorities() {
    if (authoritiesCache) return authoritiesCache
    try { authoritiesCache = (await api.get('/authorities')).data.authorities || [] } catch (e) { authoritiesCache = [] }
    return authoritiesCache
  }
  async function openManage(id) {
    manageIssueId = id
    const issue = allIssues.find((x) => x.id === id) || {}
    $('cc-manage-title').textContent = 'Manage Issue #' + id
    $('cc-manage-sub').textContent = (issue.title || '') + (issue.category ? ' · ' + issue.category : '')
    const sel = $('cc-manage-authority')
    const auths = await ensureAuthorities()
    sel.innerHTML = '<option value="">— Select authority —</option>' + auths.map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(a.department)})</option>`).join('')
    $('cc-manage-status').value = issue.status || 'Reported'
    $('cc-manage-note').value = ''
    $('cc-manage-modal').classList.remove('hidden')
  }
  async function saveManage() {
    if (!manageIssueId) return
    const authId = $('cc-manage-authority').value
    const status = $('cc-manage-status').value
    const note = $('cc-manage-note').value
    const btn = $('cc-manage-save'); btn.disabled = true; btn.textContent = 'Saving…'
    try {
      if (authId) await api.patch(`/issues/${manageIssueId}/assign`, { authority_id: Number(authId), message: note || undefined })
      else await api.patch(`/issues/${manageIssueId}/status`, { status, message: note || undefined })
      window.CH.toast('Issue updated')
      $('cc-manage-modal').classList.add('hidden')
      loadIssues(); loadActivity(); loadCards()
    } catch (e) {
      window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Update failed', false)
    }
    btn.disabled = false; btn.textContent = 'Save changes'
  }

  // ===================== CONTRACTORS (RADAR) =====================
  async function loadContractors() {
    const el = $('cc-contractors'); if (!el) return
    try {
      const { data } = await api.get('/contractors/nearby?lat=30.7415&lng=76.7822&radius_km=30')
      el.innerHTML = (data.contractors || []).map((c, idx) => `
        <div class="cc-card cc-contractor ${idx === 0 ? 'cc-contractor-top' : ''}">
          ${idx === 0 ? '<div class="cc-c-flag"><span class="material-symbols-outlined">auto_awesome</span> Gemini pick</div>' : ''}
          <div class="cc-c-head"><div class="cc-avatar">${esc((c.name || '?')[0])}</div>
            <div><b>${esc(c.name)}</b><small>${c.company ? esc(c.company) : 'Contractor'}</small></div>
            <div class="cc-c-match" title="AI match score">${Math.round(c.match_score)}</div></div>
          <div class="cc-c-stars">${'\u2605'.repeat(Math.round(c.rating))}<span class="cc-c-rating">${c.rating}</span></div>
          <div class="cc-c-meta">
            <span><span class="material-symbols-outlined">near_me</span>${c.distance_km == null ? 'n/a' : c.distance_km + ' km'}</span>
            <span><span class="material-symbols-outlined">task</span>${c.active_tasks} active</span>
            <span class="cc-avail cc-avail-${c.availability}">${c.availability}</span></div>
          <div class="cc-c-skills">${(c.skills || []).map((s) => `<i>${esc(s)}</i>`).join('')}</div>
          ${idx === 0 && c.ai_recommendation ? `<div class="cc-c-ai"><span class="material-symbols-outlined">auto_awesome</span>${esc(c.ai_recommendation)}</div>` : ''}
        </div>`).join('') || '<p class="cc-empty">No contractors on RADAR.</p>'
    } catch (e) {}
  }

  // ===================== DEPARTMENTS =====================
  async function loadDepartments() {
    const el = $('cc-departments'); if (!el) return
    try {
      const { data } = await api.get('/departments')
      el.innerHTML = (data.departments || []).map((d) => {
        const rate = d.total ? Math.round((d.resolved / d.total) * 100) : 0
        return `<div class="cc-card cc-dept">
          <div class="cc-dept-top"><span class="cc-dept-icon material-symbols-outlined">apartment</span>
            <div><b>${esc(d.department)}</b><small>${d.total} issues · ${d.open} open</small></div></div>
          <div class="cc-dept-stat"><span>Resolution rate</span><b>${rate}%</b></div>
          <div class="cc-budget-bar"><i style="width:${rate}%;background:#10B981"></i></div>
          <div class="cc-dept-stat"><span>Budget used</span><b>${d.utilization}%</b></div>
          <div class="cc-budget-bar"><i style="width:${Math.min(100, d.utilization)}%;background:${d.utilization > 85 ? '#EF4444' : '#2563EB'}"></i></div>
          <div class="cc-dept-meta">${inr(d.spent)} of ${inr(d.allocated)}</div>
        </div>`
      }).join('') || '<p class="cc-empty">No department data.</p>'
    } catch (e) {}
  }

  // ===================== ANALYTICS =====================
  async function loadAnalytics() {
    try {
      const { data } = await api.get('/analytics')
      const PALETTE = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899']
      const cat = data.byCategory || []
      drawDoughnut('cc-cat-chart', cat.map((r) => r.category), cat.map((r) => r.n), PALETTE)
      drawDept(data.byDepartment || [])
      drawTrend(data.monthlyTrend || [])
    } catch (e) {}
  }
  function drawDoughnut(id, labels, values, colors) {
    const ctx = $(id); if (!ctx || !window.Chart) return
    if (catChart) catChart.destroy()
    catChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, cutout: '62%' } })
  }
  function drawDept(dept) {
    const ctx = $('cc-dept-chart'); if (!ctx || !window.Chart) return
    if (deptChart) deptChart.destroy()
    deptChart = new Chart(ctx, { type: 'bar', data: { labels: dept.map((d) => d.department),
      datasets: [
        { label: 'Resolved', data: dept.map((d) => d.resolved), backgroundColor: '#10B981', borderRadius: 6 },
        { label: 'Open', data: dept.map((d) => d.total - d.resolved), backgroundColor: '#F59E0B', borderRadius: 6 },
      ] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true } } } })
  }
  function drawTrend(trend) {
    const ctx = $('cc-trend-chart'); if (!ctx || !window.Chart) return
    if (trendChart) trendChart.destroy()
    trendChart = new Chart(ctx, { type: 'line', data: { labels: trend.map((t) => t.month),
      datasets: [{ label: 'Reports', data: trend.map((t) => t.n), borderColor: '#2563EB', backgroundColor: '#2563EB22', fill: true, tension: 0.4, pointRadius: 3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } })
  }

  // ===================== BUDGETS =====================
  async function loadBudgets() {
    const el = $('cc-budgets'); if (!el) return
    try {
      const { data } = await api.get('/budgets')
      el.innerHTML = (data.budgets || []).map((b) => `
        <div class="cc-budget">
          <div class="cc-budget-head"><b>${esc(b.department)}</b><span>${b.utilization}%</span></div>
          <div class="cc-budget-bar"><i style="width:${Math.min(100, b.utilization)}%;background:${b.utilization > 85 ? '#EF4444' : b.utilization > 60 ? '#F59E0B' : '#10B981'}"></i></div>
          <div class="cc-budget-meta">${inr(b.spent)} spent · ${inr(b.available)} available</div>
        </div>`).join('')
    } catch (e) {}
  }
  async function loadBudgetApprovals() {
    const el = $('cc-bud-approvals'); if (!el) return
    try {
      const { data } = await api.get('/command/approvals')
      el.innerHTML = (data.approvals || []).map((a) => `
        <div class="cc-appr"><div><b>${esc(a.contractor)}</b><small>${esc(a.title)}</small></div>
          <div class="cc-appr-cost">${inr(a.est_cost)}<small>${a.est_days}d · ${a.past_rating}\u2605</small></div></div>`).join('') || '<p class="cc-empty">Nothing pending.</p>'
    } catch (e) {}
  }

  // ===================== PREDICTIVE =====================
  async function loadPredict() {
    try {
      const { data } = await api.get('/predict')
      if ($('cc-predict-text')) $('cc-predict-text').textContent = data.forecast || '—'
      const tags = []
      if (data.emerging_hotspot) tags.push(['place', 'Emerging hotspot', data.emerging_hotspot])
      if (data.rising_category) tags.push(['trending_up', 'Likely to rise', data.rising_category])
      if (data.recommendation) tags.push(['lightbulb', 'Recommended action', data.recommendation])
      if ($('cc-predict-tags')) $('cc-predict-tags').innerHTML = tags.map((t) => `<div class="cc-predict-tag"><span class="material-symbols-outlined">${t[0]}</span><div><small>${t[1]}</small><b>${esc(t[2])}</b></div></div>`).join('')
    } catch (e) {}
  }

  // ===================== VOLUNTEERS =====================
  async function loadVolunteers() {
    const el = $('cc-volunteers'); if (!el) return
    try {
      const { data } = await api.get('/volunteers/nearby')
      el.innerHTML = (data.volunteers || []).map((v, i) => `
        <div class="cc-vol"><span class="cc-vol-rank">${i + 1}</span>
          <div class="cc-avatar cc-avatar-sm">${esc((v.name || '?')[0])}</div>
          <div class="cc-vol-meta"><b>${esc(v.name)}</b><small>${v.reports} reports · ${v.verification_rate}% on-site · ${esc(v.tier || '')}</small></div>
          <span class="cc-vol-score">${v.score}</span></div>`).join('') || '<p class="cc-empty">No volunteers yet.</p>'
    } catch (e) {}
  }

  // ===================== ACTIVITY =====================
  async function loadActivity() {
    const el = $('cc-activity'); if (!el) return
    try {
      const { data } = await api.get('/activity')
      el.innerHTML = (data.activity || []).map((a) => `
        <div class="cc-tl-row"><span class="cc-tl-dot" style="background:${statusColor(a.status)}"></span>
          <div class="cc-tl-body"><p>${esc(a.message)}</p><small>#${a.issue_id} · ${esc(a.author || 'System')} · ${timeAgo(a.created_at)}</small></div></div>`).join('') || '<p class="cc-empty">No recent activity.</p>'
    } catch (e) {}
  }

  // ===================== WEATHER + RAIL (always on) =====================
  async function loadWeather() {
    try {
      const { data } = await api.get('/weather?city=Chandigarh')
      const txt = data.temp_c == null ? 'Weather unavailable' : `${data.temp_c}\u00B0C · ${data.condition}`
      if ($('cc-weather-text')) $('cc-weather-text').textContent = txt
      if ($('cc-rail-weather')) $('cc-rail-weather').innerHTML = `<div class="cc-rail-item"><b>${txt}</b>${data.rain_prob_pct != null ? `<small>Rain chance ${data.rain_prob_pct}%</small>` : ''}${data.alert ? `<small class="cc-warn">${esc(data.alert)}</small>` : ''}</div>`
    } catch (e) {}
  }
  async function loadRail() {
    try {
      const issues = (await api.get('/issues?limit=200')).data.issues || []
      const emerg = issues.filter((i) => i.severity >= 5 && i.status !== 'Resolved').slice(0, 5)
      if ($('cc-emergencies')) $('cc-emergencies').innerHTML = emerg.map((i) => `<div class="cc-rail-item cc-rail-crit"><b>${esc(i.title)}</b><small>${esc(i.address || i.category)}</small></div>`).join('') || '<p class="cc-empty">None right now.</p>'
      const byAddr = {}
      issues.filter((i) => i.status !== 'Resolved' && i.address).forEach((i) => { byAddr[i.address] = (byAddr[i.address] || 0) + 1 })
      const zones = Object.entries(byAddr).sort((a, b) => b[1] - a[1]).slice(0, 4)
      if ($('cc-risk')) $('cc-risk').innerHTML = zones.map(([a, n]) => `<div class="cc-rail-item"><b>${esc(a)}</b><small>${n} open issue${n > 1 ? 's' : ''}</small></div>`).join('') || '<p class="cc-empty">No clusters.</p>'
    } catch (e) {}
    try {
      const { data } = await api.get('/command/approvals')
      if ($('cc-approvals')) $('cc-approvals').innerHTML = (data.approvals || []).slice(0, 6).map((a) => `<div class="cc-rail-item"><b>${esc(a.contractor)}</b><small>${esc(a.title)} · ${inr(a.est_cost)}</small></div>`).join('') || '<p class="cc-empty">Nothing pending.</p>'
    } catch (e) {}
  }

  // ===================== ASSIGN / QUOTATION FLOW =====================
  async function openAssign(d) {
    const modal = $('cc-modal'), body = $('cc-modal-body')
    $('cc-modal-title').textContent = 'Assign Job · ' + (d.title || ('#' + d.assign))
    body.innerHTML = '<div class="cc-skel-list"></div>'
    modal.classList.remove('hidden')
    const issueId = d.assign
    let contractors = []
    try {
      const q = `/contractors/nearby?lat=${d.lat || 30.7415}&lng=${d.lng || 76.7822}&skill=${encodeURIComponent(d.cat || '')}&radius_km=40`
      contractors = (await api.get(q)).data.contractors || []
    } catch (e) {}
    let quotes = await getQuotes(issueId)
    if (!quotes.length && contractors.length) {
      await api.post(`/issues/${issueId}/quotations/request`, { contractor_ids: contractors.slice(0, 3).map((c) => c.user_id) }).catch(() => {})
      quotes = await getQuotes(issueId)
    }
    renderAssign(issueId, contractors, quotes)
  }
  async function getQuotes(issueId) {
    try { return (await api.get(`/issues/${issueId}/quotations`)).data.quotes || [] } catch (e) { return [] }
  }
  function renderAssign(issueId, contractors, quotes) {
    const body = $('cc-modal-body')
    const radar = `<h4 class="cc-modal-sub"><span class="material-symbols-outlined">radar</span> RADAR — recommended contractors</h4>
      <div class="cc-modal-radar">${contractors.slice(0, 4).map((c, i) => `
        <div class="cc-mr ${i === 0 ? 'best' : ''}"><b>${esc(c.name)}</b><small>${c.distance_km == null ? '' : c.distance_km + ' km · '}${c.rating}\u2605 · match ${Math.round(c.match_score)}</small>${i === 0 && c.ai_recommendation ? `<em>${esc(c.ai_recommendation)}</em>` : ''}</div>`).join('')}</div>`
    const quoteTable = quotes.length ? `
      <h4 class="cc-modal-sub"><span class="material-symbols-outlined">request_quote</span> Quotation comparison</h4>
      <table class="cc-qt"><thead><tr><th>Contractor</th><th>Cost</th><th>Time</th><th>Rating</th><th>AI Value</th><th></th></tr></thead><tbody>
      ${quotes.map((q) => `<tr class="${q.recommended ? 'best' : ''}">
        <td>${esc(q.name)}${q.recommended ? ' <span class="cc-best-tag">Gemini pick</span>' : ''}</td>
        <td>${inr(q.est_cost)}</td><td>${q.est_days}d</td><td>${q.past_rating}\u2605</td>
        <td><b style="color:${q.ai_value_score >= 80 ? '#10B981' : '#2563EB'}">${Math.round(q.ai_value_score)}</b></td>
        <td><button class="cc-btn cc-btn-sm cc-btn-primary" data-pick="${q.quotation_id}" data-cid="${q.contractor_id}">Assign</button></td>
      </tr>${q.recommended && q.ai_reason ? `<tr class="cc-qt-reason"><td colspan="6"><span class="material-symbols-outlined">auto_awesome</span>${esc(q.ai_reason)}</td></tr>` : ''}`).join('')}
      </tbody></table>` : '<p class="cc-empty">No quotations available.</p>'
    body.innerHTML = radar + quoteTable
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '…'
      try {
        await api.post(`/issues/${issueId}/assign-job`, { contractor_id: Number(b.dataset.cid), quotation_id: Number(b.dataset.pick) })
        window.CH.toast('Job assigned · escrow locked')
        $('cc-modal').classList.add('hidden')
        loadQueue('cc-queue-mini', 6); loadQueue('cc-queue', 20); loadCards(); loadActivity(); loadRail()
      } catch (e) {
        window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Assign failed', false)
        b.disabled = false; b.textContent = 'Assign'
      }
    }))
  }

  // ===================== WEEKLY REPORT =====================
  async function openReport() {
    $('cc-report-modal').classList.remove('hidden')
    const body = $('cc-report-body'); body.innerHTML = '<div class="cc-skel-list"></div>'
    try {
      const { data } = await api.get('/reports/weekly')
      body.innerHTML = `<div class="cc-tag cc-tag-ai" style="margin-bottom:12px"><span class="material-symbols-outlined">auto_awesome</span> ${data.source === 'gemini' ? 'Generated by Gemini' : 'AI heuristic'}</div><p class="cc-report-text">${esc(data.report)}</p>`
    } catch (e) { body.innerHTML = '<p class="cc-empty">Could not generate the report.</p>' }
  }

  // ===================== SEARCH =====================
  let searchT
  function initSearch() {
    const input = $('cc-search-input'), box = $('cc-search-results'); if (!input) return
    input.addEventListener('input', () => {
      clearTimeout(searchT)
      const q = input.value.trim()
      if (!q) { box.classList.add('hidden'); return }
      searchT = setTimeout(async () => {
        try {
          const { data } = await api.get('/search?q=' + encodeURIComponent(q))
          const rows = [
            ...(data.issues || []).map((i) => `<a href="/issue/${i.id}" class="cc-sr"><span class="material-symbols-outlined">report</span><div><b>${esc(i.title)}</b><small>${esc(i.category)} · ${esc(i.status)}</small></div></a>`),
            ...(data.contractors || []).map((c) => `<div class="cc-sr"><span class="material-symbols-outlined">engineering</span><div><b>${esc(c.name)}</b><small>${esc(c.skills || '')}</small></div></div>`),
          ]
          box.innerHTML = rows.join('') || '<div class="cc-sr"><small>No matches.</small></div>'
          box.classList.remove('hidden')
        } catch (e) {}
      }, 250)
    })
    document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.classList.add('hidden') })
  }

  // ===================== WIRING =====================
  function wire() {
    // Sidebar navigation.
    document.querySelectorAll('.cc-nav-item').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); showView(a.dataset.section)
    }))
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)))

    // Dark mode.
    const dark = $('cc-dark-toggle')
    if (dark) dark.addEventListener('click', () => {
      $('cc-root').classList.toggle('dark')
      try { localStorage.setItem('cc-dark', $('cc-root').classList.contains('dark') ? '1' : '0') } catch (e) {}
    })
    if (localStorage.getItem('cc-dark') === '1') $('cc-root').classList.add('dark')

    // Run AI triage.
    const backlog = $('cc-backlog-btn')
    if (backlog) backlog.addEventListener('click', async () => {
      backlog.disabled = true; backlog.innerHTML = '<span class="material-symbols-outlined cc-spin">progress_activity</span> Running…'
      try { await api.post('/agent/run-backlog'); window.CH.toast('AI triage complete') } catch (e) { window.CH.toast('Triage failed', false) }
      backlog.disabled = false; backlog.innerHTML = '<span class="material-symbols-outlined">bolt</span> Run AI Triage'
      loadCards(); loadActivity(); loadQueue('cc-queue-mini', 6)
    })

    // Weekly report buttons.
    ;['cc-report-btn', 'cc-report-btn2'].forEach((id) => { const b = $(id); if (b) b.addEventListener('click', openReport) })

    // Issue filters.
    document.querySelectorAll('#cc-issue-filters .cc-filter').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#cc-issue-filters .cc-filter').forEach((x) => x.classList.remove('active'))
      b.classList.add('active'); loadIssues(b.dataset.filter)
    }))

    // Modals.
    const closeOnBackdrop = (modal) => modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden') })
    $('cc-modal-close') && $('cc-modal-close').addEventListener('click', () => $('cc-modal').classList.add('hidden'))
    $('cc-report-close') && $('cc-report-close').addEventListener('click', () => $('cc-report-modal').classList.add('hidden'))
    $('cc-manage-close') && $('cc-manage-close').addEventListener('click', () => $('cc-manage-modal').classList.add('hidden'))
    $('cc-manage-cancel') && $('cc-manage-cancel').addEventListener('click', () => $('cc-manage-modal').classList.add('hidden'))
    $('cc-manage-save') && $('cc-manage-save').addEventListener('click', saveManage)
    ;['cc-modal', 'cc-report-modal', 'cc-manage-modal'].forEach((id) => { const m = $(id); if (m) closeOnBackdrop(m) })

    // AI assistant button → open the floating chat.
    const aiBtn = $('cc-ai-btn'); if (aiBtn) aiBtn.addEventListener('click', () => {
      const fab = document.querySelector('#ch-chat-fab, #chat-fab, [data-chat-toggle], .chat-fab'); if (fab) fab.click()
    })
    initSearch()
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire()
    showView('dashboard')
    loadWeather(); loadRail()
    setInterval(() => { loadRail(); if (currentView === 'dashboard') { loadCards(); loadActivity() } }, 9000)
  })
})();
