// My Reports — the citizen's own reports with a live status tracker.
(function () {
  if (!window.CH) return
  const { api, esc, timeAgo, CAT_ICON } = window.CH
  const $ = (id) => document.getElementById(id)
  let reports = []
  let filter = 'all'

  const STAGES = ['Reported', 'Verified', 'Assigned', 'In Progress', 'Resolved']
  function stageIndex(status) {
    const i = STAGES.indexOf(status)
    return i < 0 ? 0 : i
  }

  function tracker(status) {
    const cur = stageIndex(status)
    return `<div class="mr-track">${STAGES.map((s, k) => {
      const done = k <= cur
      const active = k === cur && status !== 'Resolved'
      return `<div class="mr-step ${done ? 'done' : ''} ${active ? 'cur' : ''}"><i></i><span>${s === 'In Progress' ? 'Fixing' : s}</span></div>`
    }).join('')}</div>`
  }

  function card(i) {
    const resolved = i.status === 'Resolved'
    const thumb = i.photo_data
      ? `<img src="${i.photo_data}" class="mr-thumb" alt="" />`
      : `<div class="mr-thumb mr-thumb-ph"><span class="material-symbols-outlined">${CAT_ICON[i.category] || 'place'}</span></div>`
    return `<a href="/issue/${i.id}" class="mr-card ${resolved ? 'mr-card-done' : ''}">
      <div class="mr-card-top">
        ${thumb}
        <div class="mr-card-main">
          <div class="mr-card-title">${esc(i.title)}</div>
          <div class="mr-card-meta">${esc(i.category)} · ${esc(i.address || '')} · ${timeAgo(i.created_at)}</div>
        </div>
        <span class="mr-badge ${resolved ? 'done' : ''}">${esc(i.status)}</span>
      </div>
      ${tracker(i.status)}
    </a>`
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
