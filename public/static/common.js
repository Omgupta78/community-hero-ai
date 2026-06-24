// Shared helpers across all pages
window.CH = (function () {
  const api = axios.create({ baseURL: '/api' })

  const CAT_ICON = {
    Pothole: 'dangerous',
    'Illegal Dumping': 'delete',
    Streetlight: 'lightbulb',
    'Water Leak': 'water_drop',
    Graffiti: 'format_paint',
    Other: 'help',
  }
  const STATUS_COLOR = {
    Reported: 'bg-tertiary-fixed text-on-tertiary-fixed',
    Verified: 'bg-primary-fixed text-primary',
    Assigned: 'bg-secondary-container text-on-secondary-container',
    'In Progress': 'bg-secondary-container text-on-secondary-container',
    Resolved: 'bg-secondary text-white',
  }
  function severityBadge(sev) {
    const map = {
      5: ['bg-error text-white', 'Critical'],
      4: ['bg-error-container text-on-error-container', 'High'],
      3: ['bg-tertiary-fixed text-on-tertiary-fixed', 'Medium'],
      2: ['bg-surface-container text-on-surface', 'Low'],
      1: ['bg-surface-container text-on-surface', 'Minor'],
    }
    return map[sev] || map[3]
  }
  function timeAgo(ts) {
    if (!ts) return ''
    const d = new Date(ts.replace(' ', 'T') + 'Z')
    const s = Math.floor((Date.now() - d.getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return Math.floor(s / 60) + 'm ago'
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'
    return Math.floor(s / 86400) + 'd ago'
  }
  function esc(s) {
    return (s || '').toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
  }
  function issueCard(i) {
    const [scls, slabel] = severityBadge(i.severity)
    return `
      <a href="/issue/${i.id}" class="block bg-surface-lowest border border-outline-variant rounded-xl p-md hover:border-primary transition">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-primary">${CAT_ICON[i.category] || 'place'}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-semibold text-on-surface truncate">${esc(i.title)}</h4>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span>
            </div>
            <p class="text-xs text-on-surface-variant truncate mt-0.5">${esc(i.address) || 'Unknown location'}</p>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status] || ''}">${i.status}</span>
              <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">verified</span>${i.verify_count || 0}</span>
              <span class="text-xs text-on-surface-variant ml-auto">${timeAgo(i.created_at)}</span>
            </div>
          </div>
        </div>
      </a>`
  }
  function toast(msg, ok = true) {
    const t = document.createElement('div')
    t.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[3000] px-4 py-2 rounded-full text-sm font-medium shadow-lg ${ok ? 'bg-secondary text-white' : 'bg-error text-white'}`
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2600)
  }
  return { api, CAT_ICON, STATUS_COLOR, severityBadge, timeAgo, esc, issueCard, toast }
})()
