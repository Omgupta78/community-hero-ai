// Contractor / Responder dashboard — claim jobs, submit proof-of-fix,
// Gemini verifies before/after, bounty is paid on a verified fix.
(function () {
  const { api, CAT_ICON, severityBadge, STATUS_COLOR, esc, timeAgo, toast } = window.CH
  const $ = (id) => document.getElementById(id)
  let currentJob = null
  let proofDataUrl = null
  let proofBase64 = null
  let proofMime = null

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

  function jobCard(i, mine) {
    const [scls, slabel] = severityBadge(i.severity)
    const thumb = i.photo_data
      ? `<img src="${i.photo_data}" class="w-16 h-16 rounded-lg object-cover shrink-0" />`
      : `<div class="w-16 h-16 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-primary">${CAT_ICON[i.category] || 'place'}</span></div>`
    const action = mine
      ? (i.status === 'Resolved'
          ? `<span class="text-[11px] font-bold px-2 py-1 rounded-full bg-secondary text-white flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">verified</span>${i.fix_verified ? 'Paid' : 'Done'}</span>`
          : `<button class="proof-btn bg-primary text-on-primary rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1" data-id="${i.id}" data-title="${esc(i.title)}"><span class="material-symbols-outlined text-[16px]">photo_camera</span>Prove fix</button>`)
      : `<button class="claim-btn bg-secondary text-white rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1" data-id="${i.id}"><span class="material-symbols-outlined text-[16px]">how_to_reg</span>Claim</button>`
    return `
      <div class="flex items-center gap-3 border border-outline-variant rounded-xl p-3">
        ${thumb}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <a href="/issue/${i.id}" class="font-semibold text-on-surface truncate hover:text-primary">${esc(i.title)}</a>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status] || ''}">${i.status}</span>
          </div>
          <p class="text-xs text-on-surface-variant truncate mt-0.5">${esc(i.address) || ''} · ${esc(i.department) || ''}</p>
          <p class="text-sm font-bold text-secondary mt-0.5">₹${i.bounty || 0} bounty</p>
        </div>
        <div class="shrink-0">${action}</div>
      </div>`
  }

  async function load() {
    try {
      const { data } = await api.get('/jobs')
      $('c-earnings').textContent = '₹' + (data.earnings || 0)
      $('c-available').textContent = data.available.length
      $('c-active').textContent = data.mine.filter((j) => j.status !== 'Resolved').length
      $('c-done').textContent = data.mine.filter((j) => j.status === 'Resolved').length

      $('available-jobs').innerHTML = data.available.length
        ? data.available.map((i) => jobCard(i, false)).join('')
        : '<div class="text-center text-on-surface-variant py-8">No open jobs right now. Check back soon.</div>'
      $('my-jobs').innerHTML = data.mine.length
        ? data.mine.map((i) => jobCard(i, true)).join('')
        : '<div class="text-center text-on-surface-variant py-8">No jobs claimed yet — claim one above.</div>'

      document.querySelectorAll('.claim-btn').forEach((b) =>
        b.addEventListener('click', () => claim(b.dataset.id, b))
      )
      document.querySelectorAll('.proof-btn').forEach((b) =>
        b.addEventListener('click', () => openProof(b.dataset.id, b.dataset.title))
      )
    } catch (e) {
      if (e?.response?.status === 401) window.location.href = '/login'
    }
  }

  async function claim(id, btn) {
    btn.disabled = true
    try {
      await api.post(`/issues/${id}/claim`)
      toast('Job claimed — get to work!')
      load()
    } catch (e) {
      toast(e?.response?.data?.error || 'Could not claim', false)
      btn.disabled = false
    }
  }

  // --- Proof modal ---
  function downscale(file, maxDim = 1280, q = 0.72) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const im = new Image()
      im.onload = () => {
        let { width, height } = im
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim }
          else { width = Math.round((width * maxDim) / height); height = maxDim }
        }
        try {
          const cv = document.createElement('canvas'); cv.width = width; cv.height = height
          cv.getContext('2d').drawImage(im, 0, 0, width, height)
          URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', q))
        } catch (e) { URL.revokeObjectURL(url); resolve(null) }
      }
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      im.src = url
    })
  }

  function openProof(id, title) {
    currentJob = id
    proofDataUrl = proofBase64 = null
    proofMime = 'image/jpeg'
    $('proof-issue-id').textContent = '#' + id
    $('proof-issue-title').textContent = title
    $('proof-preview').classList.add('hidden')
    $('proof-placeholder').classList.remove('hidden')
    $('proof-verdict').classList.add('hidden')
    $('proof-submit').disabled = false
    $('proof-modal').classList.remove('hidden')
  }

  $('proof-zone').addEventListener('click', () => $('proof-input').click())
  $('proof-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const dataUrl = await downscale(file)
    if (!dataUrl) return toast('Could not read image', false)
    proofDataUrl = dataUrl
    proofBase64 = dataUrl.split(',')[1]
    $('proof-preview').src = dataUrl
    $('proof-preview').classList.remove('hidden')
    $('proof-placeholder').classList.add('hidden')
  })

  $('proof-cancel').addEventListener('click', () => $('proof-modal').classList.add('hidden'))

  $('proof-submit').addEventListener('click', async () => {
    if (!currentJob) return
    if (!proofBase64) return toast('Add an "after" photo first', false)
    const btn = $('proof-submit')
    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Gemini is verifying…'
    try {
      const { data } = await api.post(`/issues/${currentJob}/proof`, {
        after_photo: proofDataUrl, afterImageBase64: proofBase64, mimeType: proofMime,
      })
      const v = $('proof-verdict')
      v.classList.remove('hidden')
      if (data.resolved) {
        v.className = 'rounded-lg p-3 mb-3 text-sm bg-secondary-container text-on-secondary-container'
        v.innerHTML = `<b>✓ Fix verified (${data.confidence}%).</b> ₹${data.paid} released to you. ${esc(data.reason)}`
        toast(`Verified! ₹${data.paid} earned`)
        setTimeout(() => { $('proof-modal').classList.add('hidden'); load() }, 2200)
      } else {
        v.className = 'rounded-lg p-3 mb-3 text-sm bg-error-container text-on-error-container'
        v.innerHTML = `<b>Not confirmed (${data.confidence}%).</b> ${esc(data.reason)} Try a clearer "after" photo.`
        btn.disabled = false
        btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">verified</span> Submit for AI Verification'
      }
    } catch (e) {
      toast(e?.response?.data?.error || 'Verification failed', false)
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">verified</span> Submit for AI Verification'
    }
  })

  ;(async function init() {
    if (!(await guard())) return
    load()
    setInterval(load, 8000)
  })()
})()
