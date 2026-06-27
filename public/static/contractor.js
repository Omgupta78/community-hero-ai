// Field Ops — full contractor panel. Tabs: Dashboard, My Jobs, Board, Map, Earnings, Profile.
// Loop: City assigns (escrow) -> Accept -> Navigate -> Prove fix -> Gemini verifies -> Paid.
(function () {
  if (!window.CH) return
  const { api, esc } = window.CH
  const $ = (id) => document.getElementById(id)
  const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')

  let map, markerLayer
  let assignments = [], available = [], mine = [], profile = {}
  let earnings = 0
  let currentTab = 'dashboard'
  let proofIssue = null, proofDataUrl = null, proofBase64 = null
  let quoteIssue = null
  const issueMap = {}

  function sevColor(s) { return s >= 5 ? '#EF4444' : s === 4 ? '#F59E0B' : s === 3 ? '#FACC15' : '#10B981' }
  function statusPill(s) {
    const c = { Resolved: '#10B981', Assigned: '#2563EB', 'In Progress': '#F59E0B', Verified: '#8B5CF6', Reported: '#94A3B8' }[s] || '#94A3B8'
    return `<span class="ctr-pill" style="color:${c};background:${c}1a">${esc(s)}</span>`
  }

  async function guard() {
    try {
      const { data } = await api.get('/auth/me')
      if (!data.authenticated || data.user.role !== 'contractor') {
        window.location.href = data.authenticated ? (data.user.role === 'admin' ? '/admin' : '/authority') : '/login'
        return false
      }
      return true
    } catch (e) { window.location.href = '/login'; return false }
  }

  // -------- normalize jobs --------
  function normEscrow(a) {
    const resolved = a.status === 'Resolved' || a.escrow_status === 'released'
    const accepted = a.state === 'InProgress' || a.status === 'In Progress'
    return {
      id: a.issue_id, title: a.title, category: a.category, severity: a.severity, status: a.status,
      address: a.address, lat: a.lat, lng: a.lng, photo_data: a.photo_data, kind: 'escrow',
      amount: a.escrow_amount, escrow_status: a.escrow_status, assigned_by: a.assigned_by,
      resolved, accepted, stage: resolved ? 4 : accepted ? 3 : 1, fix_verified: a.fix_verified,
    }
  }
  function normBounty(i) {
    const resolved = i.status === 'Resolved'
    return {
      id: i.id, title: i.title, category: i.category, severity: i.severity, status: i.status,
      address: i.address, lat: i.lat, lng: i.lng, photo_data: i.photo_data, kind: 'bounty',
      amount: i.bounty, resolved, accepted: true, stage: resolved ? 4 : 3, fix_verified: i.fix_verified,
    }
  }
  function myJobs() {
    const assignedIds = new Set(assignments.map((a) => a.issue_id))
    const claimed = (mine || []).filter((m) => !assignedIds.has(m.id)).map(normBounty)
    return assignments.map(normEscrow).concat(claimed)
  }

  // -------- status tracker --------
  function tracker(j) {
    const steps = j.kind === 'escrow'
      ? ['Assigned', 'Accepted', 'Fixing', 'Paid']
      : ['Claimed', 'On site', 'Fixing', 'Paid']
    return `<div class="ctr-track">${steps.map((s, k) => {
      const done = (k + 1) <= j.stage
      const cur = (k + 1) === j.stage && !j.resolved
      return `<div class="ctr-track-step ${done ? 'done' : ''} ${cur ? 'cur' : ''}"><i></i><span>${s}</span></div>`
    }).join('')}</div>`
  }

  // -------- job card --------
  function jobCard(j) {
    const amountChip = j.kind === 'escrow'
      ? `<span class="ctr-escrow ${j.escrow_status === 'released' ? 'released' : ''}"><span class="material-symbols-outlined">${j.escrow_status === 'released' ? 'lock_open' : 'lock'}</span>${inr(j.amount)} ${j.escrow_status === 'released' ? 'paid' : 'escrow'}</span>`
      : `<span class="ctr-bounty"><span class="material-symbols-outlined">payments</span>${inr(j.amount)} bounty</span>`
    let actions = ''
    if (j.resolved) actions = `<span class="ctr-done"><span class="material-symbols-outlined">verified</span> Paid ${inr(j.amount)}</span>`
    else {
      if (j.kind === 'escrow' && !j.accepted) actions += `<button class="ctr-btn ctr-btn-amber ctr-btn-sm" data-accept="${j.id}"><span class="material-symbols-outlined">check</span> Accept</button>`
      else actions += `<button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-proof="${j.id}"><span class="material-symbols-outlined">photo_camera</span> Prove fix</button>`
      if (j.lat && j.lng) actions += `<button class="ctr-btn ctr-btn-line ctr-btn-sm" data-nav="${j.lat},${j.lng}"><span class="material-symbols-outlined">navigation</span></button>`
    }
    const flag = j.kind === 'escrow' ? `<div class="ctr-card-flag"><span class="material-symbols-outlined">apartment</span> Assigned by ${esc(j.assigned_by || 'City Command')}</div>` : ''
    return `<div class="ctr-card ${j.kind === 'escrow' ? 'ctr-card-assigned' : ''}">
      ${flag}
      <div class="ctr-card-body">
        ${j.photo_data ? `<img src="${j.photo_data}" class="ctr-thumb" alt="" />` : `<div class="ctr-thumb ctr-thumb-ph"><span class="material-symbols-outlined" style="color:${sevColor(j.severity)}">place</span></div>`}
        <div class="ctr-card-main">
          <button class="ctr-card-title" data-detail="${j.id}">${esc(j.title)}</button>
          <div class="ctr-card-meta">${esc(j.category)} · sev ${j.severity} · ${esc(j.address || '')}</div>
          <div class="ctr-card-row">${statusPill(j.status)}${amountChip}</div>
        </div>
      </div>
      ${tracker(j)}
      <div class="ctr-card-foot">${actions}</div>
    </div>`
  }

  function boardCard(i) {
    return `<div class="ctr-card">
      <div class="ctr-card-body">
        ${i.photo_data ? `<img src="${i.photo_data}" class="ctr-thumb" alt="" />` : `<div class="ctr-thumb ctr-thumb-ph"><span class="material-symbols-outlined" style="color:${sevColor(i.severity)}">place</span></div>`}
        <div class="ctr-card-main">
          <button class="ctr-card-title" data-detail="${i.id}">${esc(i.title)}</button>
          <div class="ctr-card-meta">${esc(i.category)} · sev ${i.severity} · ${esc(i.address || '')}</div>
          <div class="ctr-card-row">${statusPill(i.status)}<span class="ctr-bounty"><span class="material-symbols-outlined">payments</span>${inr(i.bounty)} bounty</span></div>
        </div>
      </div>
      <div class="ctr-card-foot">
        <button class="ctr-btn ctr-btn-amber ctr-btn-sm" data-claim="${i.id}"><span class="material-symbols-outlined">how_to_reg</span> Claim</button>
        <button class="ctr-btn ctr-btn-line ctr-btn-sm" data-quote="${i.id}" data-title="${esc(i.title)}"><span class="material-symbols-outlined">request_quote</span> Quote</button>
      </div>
    </div>`
  }

  // -------- data --------
  async function loadAll() {
    try {
      const [aRes, jRes] = await Promise.all([api.get('/contractor/assignments'), api.get('/jobs')])
      assignments = aRes.data.assignments || []
      profile = aRes.data.profile || {}
      available = jRes.data.available || []
      mine = jRes.data.mine || []
      earnings = jRes.data.earnings || 0
      ;[...assignments.map(normEscrow), ...available.map(normBounty), ...mine.map(normBounty)].forEach((j) => { issueMap[j.id] = j })

      renderHeader(); renderTab(currentTab)
    } catch (e) { if (e && e.response && e.response.status === 401) window.location.href = '/login' }
  }

  function renderHeader() {
    if ($('ctr-earnings')) $('ctr-earnings').textContent = inr(earnings)
    if ($('ctr-rating')) $('ctr-rating').textContent = '★ ' + (profile.rating != null ? profile.rating : '—')
    if ($('ctr-jobs-done')) $('ctr-jobs-done').textContent = (profile.jobs_completed || 0) + ' jobs completed'
    if (profile.availability) $('ctr-avail-select').value = profile.availability
    paintAvail(profile.availability || 'available')
  }

  function renderTab(tab) {
    const jobs = myJobs()
    const escrowLocked = assignments.filter((a) => a.escrow_status === 'locked').reduce((s, a) => s + (a.escrow_amount || 0), 0)
    if (tab === 'dashboard') {
      $('ctr-k-assigned').textContent = assignments.filter((a) => a.status !== 'Resolved').length
      $('ctr-k-active').textContent = jobs.filter((j) => !j.resolved && j.accepted).length
      $('ctr-k-done').textContent = jobs.filter((j) => j.resolved).length
      $('ctr-k-escrow').textContent = inr(escrowLocked)
      const need = jobs.filter((j) => !j.resolved)
      $('ctr-active-list').innerHTML = need.length ? need.map(jobCard).join('') : '<p class="ctr-empty">No jobs need action. Check the Job Board for open work.</p>'
      wireCards($('ctr-active-list'))
    } else if (tab === 'jobs') {
      const f = (document.querySelector('#ctr-job-filters .active') || {}).dataset
      const jf = (f && f.jf) || 'all'
      let rows = jobs
      if (jf === 'city') rows = jobs.filter((j) => j.kind === 'escrow')
      else if (jf === 'active') rows = jobs.filter((j) => !j.resolved)
      else if (jf === 'done') rows = jobs.filter((j) => j.resolved)
      $('ctr-jobs-list').innerHTML = rows.length ? rows.map(jobCard).join('') : '<p class="ctr-empty">No jobs in this view.</p>'
      wireCards($('ctr-jobs-list'))
    } else if (tab === 'board') {
      $('ctr-board-list').innerHTML = available.length ? available.map(boardCard).join('') : '<p class="ctr-empty">No open jobs right now. Check back soon.</p>'
      wireCards($('ctr-board-list'))
    } else if (tab === 'map') {
      renderMap(jobs)
    } else if (tab === 'earnings') {
      $('ctr-earn-total').textContent = inr(earnings)
      $('ctr-earn-jobs').textContent = jobs.filter((j) => j.resolved).length
      $('ctr-earn-escrow').textContent = inr(escrowLocked)
      const paid = jobs.filter((j) => j.resolved)
      $('ctr-earn-history').innerHTML = paid.length ? paid.map((j) => `
        <div class="ctr-earn-row"><div><b>${esc(j.title)}</b><small>${esc(j.category)} · ${j.kind === 'escrow' ? 'Escrow' : 'Bounty'}</small></div>
          <span class="ctr-earn-amt">+${inr(j.amount)}</span></div>`).join('') : '<p class="ctr-empty">No payments yet. Complete a verified fix to get paid.</p>'
    } else if (tab === 'profile') {
      renderProfile()
    }
  }

  function wireCards(root) {
    root.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', () => accept(b.dataset.accept, b)))
    root.querySelectorAll('[data-proof]').forEach((b) => b.addEventListener('click', () => openProof(b.dataset.proof)))
    root.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => claim(b.dataset.claim, b)))
    root.querySelectorAll('[data-quote]').forEach((b) => b.addEventListener('click', () => openQuote(b.dataset.quote, b.dataset.title)))
    root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      const [lat, lng] = b.dataset.nav.split(','); window.open(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${lat}%2C${lng}#map=16/${lat}/${lng}`, '_blank')
    }))
    root.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.detail)))
  }

  // -------- map --------
  function renderMap(jobs) {
    if (!window.L || !$('ctr-map')) return
    if (!map) {
      map = L.map('ctr-map', { zoomControl: true }).setView([30.7333, 76.7794], 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
      markerLayer = L.layerGroup().addTo(map)
    }
    markerLayer.clearLayers()
    const add = (i, color) => { if (i.lat && i.lng) L.circleMarker([i.lat, i.lng], { radius: 8, color, fillColor: color, fillOpacity: .85, weight: 2 }).bindPopup(`<b>${esc(i.title)}</b><br>${esc(i.category)} · ${esc(i.status)}`).addTo(markerLayer) }
    jobs.forEach((j) => add(j, '#2563EB'))
    available.forEach((i) => add(i, '#F59E0B'))
    setTimeout(() => map.invalidateSize(), 200)
  }

  // -------- profile --------
  async function renderProfile() {
    try { const { data } = await api.get('/contractor/profile'); profile = Object.assign(profile, data) } catch (e) {}
    $('ctr-prof-name').textContent = profile.name || ''
    $('ctr-prof-company').textContent = profile.company || 'Contractor'
    $('ctr-prof-rating').textContent = '★ ' + (profile.rating ?? '—')
    $('ctr-prof-jobs').textContent = profile.jobs_completed || 0
    $('ctr-prof-active').textContent = profile.active_tasks || 0
    $('ctr-prof-radius').textContent = profile.service_radius_km ?? 10
    $('ctr-f-company').value = profile.company || ''
    $('ctr-f-skills').value = (profile.skills || []).join(', ')
    $('ctr-f-address').value = profile.base_address || ''
    $('ctr-f-radius').value = profile.service_radius_km ?? 10
    $('ctr-f-radius-val').textContent = profile.service_radius_km ?? 10
  }

  // -------- actions --------
  async function accept(id, btn) {
    btn.disabled = true
    try { await api.post(`/issues/${id}/accept`); window.CH.toast('Job accepted — navigate and get to work!'); loadAll() }
    catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not accept', false); btn.disabled = false }
  }
  async function claim(id, btn) {
    btn.disabled = true
    try { await api.post(`/issues/${id}/claim`); window.CH.toast('Job claimed!'); loadAll() }
    catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not claim', false); btn.disabled = false }
  }

  // -------- detail drawer --------
  async function openDetail(id) {
    const d = $('ctr-drawer'), body = $('ctr-drawer-body')
    $('ctr-drawer-title').textContent = 'Job #' + id
    body.innerHTML = '<div class="ctr-skel"></div>'
    d.classList.remove('hidden')
    try {
      const [iRes, pRes] = await Promise.all([api.get(`/issues/${id}`), api.get(`/issues/${id}/plan`).catch(() => ({ data: null }))])
      const i = iRes.data.issue || {}
      const updates = iRes.data.updates || []
      const plan = pRes.data
      const j = issueMap[id] || {}
      body.innerHTML = `
        ${i.photo_data ? `<img src="${i.photo_data}" class="ctr-detail-img" alt="" />` : ''}
        <h4 class="ctr-detail-title">${esc(i.title || j.title || '')}</h4>
        <div class="ctr-card-meta">${esc(i.category || '')} · sev ${i.severity || ''} · ${esc(i.address || '')}</div>
        <p class="ctr-detail-desc">${esc(i.description || i.ai_summary || '')}</p>
        ${i.lat && i.lng ? `<button class="ctr-btn ctr-btn-line ctr-btn-block" id="ctr-detail-nav"><span class="material-symbols-outlined">navigation</span> Navigate there</button>` : ''}
        ${plan ? `<div class="ctr-plan"><div class="ctr-plan-head"><span class="material-symbols-outlined">auto_awesome</span> AI Resolution Plan <span class="ctr-tag-mini">${plan.source === 'gemini' ? 'Gemini' : 'heuristic'}</span></div>
          <ol class="ctr-plan-steps">${(plan.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          <div class="ctr-plan-grid"><span><b>Crew</b>${esc(plan.crew || '—')}</span><span><b>Time</b>${esc(plan.est_time || '—')}</span><span><b>Cost</b>${esc(plan.est_cost || '—')}</span></div>
          ${plan.equipment && plan.equipment.length ? `<div class="ctr-plan-eq">${plan.equipment.map((e) => `<i>${esc(e)}</i>`).join('')}</div>` : ''}
          ${plan.safety ? `<p class="ctr-plan-safety"><span class="material-symbols-outlined">health_and_safety</span> ${esc(plan.safety)}</p>` : ''}</div>` : ''}
        <div class="ctr-plan-head" style="margin-top:16px"><span class="material-symbols-outlined">history</span> Timeline</div>
        <div class="ctr-detail-tl">${updates.map((u) => `<div class="ctr-tl-row"><span class="ctr-tl-dot"></span><div><p>${esc(u.message)}</p><small>${esc(u.author || 'System')} · ${esc(u.status || '')}</small></div></div>`).join('') || '<p class="ctr-empty">No updates yet.</p>'}</div>
        ${!j.resolved ? `<button class="ctr-btn ctr-btn-primary ctr-btn-block" id="ctr-detail-proof"><span class="material-symbols-outlined">photo_camera</span> Prove the fix</button>` : ''}`
      const nav = $('ctr-detail-nav'); if (nav) nav.addEventListener('click', () => window.open(`https://www.openstreetmap.org/directions?route=;${i.lat}%2C${i.lng}#map=16/${i.lat}/${i.lng}`, '_blank'))
      const pf = $('ctr-detail-proof'); if (pf) pf.addEventListener('click', () => { d.classList.add('hidden'); openProof(id) })
    } catch (e) { body.innerHTML = '<p class="ctr-empty">Could not load job details.</p>' }
  }

  // -------- quote --------
  function openQuote(id, title) {
    quoteIssue = id
    $('ctr-quote-title').textContent = title || ('#' + id)
    $('ctr-q-cost').value = ''; $('ctr-q-days').value = ''
    $('ctr-quote-modal').classList.remove('hidden')
  }
  async function submitQuote() {
    const cost = Number($('ctr-q-cost').value), days = Number($('ctr-q-days').value)
    if (!(cost > 0) || !(days > 0)) return window.CH.toast('Enter a valid cost and time', false)
    const btn = $('ctr-quote-submit'); btn.disabled = true
    try { await api.post(`/issues/${quoteIssue}/quotations`, { est_cost: cost, est_days: days }); window.CH.toast('Bid submitted to the City'); $('ctr-quote-modal').classList.add('hidden') }
    catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not submit bid', false) }
    btn.disabled = false
  }

  // -------- proof --------
  function downscale(file, maxDim = 1280, q = 0.72) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file); const im = new Image()
      im.onload = () => {
        let { width, height } = im
        if (width > maxDim || height > maxDim) { if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim } else { width = Math.round((width * maxDim) / height); height = maxDim } }
        try { const cv = document.createElement('canvas'); cv.width = width; cv.height = height; cv.getContext('2d').drawImage(im, 0, 0, width, height); URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', q)) }
        catch (e) { URL.revokeObjectURL(url); resolve(null) }
      }
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      im.src = url
    })
  }
  function openProof(id) {
    proofIssue = id; proofDataUrl = proofBase64 = null
    const info = issueMap[id] || {}
    $('ctr-proof-id').textContent = '#' + id
    $('ctr-proof-title').textContent = info.title || ''
    $('ctr-proof-payout').innerHTML = info.kind === 'escrow'
      ? `<span class="material-symbols-outlined">lock</span> ${inr(info.amount)} escrow releases to you on verification`
      : `<span class="material-symbols-outlined">payments</span> ${inr(info.amount)} bounty paid on verification`
    const before = $('ctr-before')
    if (info.photo_data) { before.className = 'ctr-ba-img'; before.innerHTML = `<img src="${info.photo_data}" alt="before" />` }
    else { before.className = 'ctr-ba-img ctr-ba-empty'; before.innerHTML = '<span class="material-symbols-outlined">image_not_supported</span>' }
    $('ctr-proof-preview').classList.add('hidden'); $('ctr-proof-ph').classList.remove('hidden')
    $('ctr-proof-verdict').classList.add('hidden')
    const sb = $('ctr-proof-submit'); sb.disabled = false; sb.innerHTML = '<span class="material-symbols-outlined">verified</span> Submit for AI Verification'
    $('ctr-proof-modal').classList.remove('hidden')
  }
  async function submitProof() {
    if (!proofIssue) return
    if (!proofBase64) return window.CH.toast('Add an "after" photo first', false)
    const btn = $('ctr-proof-submit'); btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined ctr-spin">progress_activity</span> Gemini is verifying…'
    try {
      const { data } = await api.post(`/issues/${proofIssue}/proof`, { after_photo: proofDataUrl, afterImageBase64: proofBase64, mimeType: 'image/jpeg' })
      const v = $('ctr-proof-verdict'); v.classList.remove('hidden')
      if (data.resolved) {
        v.className = 'ctr-verdict ctr-verdict-ok'
        v.innerHTML = `<b><span class="material-symbols-outlined">verified</span> Fix verified (${data.confidence}%)</b><p>${esc(data.reason)}</p><p class="ctr-verdict-pay">${data.via === 'escrow' ? 'Escrow' : 'Bounty'} ${inr(data.paid)} released to you.</p>`
        window.CH.toast(`Verified! ${inr(data.paid)} earned`)
        setTimeout(() => { $('ctr-proof-modal').classList.add('hidden'); loadAll() }, 2200)
      } else {
        v.className = 'ctr-verdict ctr-verdict-no'
        v.innerHTML = `<b><span class="material-symbols-outlined">error</span> Not confirmed (${data.confidence}%)</b><p>${esc(data.reason)} Try a clearer "after" photo.</p>`
        btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">verified</span> Submit for AI Verification'
      }
    } catch (e) {
      window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Verification failed', false)
      btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">verified</span> Submit for AI Verification'
    }
  }

  function paintAvail(v) { const dot = document.querySelector('.ctr-avail-dot'); if (dot) dot.style.background = v === 'available' ? '#10B981' : v === 'busy' ? '#F59E0B' : '#94A3B8' }

  function showTab(tab) {
    currentTab = tab
    document.querySelectorAll('.ctr-view').forEach((v) => v.classList.toggle('hidden', v.id !== 'cview-' + tab))
    document.querySelectorAll('.ctr-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab))
    window.scrollTo(0, 0)
    renderTab(tab)
  }

  function wire() {
    document.querySelectorAll('.ctr-tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)))
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)))
    document.querySelectorAll('#ctr-job-filters .ctr-filter').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#ctr-job-filters .ctr-filter').forEach((x) => x.classList.remove('active')); b.classList.add('active'); renderTab('jobs')
    }))
    // availability
    $('ctr-avail-select').addEventListener('change', async (e) => {
      const v = e.target.value; paintAvail(v)
      try { await api.post('/contractor/availability', { availability: v }); window.CH.toast('Availability: ' + v) } catch (err) {}
    })
    // proof modal
    $('ctr-proof-zone').addEventListener('click', () => $('ctr-proof-input').click())
    $('ctr-proof-input').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return
      const dataUrl = await downscale(file); if (!dataUrl) return window.CH.toast('Could not read image', false)
      proofDataUrl = dataUrl; proofBase64 = dataUrl.split(',')[1]
      const img = $('ctr-proof-preview'); img.src = dataUrl; img.classList.remove('hidden'); $('ctr-proof-ph').classList.add('hidden')
    })
    $('ctr-proof-submit').addEventListener('click', submitProof)
    closeBtns(['ctr-proof-close', 'ctr-proof-cancel'], 'ctr-proof-modal')
    // quote modal
    $('ctr-quote-submit').addEventListener('click', submitQuote)
    closeBtns(['ctr-quote-close', 'ctr-quote-cancel'], 'ctr-quote-modal')
    // drawer
    $('ctr-drawer-close').addEventListener('click', () => $('ctr-drawer').classList.add('hidden'))
    $('ctr-drawer').addEventListener('click', (e) => { if (e.target === $('ctr-drawer')) $('ctr-drawer').classList.add('hidden') })
    // profile
    $('ctr-f-radius').addEventListener('input', (e) => { $('ctr-f-radius-val').textContent = e.target.value })
    $('ctr-f-gps').addEventListener('click', async () => {
      const loc = await window.CH.getLocation(); if (loc) { profile._lat = loc.lat; profile._lng = loc.lng; window.CH.toast('Location captured') } else window.CH.toast('Location unavailable', false)
    })
    $('ctr-f-save').addEventListener('click', async () => {
      const btn = $('ctr-f-save'); btn.disabled = true
      try {
        await api.post('/contractor/profile', {
          company: $('ctr-f-company').value, skills: $('ctr-f-skills').value,
          base_address: $('ctr-f-address').value, service_radius_km: Number($('ctr-f-radius').value),
          lat: profile._lat ?? null, lng: profile._lng ?? null,
        })
        window.CH.toast('Profile saved'); await loadAll(); renderProfile()
      } catch (e) { window.CH.toast('Could not save', false) }
      btn.disabled = false
    })
    // ai help
    const ai = $('ctr-ai-btn'); if (ai) ai.addEventListener('click', () => { const fab = document.querySelector('#ch-chat-fab, #chat-fab, .chat-fab'); if (fab) fab.click() })
  }
  function closeBtns(ids, modalId) { ids.forEach((id) => { const b = $(id); if (b) b.addEventListener('click', () => $(modalId).classList.add('hidden')) }) }

  ;(async function init() {
    if (!(await guard())) return
    wire(); await loadAll()
    setInterval(() => { if (currentTab === 'dashboard' || currentTab === 'jobs') loadAll() }, 9000)
  })()
})();
