// Community leaderboard — top heroes by score, with reputation tiers.
(function () {
  const { api, esc } = window.CH
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`)

  function row(l) {
    const top = l.rank <= 3
    const avatar = l.photo_url
      ? `<img src="${l.photo_url}" class="w-10 h-10 rounded-full object-cover" referrerpolicy="no-referrer" alt="" />`
      : `<span class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center"><span class="material-symbols-outlined text-[20px]">person</span></span>`
    return `
      <div class="flex items-center gap-3 bg-surface-lowest border ${top ? 'border-primary' : 'border-outline-variant'} rounded-xl p-3">
        <span class="w-8 text-center font-bold ${top ? 'text-primary text-lg' : 'text-on-surface-variant'}">${medal(l.rank)}</span>
        ${avatar}
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-on-surface truncate">${esc(l.name)}</p>
          <p class="text-xs ${l.tier.color} font-bold flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">${l.tier.icon}</span>${l.tier.name}
            <span class="text-on-surface-variant font-normal">· ${l.reports} reports</span>
          </p>
        </div>
        <div class="text-right">
          <p class="font-bold text-on-surface">${l.score}</p>
          <p class="text-[10px] uppercase text-on-surface-variant">points</p>
        </div>
      </div>`
  }

  async function load() {
    try {
      const { data } = await api.get('/leaderboard')
      const el = document.getElementById('leaderboard-list')
      if (!data.leaders || !data.leaders.length) {
        el.innerHTML = '<div class="text-center text-on-surface-variant py-8">No heroes yet — be the first to report!</div>'
        return
      }
      el.innerHTML = data.leaders.map(row).join('')
    } catch (e) { console.error(e) }
  }

  load()
  setInterval(load, 10000)
})()
