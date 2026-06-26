// Field Ops — contractor portal. Municipality-assigned (escrow) jobs + open board.
// Submit an "after" photo → Gemini verifies → escrow/bounty released instantly.
(function () {
  const { api, esc } = window.CH
  const $ = (id) => document.getElementById(id)
  const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')
  let proofIssue = null, proofDataUrl = null, proofBase64 = null
  const issueMap = {} // id -> {title, photo_data, escrow_amount, bounty, via}

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

  function thumb(i) {
    return i.photo_data
      ? `<img src="${i.photo_data}" class="ctr-thumb" alt="" />`
      : `<div class="ctr-thumb ctr-thumb-ph"><span class="material-symbols-outlined">place</span></div>`
  }

  // Municipality-assigned (escrow) job card.
  function assignedCard(a) {
    const done = a.status === 'Resolved' || a.escrow_status === 'released'
    const action = done
      ? `<span class="ctr-done"><span class="material-symbols-outlined">verified</span> Paid ${inr(a.escrow_amount)}</span>`
      : `<button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-proof="${a.issue_id}"><span class="material-symbols-outlined">photo_camera</span> Prove fix</button>`
    return `<div class="ctr-card ctr-card-assigned">
      <div class="ctr-card-flag"><span class="material-symbols-outlined">apartment</span> Assigned by ${esc(a.assigned_by || 'City Command')}</div>
      <div class="ctr-card-body">
        ${thumb(a)}
        <div class="ctr-card-main">
          <a href="/issue/${a.issue_id}" class="ctr-card-title">${esc(a.title)}</a>
          <div class="ctr-card-meta">${esc(a.category)} · sev ${a.severity} · ${esc(a.address || '')}</div>
          <div class="ctr-card-row">${statusPill(a.status)}<span class="ctr-escrow ${a.escrow_status}"><span class="material-symbols-outlined">${a.escrow_status === 'released' ? 'lock_open' : 'lock'}</span>${inr(a.escrow_amount)} ${a.escrow_status === 'released' ? 'released' : 'in escrow'}</span></div>
        </div>
      </div>
      <div class="ctr-card-foot">${action}</div>
    </div>`
  }

  // Open-board / claimed bounty job card.
  function jobCard(i, mine) {
    const action = mine
      ? (i.status === 'Resolved'
          ? `<span class="ctr-done"><span class="material-symbols-outlined">verified</span> ${i.fix_verified ? 'Paid' : 'Done'}</span>`
          : `<button class="ctr-btn ctr-btn-primary ctr-btn-sm" data-proof="${i.id}"><span class="material-symbols-outlined">photo_camera</span> Prove fix</button>`)
      : `<button class="ctr-btn ctr-btn-amber ctr-btn-sm" data-claim="${i.id}"><span class="material-symbols-outlined">how_to_reg</span> Claim</button>`
    return `<div class="ctr-card">
      <div class="ctr-card-body">
        ${thumb(i)}
        <div class="ctr-card-main">
          <a href="/issue/${i.id}" class="ctr-card-title">${esc(i.title)}</a>
          <div class="ctr-card-meta">${esc(i.category)} · sev ${i.severity} · ${esc(i.address || '')}</div>
          <div class="ctr-card-row">${statusPill(i.status)}<span class="ctr-bounty"><span class="material-symbols-outlined">payments</span>${inr(i.bounty)} bounty</span></div>
        </div>
      </div>
      <div class="ctr-card-foot">${action}</div>
    </div>`
  }

  async function loadAll() {
    try {
      const [aRes, jRes] = await Promise.all([api.get('/contractor/assignments'), api.get('/jobs')])
      const assignments = aRes.data.assignments || []
      const prof = aRes.data.profile || {}
      const jobs = jRes.data

      // Header / KPIs.
      $('ctr-earnings').textContent = inr(jobs.earnings || 0)
      $('ctr-rating').textContent = '★ ' + (prof.rating != null ? prof.rating : '—')
      $('ctr-jobs-done').textContent = (prof.jobs_completed || 0) + ' jobs completed'
      if (prof.availability) $('ctr-avail-select').value = prof.availability
      paintAvail(prof.availability || 'available')

      const assignedIds = new Set(assignments.map((a) => a.issue_id))
      const activeAssigned = assignments.filter((a) => a.status !== 'Resolved')
      const escrowLocked = assignments.filter((a) => a.escrow_status === 'locked').reduce((s, a) => s + (a.escrow_amount || 0), 0)
      const claimed = (jobs.mine || []).filter((m) => !assignedIds.has(m.id))

      $('ctr-k-assigned').textContent = activeAssigned.length
      $('ctr-k-active').textContent = activeAssigned.length + claimed.filter((m) => m.status !== 'Resolved').length
      $('ctr-k-done').textContent = (jobs.mine || []).filter((m) => m.status === 'Resolved').length
      $('ctr-k-escrow').textContent = inr(escrowLocked)

      // Cache for proof modal.
      assignments.forEach((a) => { issueMap[a.issue_id] = { title: a.title, photo_data: a.photo_data, escrow_amount: a.escrow_amount, via: 'escrow' } })
      ;(jobs.available || []).concat(jobs.mine || []).forEach((i) => { if (!issueMap[i.id]) issueMap[i.id] = { title: i.title, photo_data: i.photo_data, bounty: i.bounty, via: 'bounty' } })

      // Render.
      $('ctr-assigned').innerHTML = assignments.length ? assignments.map(assignedCard).join('')
        : '<p class="ctr-empty">No municipal assignments yet. The City Command Center will assign escrow-backed jobs here.</p>'
      $('ctr-open').innerHTML = (jobs.available || []).length ? jobs.available.map((i) => jobCard(i, false)).join('')
        : '<p class="ctr-empty">No open jobs right now. Check back soon.</p>'
      $('ctr-mine').innerHTML = claimed.length ? claimed.map((i) => jobCard(i, true)).join('')
        : '<p class="ctr-empty">No self-claimed jobs. Claim one from the open board above.</p>'

      document.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => claim(b.dataset.claim, b)))
      document.querySelectorAll('[data-proof]').forEach((b) => b.addEventListener('click', () => openProof(b.dataset.proof)))
    } catch (e) {
      if (e && e.response && e.response.status === 401) window.location.href = '/login'
    }
  }

  function paintAvail(v) {
    const dot = document.querySelector('.ctr-avail-dot')
    if (dot) dot.style.background = v === 'available' ? '#10B981' : v === 'busy' ? '#F59E0B' : '#94A3B8'
  }

  async function claim(id, btn) {
    btn.disabled = true
    try { await api.post(`/issues/${id}/claim`); window.CH.toast('Job claimed — get to work!'); loadAll() }
    catch (e) { window.CH.toast((e.response && e.response.data && e.response.data.error) || 'Could not claim', false); btn.disabled = false }
  }

  // ---- Proof modal ----
  function downscale(file, maxDim = 1280, q = 0.72) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file); const im = new Image()
      im.onload = () => {
        let { width, height } = im
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim }
          else { width = Math.round((width * maxDim) / height); height = maxDim }
        }
        try { const cv = document.createElement('canvas'); cv.width = width; cv.height = height
          cv.getContext('2d').drawImage(im, 0, 0, width, height); URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', q)) }
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
    const payout = info.via === 'escrow'
      ? `<span class="material-symbols-outlined">lock</span> ${inr(info.escrow_amount)} escrow releases to you on verification`
      : `<span class="material-symbols-outlined">payments</span> ${inr(info.bounty)} bounty paid on verification`
    $('ctr-proof-payout').innerHTML = payout
    const before = $('ctr-before')
    if (info.photo_data) { before.className = 'ctr-ba-img'; before.innerHTML = `<img src="${info.photo_data}" alt="before" />` }
    else { before.className = 'ctr-ba-img ctr-ba-empty'; before.innerHTML = '<span class="material-symbols-outlined">image_not_supported</span>' }
    $('ctr-proof-preview').classList.add('hidden'); $('ctr-proof-ph').classList.remove('hidden')
    $('ctr-proof-verdict').classList.add('hidden')
    const sb = $('ctr-proof-submit'); sb.disabled = false; sb.innerHTML = '<span class="material-symbols-outlined">verified</span> Submit for AI Verification'
    $('ctr-proof-modal').classList.remove('hidden')
  }

  function wireProof() {
    $('ctr-proof-zone').addEventListener('click', () => $('ctr-proof-input').click())
    $('ctr-proof-input').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return
      const dataUrl = await downscale(file); if (!dataUrl) return window.CH.toast('Could not read image', false)
      proofDataUrl = dataUrl; proofBase64 = dataUrl.split(',')[1]
      const img = $('ctr-proof-preview'); img.src = dataUrl; img.classList.remove('hidden'); $('ctr-proof-ph').classList.add('hidden')
    })
    $('ctr-proof-close').addEventListener('click', () => $('ctr-proof-modal').classList.add('hidden'))
    $('ctr-proof-cancel').addEventListener('click', () => $('ctr-proof-modal').classList.add('hidden'))
    $('ctr-proof-modal').addEventListener('click', (e) => { if (e.target === $('ctr-proof-modal')) $('ctr-proof-modal').classList.add('hidden') })
    $('ctr-proof-submit').addEventListener('click', submitProof)
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
        setTimeout(() => { $('ctr-proof-modal').classList.add('hidden'); loadAll() }, 2400)
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

  function wire() {
    wireProof()
    $('ctr-avail-select').addEventListener('change', async (e) => {
      const v = e.target.value; paintAvail(v)
      try { await api.post('/contractor/availability', { availability: v }); window.CH.toast('Availability: ' + v) } catch (err) {}
    })
    const ai = $('ctr-ai-btn'); if (ai) ai.addEventListener('click', () => {
      const fab = document.querySelector('#ch-chat-fab, #chat-fab, .chat-fab'); if (fab) fab.click()
    })
  }

  ;(async function init() {
    if (!(await guard())) return
    wire(); loadAll()
    setInterval(loadAll, 9000)
  })()
})();
