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
              ${i.media_type === 'video' ? '<span class="material-symbols-outlined text-[16px] text-primary" title="Video report">videocam</span>' : ''}
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
    t.className = `tl-toast-in fixed bottom-24 left-1/2 -translate-x-1/2 z-[3000] px-4 py-2 rounded-full text-sm font-medium shadow-lg ${ok ? 'bg-secondary text-white' : 'bg-error text-white'}`
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2600)
  }
  // Best-effort current location for proof-of-presence verification.
  // Resolves to {lat, lng} or null (never rejects), with a short timeout.
  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      )
    })
  }
  // Wire up the staff logout button if present on the page.
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn')
    if (btn) {
      btn.addEventListener('click', async () => {
        try { await api.post('/auth/logout') } catch (e) {}
        window.location.href = '/login'
      })
    }
  })

  // Reflect the Firebase citizen auth state in the TopBar (avatar dropdown vs. login buttons).
  function updateCitizenChip(user) {
    const chip = document.getElementById('citizen-auth-chip')
    const out = document.getElementById('citizen-auth-out')
    if (!chip && !out) return
    if (user) {
      if (chip) { chip.classList.remove('hidden'); chip.classList.add('block') }
      if (out) out.classList.add('hidden')
      const display = user.displayName || (user.email ? user.email.split('@')[0] : 'You')
      const first = display.split(/[\s@.]+/)[0] || display
      const nameEl = document.getElementById('citizen-name')
      if (nameEl) nameEl.textContent = first
      const av = document.getElementById('citizen-avatar')
      if (av) {
        if (user.photoURL) av.innerHTML = `<img src="${user.photoURL}" class="w-full h-full object-cover" alt="" referrerpolicy="no-referrer" />`
        else av.textContent = (first[0] || 'U').toUpperCase()
      }
    } else {
      if (chip) { chip.classList.add('hidden'); chip.classList.remove('block') }
      if (out) out.classList.remove('hidden')
    }
  }
  document.addEventListener('ch-auth-changed', (e) => updateCitizenChip(e.detail && e.detail.user))

  // TopBar avatar dropdown + active nav link highlight.
  document.addEventListener('DOMContentLoaded', () => {
    // Active nav link (Home · Map · Leaderboard)
    const path = window.location.pathname
    document.querySelectorAll('.tl-nav-link[data-path]').forEach((a) => {
      if (a.getAttribute('data-path') === path) a.classList.add('active')
    })
    // Avatar dropdown toggle
    const menuBtn = document.getElementById('citizen-menu-btn')
    const menu = document.getElementById('citizen-menu')
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden') })
      document.addEventListener('click', () => menu.classList.add('hidden'))
      menu.addEventListener('click', (e) => e.stopPropagation())
    }
    // Log Out from the dropdown (Firebase citizen sign-out)
    const navLogout = document.getElementById('nav-logout')
    if (navLogout) {
      navLogout.addEventListener('click', async () => {
        try { if (window.CHAuth && window.CHAuth.signOut) await window.CHAuth.signOut() } catch (e) {}
        window.location.href = '/home'
      })
    }
  })

  // Scroll-reveal: gently animate page sections into view (respects reduced-motion).
  function initReveal() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = document.querySelectorAll('main > *')
    if (!targets.length || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('tl-in')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' })
    targets.forEach((el, i) => {
      el.classList.add('tl-reveal')
      el.style.animationDelay = Math.min(i, 8) * 55 + 'ms'
      io.observe(el)
    })
  }
  document.addEventListener('DOMContentLoaded', initReveal)

  return { api, CAT_ICON, STATUS_COLOR, severityBadge, timeAgo, esc, issueCard, toast, getLocation }
})()
