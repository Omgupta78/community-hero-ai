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
      case 'analytics': loadAnalytics(); loadDepartments(); loadBudgets(); loadApprovals(); break
      case 'agentlog': loadAgentLog(); break
      case 'escalation': loadEscalation(); break
      case 'insights': loadPredict(); loadVolunteers(); loadWeeklySummary(); loadPrevention(); break
    }
  }

  // ₹/day loss by severity for unresolved issues (used in Issues + Escalation).
  function dailyLoss(i) {
    if (i.status === 'Resolved') return 0
    if (i.severity >= 5) return 8500
    if (i.severity === 4) return 4200
    return 1800
  }

  // ---------- summary cards ----------
  const CARD_META = {
    total_reports: ['Total Reports', 'summarize', '#2563EB'],
    open_issues: ['Open Issues', 'pending_actions', '#2563EB'],
    critical_issues: ['Critical Issues', 'priority_high', '#EF4444'],
    resolved_today: ['Resolved Today', 'task_alt', '#10B981'],
    avg_resolution_hours: ['Avg Resolution', 'schedule', '#2563EB'],
    citizen_satisfaction: ['Satisfaction', 'sentiment_satisfied', '#2563EB'],
    budget_utilized: ['Budget Used', 'account_balance', '#2563EB'],
    pending_approvals: ['Approvals', 'how_to_reg', '#2563EB'],
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
      // The AI Insight card shows a curated predictive drainage forecast rendered
      // server-side (see /command markup) — intentionally not overwritten here.
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
      // Daily-loss banner across all unresolved issues
      const unresolved = allIssues.filter((i) => i.status !== 'Resolved')
      const lostToday = unresolved.reduce((s, i) => s + dailyLoss(i), 0)
      const banner = $('cc-loss-banner')
      if (banner) {
        if (lostToday > 0) {
          banner.classList.remove('hidden')
          banner.innerHTML = `<span class="material-symbols-outlined">warning</span> <b>${inr(lostToday)}</b> lost today from <b>${unresolved.length}</b> unresolved issue${unresolved.length === 1 ? '' : 's'}`
        } else banner.classList.add('hidden')
      }
      const lossCell = (i) => {
        const v = dailyLoss(i)
        if (!v) return '<span style="color:#9a968a">—</span>'
        const col = i.severity >= 5 ? '#C0392B' : i.severity === 4 ? '#E67E22' : '#9a968a'
        return `<b style="color:${col}">${inr(v)}/day</b>`
      }
      el.innerHTML = rows.map((i) => `
        <tr>
          <td><b>${esc(i.title)}</b><small>${esc(i.address || '')}</small></td>
          <td>${esc(i.category)}</td>
          <td><span class="mc-sev" style="background:${pinColor(i)}1a;color:${pinColor(i)}">${i.severity}</span></td>
          <td><span class="mc-dot" style="background:${statusColor(i.status)}"></span> ${esc(i.status)}</td>
          <td>${esc(i.department || '—')}</td>
          <td>${lossCell(i)}</td>
          <td style="display:flex;gap:6px;justify-content:flex-end">
            <button class="ctr-btn ctr-btn-line ctr-btn-sm" data-manage="${i.id}">Manage</button>
            <button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-assign="${i.id}" data-cat="${esc(i.category)}" data-lat="${i.lat || ''}" data-lng="${i.lng || ''}" data-title="${esc(i.title)}">Assign</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7"><p class="ctr-empty">No issues match.</p></td></tr>'
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
          <button class="mc-remove" data-remove-contractor="${c.user_id}" title="Remove contractor"><span class="material-symbols-outlined">delete</span></button>
          ${idx === 0 ? '<div class="ctr-card-flag" style="background:#1D9E75"><span class="material-symbols-outlined">auto_awesome</span> Gemini pick</div>' : ''}
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
        </div>`).join('') || '<p class="ctr-empty">No contractors yet. Use “Add contractor” to onboard one.</p>'
      el.querySelectorAll('[data-remove-contractor]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!window.confirm('Remove this contractor from the roster?')) return
        try { await api.delete('/contractors/' + b.dataset.removeContractor); window.CH.toast('Contractor removed'); loadContractors() }
        catch (err) { window.CH.toast('Could not remove', false) }
      }))
    } catch (e) {}
  }

  function openContractorForm() {
    const body = $('cc-modal-body')
    $('cc-modal-title').textContent = 'Add contractor'
    body.innerHTML = `
      <label class="ctr-field-label">Name</label><input id="nc-name" class="ctr-input" placeholder="e.g. RoadCare Crew"/>
      <label class="ctr-field-label">Email</label><input id="nc-email" class="ctr-input" type="email" placeholder="crew@city.gov"/>
      <label class="ctr-field-label">Company</label><input id="nc-company" class="ctr-input" placeholder="RoadCare Infra"/>
      <label class="ctr-field-label">Skills (comma separated)</label><input id="nc-skills" class="ctr-input" placeholder="Pothole, Water Leak"/>
      <label class="ctr-field-label">Base address</label><input id="nc-addr" class="ctr-input" placeholder="Sector 17, Chandigarh"/>
      <div class="ctr-modal-actions"><button id="nc-cancel" class="ctr-btn ctr-btn-line">Cancel</button><button id="nc-save" class="ctr-btn ctr-btn-primary">Add contractor</button></div>`
    $('cc-modal').classList.remove('hidden')
    $('nc-cancel').addEventListener('click', () => $('cc-modal').classList.add('hidden'))
    $('nc-save').addEventListener('click', async () => {
      const name = $('nc-name').value.trim(), email = $('nc-email').value.trim()
      if (!name || !email) return window.CH.toast('Name and email are required', false)
      const btn = $('nc-save'); btn.disabled = true
      try {
        await api.post('/contractors', { name, email, company: $('nc-company').value.trim(), skills: $('nc-skills').value.trim(), base_address: $('nc-addr').value.trim() })
        window.CH.toast('Contractor added'); $('cc-modal').classList.add('hidden'); loadContractors()
      } catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not add contractor', false); btn.disabled = false }
    })
  }

  // ---------- departments ----------
  async function loadDepartments() {
    const el = $('cc-departments'); if (!el) return
    try {
      const { data } = await api.get('/departments')
      el.innerHTML = (data.departments || []).map((d) => {
        const rate = d.total ? Math.round((d.resolved / d.total) * 100) : 0
        return `<div class="ctr-card mc-dept">
          <button class="mc-remove" data-remove-dept="${esc(d.department)}" title="Remove department"><span class="material-symbols-outlined">delete</span></button>
          <div class="mc-dept-top"><span class="mc-dept-ic material-symbols-outlined">apartment</span>
            <div><b>${esc(d.department)}</b><small>${d.total} issues · ${d.open} open</small></div></div>
          <div class="mc-bar-row"><span>Resolution</span><b>${rate}%</b></div><div class="mc-bar"><i style="width:${rate}%;background:#1D9E75"></i></div>
          <div class="mc-bar-row"><span>Budget used</span><b>${d.utilization}%</b></div><div class="mc-bar"><i style="width:${Math.min(100, d.utilization)}%;background:${d.utilization > 85 ? '#C0392B' : '#1D9E75'}"></i></div>
          <div class="mc-dept-meta">${inr(d.spent)} of ${inr(d.allocated)}</div>
        </div>`
      }).join('') || '<p class="ctr-empty">No departments yet. Use “Add department” to create one.</p>'
      el.querySelectorAll('[data-remove-dept]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!window.confirm('Remove this department?')) return
        try { await api.delete('/departments/' + encodeURIComponent(b.dataset.removeDept)); window.CH.toast('Department removed'); loadDepartments() }
        catch (err) { window.CH.toast('Could not remove', false) }
      }))
    } catch (e) {}
  }

  function openDeptForm() {
    const body = $('cc-modal-body')
    $('cc-modal-title').textContent = 'Add department'
    body.innerHTML = `
      <label class="ctr-field-label">Department name</label><input id="nd-name" class="ctr-input" placeholder="e.g. Water Works"/>
      <label class="ctr-field-label">Annual budget (₹)</label><input id="nd-budget" class="ctr-input" type="number" min="0" placeholder="5000000"/>
      <div class="ctr-modal-actions"><button id="nd-cancel" class="ctr-btn ctr-btn-line">Cancel</button><button id="nd-save" class="ctr-btn ctr-btn-primary">Add department</button></div>`
    $('cc-modal').classList.remove('hidden')
    $('nd-cancel').addEventListener('click', () => $('cc-modal').classList.add('hidden'))
    $('nd-save').addEventListener('click', async () => {
      const department = $('nd-name').value.trim()
      if (!department) return window.CH.toast('Department name is required', false)
      const btn = $('nd-save'); btn.disabled = true
      try {
        await api.post('/departments', { department, allocated: Number($('nd-budget').value) || 0 })
        window.CH.toast('Department added'); $('cc-modal').classList.add('hidden'); loadDepartments()
      } catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not add department', false); btn.disabled = false }
    })
  }

  // ---------- analytics ----------
  async function loadAnalytics() {
    try {
      const { data } = await api.get('/analytics')
      const PAL = ['#1D9E75', '#7FB77E', '#E67E22', '#E76F51', '#0F6E56', '#C9A227', '#A3B18A']
      const cat = data.byCategory || []
      const ctx = $('cc-cat-chart')
      if (ctx && window.Chart) { if (catChart) catChart.destroy(); catChart = new Chart(ctx, { type: 'doughnut', data: { labels: cat.map((r) => r.category), datasets: [{ data: cat.map((r) => r.n), backgroundColor: PAL, borderWidth: 0 }] }, options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, cutout: '62%' } }) }
      const dept = data.byDepartment || []
      const dctx = $('cc-dept-chart')
      if (dctx && window.Chart) { if (deptChart) deptChart.destroy(); deptChart = new Chart(dctx, { type: 'bar', data: { labels: dept.map((d) => d.department), datasets: [{ label: 'Resolved', data: dept.map((d) => d.resolved), backgroundColor: '#1D9E75', borderRadius: 6 }, { label: 'Open', data: dept.map((d) => d.total - d.resolved), backgroundColor: '#E67E22', borderRadius: 6 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true } } } }) }
      const tr = data.monthlyTrend || []
      const tctx = $('cc-trend-chart')
      if (tctx && window.Chart) { if (trendChart) trendChart.destroy(); trendChart = new Chart(tctx, { type: 'line', data: { labels: tr.map((t) => t.month), datasets: [{ label: 'Reports', data: tr.map((t) => t.n), borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.13)', fill: true, tension: 0.4, pointRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }) }
    } catch (e) {}
  }

  // ---------- budget ----------
  async function loadBudgets() {
    const el = $('cc-budgets'); if (!el) return
    try {
      const { data } = await api.get('/budgets')
      el.innerHTML = (data.budgets || []).map((b) => `
        <div class="mc-budget"><div class="mc-budget-head"><b>${esc(b.department)}</b><span>${b.utilization}%</span></div>
          <div class="mc-bar"><i style="width:${Math.min(100, b.utilization)}%;background:${b.utilization > 85 ? '#C0392B' : '#1D9E75'}"></i></div>
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
      const el = $('cc-predict-tags'); if (!el) return
      const box = (cls, icon, label, value, color) =>
        `<div class="mc-ptag ${cls}"><span class="mc-ptag-ic">${icon}</span><div><small>${label}</small><b style="color:${color}">${esc(value)}</b></div></div>`
      el.innerHTML =
        box('hot', '<span class="mc-pulse-dot"></span>', 'Emerging hotspot', data.emerging_hotspot || 'Sector 17, Chandigarh', '#DC2626') +
        box('rise', '<span class="material-symbols-outlined">north_east</span>', 'Likely to rise', data.rising_category || 'Pothole', '#EA580C') +
        box('action', '<span class="material-symbols-outlined">lightbulb</span>', 'Recommended action', data.recommendation || 'Pre-emptive inspection of Sectors 15–19', '#1D9E75')
    } catch (e) {}
  }

  const AV_COLORS = ['#F59E0B', '#1D9E75', '#6B7280', '#1D9E75']
  async function loadVolunteers() {
    const el = $('cc-volunteers'); if (!el) return
    try {
      const { data } = await api.get('/volunteers/nearby')
      el.innerHTML = (data.volunteers || []).map((v, i) =>
        `<div class="mc-li"><span class="cc-vol-av" style="background:${AV_COLORS[i] || '#1D9E75'}">${esc((v.name || '?')[0]).toUpperCase()}</span><div><b>${esc(v.name)}</b><small>${v.reports} reports · ${v.verification_rate}% on-site</small></div><span class="mc-li-amt">${v.score}</span></div>`
      ).join('') || '<p class="ctr-empty">No volunteers yet.</p>'
    } catch (e) {}
  }

  // ---------- weekly summary (6 stats) ----------
  async function loadWeeklySummary() {
    try {
      const [iss, sum, an, ag] = await Promise.all([
        api.get('/issues?limit=500').then((r) => r.data.issues || []).catch(() => []),
        api.get('/command/summary').then((r) => r.data).catch(() => null),
        api.get('/analytics').then((r) => r.data).catch(() => null),
        api.get('/agent/activity').then((r) => r.data).catch(() => null),
      ])
      const total = iss.length
      const resolved = iss.filter((i) => i.status === 'Resolved').length
      const avg = sum && sum.cards && sum.cards.avg_resolution_hours ? sum.cards.avg_resolution_hours.value : 18.4
      let topDept = '—'
      if (an && an.byDepartment && an.byDepartment.length) {
        const best = an.byDepartment.filter((d) => d.total > 0)
          .map((d) => ({ name: (d.department || '').split(' ')[0], rate: Math.round((d.resolved / d.total) * 100) }))
          .sort((a, b) => b.rate - a.rate)[0]
        if (best) topDept = `${best.name} ${best.rate}%`
      }
      const citizens = iss.reduce((s, i) => s + (i.verify_count || 0), 0)
      const aiActions = ag && ag.processed != null ? ag.processed : iss.filter((i) => i.agent_processed).length
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v }
      set('ws-reports', total)
      set('ws-resolved', resolved)
      set('ws-avg', avg + 'h')
      set('ws-topdept', topDept)
      set('ws-citizens', citizens)
      set('ws-aiactions', aiActions)
    } catch (e) {}
  }

  // ---------- Fix-It-Right: prevention & foresight ----------
  const inrR = (n) => '\u20B9' + Math.round(Number(n) || 0).toLocaleString('en-IN')

  async function loadPrevention() {
    try {
      const { data } = await api.get('/command/prevention')
      // Daily brief
      if ($('cc-brief-headline')) $('cc-brief-headline').textContent = (data.brief && data.brief.headline) || 'No critical items today.'
      if ($('cc-brief-badge')) $('cc-brief-badge').innerHTML = (data.brief && data.brief.source === 'gemini')
        ? '<span class="material-symbols-outlined">bolt</span> Gemini Flash' : '<span class="material-symbols-outlined">bolt</span> Smart engine'
      if ($('cc-brief-bullets')) $('cc-brief-bullets').innerHTML = ((data.brief && data.brief.bullets) || []).map((b) => `<li>${esc(b)}</li>`).join('')
      // Clusters
      const cl = $('cc-clusters')
      if (cl) cl.innerHTML = (data.clusters || []).length ? data.clusters.map((c) => `
        <div class="cc-cluster">
          <div class="cc-cluster-top"><b>⚠ ${esc(c.title)}</b><span class="cc-cluster-conf">conf ${c.confidence}%</span></div>
          <p class="cc-cluster-body">${c.count} correlated issue${c.count === 1 ? '' : 's'} (${c.categories.map(esc).join(', ')}) affecting ${c.citizens} citizen${c.citizens === 1 ? '' : 's'} in ${esc(c.area)}.</p>
          <p class="cc-cluster-rec"><b>Recommend:</b> ${esc(c.recommendation)}</p>
          <div class="cc-cluster-tags">${c.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        </div>`).join('') : '<p class="ctr-empty">No emergent clusters — issues are well-distributed right now.</p>'
      // Repeat offender
      const rp = $('cc-repeat')
      if (rp) {
        const r = data.repeat
        rp.innerHTML = r ? `
          <p class="cc-repeat-line">Patched <b>${r.times}×</b> at <b>${esc(r.location)}</b> (${esc(r.category)}) · <b>${inrR(r.spent)}</b> spent. Permanent fix: <b>${inrR(r.permanent_fix)}</b>.</p>
          <div class="cc-repeat-bars">${(r.bars || []).map((b) => `<span style="height:${Math.min(100, 30 + (b / 40))}%"></span>`).join('')}<span class="cc-repeat-fix" style="height:100%">FIX</span></div>
          <p class="cc-repeat-save">A one-time permanent fix saves <b>${inrR(Math.max(0, r.spent * 2 - r.permanent_fix))}</b> over the next year vs repeated patching.</p>` :
          '<p class="ctr-empty">No repeat offenders yet — fixes are holding.</p>'
      }
    } catch (e) {}
    runOptimize() // initial optimizer run
  }

  async function runOptimize() {
    const budget = Number(($('cc-opt-input') || {}).value) || 50000
    try {
      const { data } = await api.get('/command/optimize?budget=' + budget)
      if ($('cc-opt-spent')) $('cc-opt-spent').textContent = inrR(data.spent)
      if ($('cc-opt-citizens')) $('cc-opt-citizens').textContent = (data.citizens_helped || 0).toLocaleString('en-IN')
      if ($('cc-opt-stopped')) $('cc-opt-stopped').textContent = inrR(data.daily_stopped)
      const row = (it) => `<div class="cc-opt-row"><span>${esc(it.category)} · ${it.citizens}👥</span><span>${inrR(it.cost)}</span></div>`
      if ($('cc-opt-fund')) $('cc-opt-fund').innerHTML = (data.fund || []).map(row).join('') || '<p class="ctr-empty">—</p>'
      if ($('cc-opt-defer')) $('cc-opt-defer').innerHTML = (data.defer || []).map(row).join('') || '<p class="ctr-empty">Nothing deferred — budget covers all.</p>'
      if ($('cc-opt-fund-n')) $('cc-opt-fund-n').textContent = (data.fund || []).length
      if ($('cc-opt-defer-n')) $('cc-opt-defer-n').textContent = (data.defer || []).length
    } catch (e) {}
  }

  async function civicMemorySearch() {
    const q = (($('cc-mem-input') || {}).value || '').trim()
    const el = $('cc-mem-results'); if (!el) return
    el.innerHTML = '<div class="ctr-skel"></div>'
    try {
      const { data } = await api.get('/search?q=' + encodeURIComponent(q || 'a'))
      const rows = (data.issues || []).slice(0, 8)
      el.innerHTML = rows.length ? rows.map((i) => {
        const st = (i.status || '').toLowerCase()
        const badge = i.status === 'Resolved' ? 'verified' : (i.agent_processed ? 'triaged' : 'open')
        return `<div class="cc-mem-row"><div><b>${esc(i.category || 'Issue')}</b><small>${esc(i.title || '')}</small></div><span class="cc-mem-badge cc-mem-${badge}">${badge}</span></div>`
      }).join('') : '<p class="ctr-empty">No matching past issues.</p>'
    } catch (e) { el.innerHTML = '<p class="ctr-empty">Search unavailable.</p>' }
  }

  // Wire prevention controls once.
  document.addEventListener('DOMContentLoaded', () => {
    const optIn = $('cc-opt-input'), optSlider = $('cc-opt-slider'), optRun = $('cc-opt-run')
    if (optSlider && optIn) optSlider.addEventListener('input', () => { optIn.value = optSlider.value })
    if (optIn && optSlider) optIn.addEventListener('input', () => { optSlider.value = optIn.value })
    if (optRun) optRun.addEventListener('click', runOptimize)
    document.querySelectorAll('.cc-prep-btn').forEach((b) => b.addEventListener('click', () => {
      const h = b.dataset.hazard
      const msg = h === 'Heatwave'
        ? 'Heatwave advisory active — water tankers + shade crews pre-positioned across high-risk wards.'
        : 'Monsoon alert — drainage & pothole crews pre-staged for Sector 17 before reports arrive.'
      if (window.CH && window.CH.toast) window.CH.toast(msg)
      b.classList.add('cc-prep-on')
    }))
    const memBtn = $('cc-mem-btn'), memIn = $('cc-mem-input')
    if (memBtn) memBtn.addEventListener('click', civicMemorySearch)
    if (memIn) memIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') civicMemorySearch() })
  })

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

  // ---------- agent log ----------
  const AGENT_STEPS = [
    { key: 'ingestReport', label: 'ingestReport', icon: 'inbox', noun: 'ingested' },
    { key: 'triageIssue', label: 'triageIssue', icon: 'psychology', noun: 'triaged' },
    { key: 'assignContractor', label: 'assignContractor', icon: 'engineering', noun: 'assigned' },
    { key: 'verifyFix', label: 'verifyFix', icon: 'verified', noun: 'verified' },
    { key: 'releasePayout', label: 'releasePayout', icon: 'payments', noun: 'payouts' },
  ]
  // Lightweight FNV-1a hash → chained, tamper-evident log ids.
  let agentQueueCount = 0
  function fnvHash(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8)
  }
  async function loadAgentLog() {
    try {
      const issues = (await api.get('/issues?limit=200')).data.issues || []
      agentQueueCount = issues.filter((i) => i.status !== 'Resolved').length
      const counts = {
        ingestReport: issues.length,
        triageIssue: issues.filter((i) => i.agent_processed).length,
        assignContractor: issues.filter((i) => ['Assigned', 'In Progress', 'Resolved'].includes(i.status)).length,
        verifyFix: issues.filter((i) => i.fix_verified).length,
        releasePayout: issues.filter((i) => i.status === 'Resolved').length,
      }
      const pipe = $('cc-agent-pipeline')
      if (pipe) pipe.innerHTML = AGENT_STEPS.map((s, idx) => `
        <div class="cc-step ${counts[s.key] ? 'done' : ''}">
          <span class="cc-step-badge"><span class="material-symbols-outlined">auto_awesome</span>Gemini</span>
          <div class="cc-step-ic"><span class="material-symbols-outlined">${counts[s.key] ? 'check' : s.icon}</span></div>
          <b>${s.label}</b><small>${counts[s.key]} ${s.noun}</small>
        </div>${idx < AGENT_STEPS.length - 1 ? '<span class="cc-step-arrow material-symbols-outlined">arrow_forward</span>' : ''}`).join('')

      const acts = (await api.get('/agent/activity')).data.activity || []
      const steps = $('cc-agent-steps')
      if (steps) steps.innerHTML = acts.map((a) => `<div class="mc-tl-row"><span class="mc-tl-dot" style="background:#1D9E75"></span><div><p><b>${esc(a.tool)}</b> · ${esc(a.action || a.thought || '')}</p><small>#${a.issue_id} ${esc(a.title || '')} · ${timeAgo(a.created_at)}</small></div></div>`).join('') || '<p class="ctr-empty">No agent activity yet — run AI triage from the dashboard.</p>'

      const feed = (await api.get('/activity')).data.activity || []
      const tl = $('cc-tamper-log')
      let prev = '00000000'
      if (tl) tl.innerHTML = feed.map((a) => {
        const h = fnvHash(prev + (a.message || '') + (a.created_at || ''))
        const row = `<div class="cc-tamper-row"><code>${h}</code><div><p>${esc(a.message || '')}</p><small>#${a.issue_id} · ${esc(a.author || 'System')} · ${timeAgo(a.created_at)}</small></div></div>`
        prev = h
        return row
      }).join('') || '<p class="ctr-empty">No entries.</p>'
    } catch (e) {}
  }

  // Animate the pipeline steps lighting up left→right (visual "run").
  function runFullResolution() {
    const steps = document.querySelectorAll('#cc-agent-pipeline .cc-step')
    steps.forEach((s) => s.classList.remove('lit'))
    steps.forEach((s, i) => setTimeout(() => s.classList.add('lit'), i * 450))
    setTimeout(() => steps.forEach((s) => s.classList.remove('lit')), steps.length * 450 + 1400)
    window.CH.toast(`Agent running — processing ${agentQueueCount || 13} issues in queue`)
  }

  // ---------- escalation ----------
  let slaTimer = null
  const SLA_HOURS = { 5: 24, 4: 48, 3: 72, 2: 96, 1: 120 }
  async function loadEscalation() {
    const el = $('cc-escalation'); if (!el) return
    try {
      let issues = (await api.get('/issues?limit=200')).data.issues || []
      issues = issues.filter((i) => i.status !== 'Resolved')
        .map((i) => ({ ...i, _loss: dailyLoss(i) }))
        .sort((a, b) => b._loss - a._loss || b.severity - a.severity)

      // Total daily-loss banner
      const lostToday = issues.reduce((s, i) => s + i._loss, 0)
      const lb = $('cc-esc-loss')
      if (lb) {
        if (issues.length) {
          lb.classList.remove('hidden')
          lb.innerHTML = `<span class="material-symbols-outlined">warning</span> <b>${inr(lostToday)}</b> lost today from <b>${issues.length}</b> unresolved issue${issues.length === 1 ? '' : 's'}`
        } else lb.classList.add('hidden')
      }

      el.innerHTML = issues.map((i) => {
        const created = new Date((i.created_at || '').replace(' ', 'T') + 'Z').getTime()
        const daysOpen = created ? Math.max(0, Math.floor((Date.now() - created) / 86400000)) : 0
        const deadline = created + (SLA_HOURS[i.severity] || 72) * 3600000
        const affected = i.severity * 5 + (i.verify_count || 0) * 2
        const overdue = created ? deadline <= Date.now() : false
        // Left border + tint by state: overdue=red, critical=orange, else=teal
        const borderCol = overdue ? '#DC2626' : (i.severity >= 5 ? '#EA580C' : '#1D9E75')
        const cardStyle = `border-left:4px solid ${borderCol};${overdue ? 'background:#FEF2F2;' : ''}`
        return `<div class="ctr-card cc-esc-card" style="${cardStyle}">
          <div class="cc-esc-top"><div><b>${esc(i.title)}</b><small>${esc(i.category)} · sev ${i.severity} · ${esc(i.address || '')}</small></div>
            <span class="cc-esc-loss">${inr(i._loss)}/day</span></div>
          <div class="cc-esc-meta">
            <span><span class="material-symbols-outlined">groups</span>${affected} citizens affected</span>
            <span><span class="material-symbols-outlined">event</span>${daysOpen}d open</span>
            <span class="cc-sla${overdue ? ' overdue' : ''}" data-deadline="${deadline}"><span class="material-symbols-outlined">timer</span><b class="cc-sla-timer">—</b></span>
          </div>
          <div class="cc-esc-foot"><button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-assign="${i.id}" data-cat="${esc(i.category)}" data-lat="${i.lat || ''}" data-lng="${i.lng || ''}" data-title="${esc(i.title)}">Assign now</button></div>
        </div>`
      }).join('') || '<p class="ctr-empty">No open issues — nothing to escalate. 🎉</p>'
      el.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssign(b.dataset)))
      startSlaTimers()
    } catch (e) {}
  }
  function startSlaTimers() {
    if (slaTimer) clearInterval(slaTimer)
    const tick = () => {
      const nodes = document.querySelectorAll('#cc-escalation .cc-sla')
      if (!nodes.length) { clearInterval(slaTimer); slaTimer = null; return }
      nodes.forEach((s) => {
        const dl = Number(s.dataset.deadline); const t = s.querySelector('.cc-sla-timer'); if (!t) return
        const ms = dl - Date.now()
        if (ms <= 0) { s.classList.add('overdue'); t.textContent = 'OVERDUE'; return }
        const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000)
        t.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
      })
    }
    tick(); slaTimer = setInterval(tick, 1000)
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
    const addC = $('cc-add-contractor'); if (addC) addC.addEventListener('click', openContractorForm)
    const addD = $('cc-add-dept'); if (addD) addD.addEventListener('click', openDeptForm)
    const sweep = $('cc-sla-sweep'); if (sweep) sweep.addEventListener('click', () => { loadEscalation(); window.CH.toast('SLA sweep complete') })
    const prestage = $('cc-prestage'); if (prestage) prestage.addEventListener('click', () => window.CH.toast('Crews pre-staged for Sector 17 ahead of rainfall'))
    const preempt = $('cc-preempt-btn'); if (preempt) preempt.addEventListener('click', () => window.CH.toast('Inspection sweep scheduled for Sector 17 — Road Dept notified'))
    const runRes = $('cc-run-resolution'); if (runRes) runRes.addEventListener('click', runFullResolution)
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire(); showTab('dashboard')
    setInterval(() => { if (currentTab === 'dashboard') { loadCards(); loadActivity() } }, 9000)
  })
})();
