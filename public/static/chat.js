// TrustLens Assistant — floating AI chatbot widget (Gemini-powered).
// Self-injects on every page. Talks to POST /api/chat.
(function () {
  function boot() {
    if (!window.CH || !window.CH.api) {
      // common.js not ready yet
      return setTimeout(boot, 100)
    }
    if (document.getElementById('ch-chat-fab')) return // already injected
    const { api, esc } = window.CH

    const history = [] // {role, content}
    let open = false
    let busy = false

    // --- inject DOM ---
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <button id="ch-chat-fab" aria-label="Open TrustLens Assistant"
        class="fixed right-4 bottom-[92px] md:bottom-6 z-[2500] w-14 h-14 rounded-full bg-primary text-on-primary shadow-lg flex items-center justify-center active:scale-95 transition">
        <span class="material-symbols-outlined text-[28px]">forum</span>
      </button>

      <div id="ch-chat-panel"
        class="hidden fixed right-4 bottom-[92px] md:bottom-6 z-[2500] w-[calc(100vw-2rem)] max-w-[380px] h-[70vh] max-h-[560px] bg-surface-lowest border border-outline-variant rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div class="bg-primary text-on-primary px-4 py-3 flex items-center gap-2 shrink-0">
          <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">smart_toy</span>
          <div class="leading-tight">
            <p class="font-bold text-sm">TrustLens Assistant</p>
            <p class="text-[11px] opacity-80">AI civic helper · powered by Gemini</p>
          </div>
          <button id="ch-chat-close" class="ml-auto w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div id="ch-chat-log" class="flex-1 overflow-y-auto p-3 space-y-3 bg-surface-container-low"></div>

        <div class="p-2 border-t border-outline-variant bg-surface-lowest shrink-0">
          <div id="ch-chat-chips" class="flex gap-1.5 mb-2 overflow-x-auto"></div>
          <form id="ch-chat-form" class="flex items-center gap-2">
            <input id="ch-chat-input" type="text" autocomplete="off" placeholder="Ask about reporting…"
              class="flex-1 bg-surface-container-low border-0 rounded-full px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary" />
            <button type="submit" id="ch-chat-send"
              class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 active:scale-95 transition">
              <span class="material-symbols-outlined text-[20px]">send</span>
            </button>
          </form>
        </div>
      </div>`
    document.body.appendChild(wrap)

    const fab = document.getElementById('ch-chat-fab')
    const panel = document.getElementById('ch-chat-panel')
    const log = document.getElementById('ch-chat-log')
    const form = document.getElementById('ch-chat-form')
    const input = document.getElementById('ch-chat-input')
    const chips = document.getElementById('ch-chat-chips')

    function bubble(role, html, opts) {
      opts = opts || {}
      const mine = role === 'user'
      const el = document.createElement('div')
      el.className = 'flex ' + (mine ? 'justify-end' : 'justify-start')
      el.innerHTML = `<div class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
        mine ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-lowest border border-outline-variant text-on-surface rounded-bl-sm'
      }">${html}</div>`
      if (opts.id) el.id = opts.id
      log.appendChild(el)
      log.scrollTop = log.scrollHeight
      return el
    }

    function typing() {
      const el = document.createElement('div')
      el.id = 'ch-typing'
      el.className = 'flex justify-start'
      el.innerHTML = `<div class="bg-surface-lowest border border-outline-variant rounded-2xl rounded-bl-sm px-3.5 py-2.5">
        <div class="flex gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-bounce" style="animation-delay:0ms"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-bounce" style="animation-delay:150ms"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-bounce" style="animation-delay:300ms"></span>
        </div></div>`
      log.appendChild(el)
      log.scrollTop = log.scrollHeight
    }
    function clearTyping() {
      const el = document.getElementById('ch-typing')
      if (el) el.remove()
    }

    const SUGGESTIONS = ['How do I report a pothole?', 'How does verification work?', 'How do I earn points?']
    function renderChips() {
      chips.innerHTML = SUGGESTIONS.map(
        (s) => `<button data-q="${esc(s)}" class="ch-chip whitespace-nowrap text-xs px-3 py-1.5 rounded-full bg-primary-fixed text-primary font-medium shrink-0">${esc(s)}</button>`
      ).join('')
      chips.querySelectorAll('.ch-chip').forEach((b) =>
        b.addEventListener('click', () => { input.value = b.dataset.q; send() })
      )
    }

    async function send() {
      const text = input.value.trim()
      if (!text || busy) return
      input.value = ''
      busy = true
      bubble('user', esc(text))
      history.push({ role: 'user', content: text })
      typing()
      try {
        const { data } = await api.post('/chat', { messages: history.slice(-6) })
        clearTyping()
        bubble('assistant', esc(data.reply))
        history.push({ role: 'assistant', content: data.reply })
      } catch (e) {
        clearTyping()
        bubble('assistant', 'Sorry, I had trouble responding. Please try again in a moment.')
      } finally {
        busy = false
        input.focus()
      }
    }

    function greet() {
      if (log.childElementCount) return
      bubble('assistant', "Hi! I'm <b>TrustLens Assistant</b>. I can help you report a civic issue, verify reports, earn community points, or track an issue's status. How can I help?")
    }

    fab.addEventListener('click', () => {
      open = !open
      panel.classList.toggle('hidden', !open)
      fab.classList.toggle('hidden', open)
      if (open) { renderChips(); greet(); setTimeout(() => input.focus(), 50) }
    })
    document.getElementById('ch-chat-close').addEventListener('click', () => {
      open = false
      panel.classList.add('hidden')
      fab.classList.remove('hidden')
    })
    form.addEventListener('submit', (e) => { e.preventDefault(); send() })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
