// Notification panel — status updates on the citizen's own reports.
// Bell lives in the TopBar (citizen view). Unread state is tracked client-side
// via the newest update timestamp the user has already seen.
(function () {
  function boot() {
    const btn = document.getElementById('notif-btn')
    if (!btn) return // staff pages have no bell
    if (!window.CH || !window.CH.api) return setTimeout(boot, 150)
    const { api, STATUS_COLOR, timeAgo, esc } = window.CH
    const SEEN_KEY = 'ch_notif_seen'

    // Panel
    const panel = document.createElement('div')
    panel.id = 'notif-panel'
    panel.className =
      'hidden fixed right-3 top-[60px] z-[2400] w-[calc(100vw-1.5rem)] max-w-[360px] max-h-[70vh] overflow-y-auto bg-surface-lowest border border-outline-variant rounded-xl shadow-2xl'
    document.body.appendChild(panel)

    let items = []
    let open = false

    const STATUS_ICON = {
      Reported: 'flag', Verified: 'verified', Assigned: 'assignment_ind',
      'In Progress': 'engineering', Resolved: 'task_alt',
    }

    function lastSeen() { return localStorage.getItem(SEEN_KEY) || '' }
    function newest() { return items.length ? items[0].created_at : '' }
    function unreadCount() { const s = lastSeen(); return items.filter((n) => (n.created_at || '') > s).length }

    function renderBadge() {
      const badge = document.getElementById('notif-badge')
      if (!badge) return
      const n = unreadCount()
      if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.classList.remove('hidden') }
      else badge.classList.add('hidden')
    }

    function renderPanel() {
      const seen = lastSeen()
      const header = `<div class="sticky top-0 bg-surface-lowest border-b border-outline-variant px-4 py-3 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">notifications</span>
        <h3 class="font-bold text-sm text-on-surface">Your report updates</h3>
        <button id="notif-clear" class="ml-auto text-xs font-bold text-primary hover:underline">Mark all read</button>
      </div>`
      if (!items.length) {
        panel.innerHTML = header + '<div class="text-center text-on-surface-variant py-10 text-sm">No updates yet. Report an issue to start tracking it here.</div>'
      } else {
        panel.innerHTML = header + '<div>' + items.map((n) => {
          const isNew = (n.created_at || '') > seen
          return `<a href="/issue/${n.issue_id}" class="flex gap-3 px-4 py-3 border-b border-outline-variant/60 hover:bg-surface-container-low ${isNew ? 'bg-primary-fixed/40' : ''}">
            <span class="w-8 h-8 rounded-full ${STATUS_COLOR[n.status] || 'bg-surface-container text-on-surface'} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[18px]">${STATUS_ICON[n.status] || 'campaign'}</span>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-on-surface"><span class="font-bold">${esc(n.status)}</span> · <span class="text-on-surface-variant">${esc(n.title)}</span></p>
              <p class="text-xs text-on-surface-variant truncate">${esc(n.message) || ''}</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">${esc(n.author)} · ${timeAgo(n.created_at)}</p>
            </div>
            ${isNew ? '<span class="w-2 h-2 rounded-full bg-primary shrink-0 mt-1"></span>' : ''}
          </a>`
        }).join('') + '</div>'
      }
      const clear = document.getElementById('notif-clear')
      if (clear) clear.addEventListener('click', (e) => { e.preventDefault(); markRead() })
    }

    function markRead() { if (newest()) localStorage.setItem(SEEN_KEY, newest()); renderBadge(); renderPanel() }

    async function load() {
      try {
        const { data } = await api.get('/notifications')
        items = data.notifications || []
        renderBadge()
        if (open) renderPanel()
      } catch (e) { /* ignore */ }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      open = !open
      panel.classList.toggle('hidden', !open)
      if (open) { renderPanel(); markRead() }
    })
    document.addEventListener('click', (e) => {
      if (open && !panel.contains(e.target) && !btn.contains(e.target)) { open = false; panel.classList.add('hidden') }
    })

    load()
    setInterval(load, 15000) // refresh badge in near real-time
    document.addEventListener('ch-auth-changed', load) // reload when sign-in state changes
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
