// Profile page — Firebase citizen auth + real user data + my reports
(function () {
  const { api, issueCard, toast } = window.CH

  const $ = (id) => document.getElementById(id)
  let pollTimer = null

  function showError(msg) {
    const el = $('auth-error')
    el.textContent = msg
    el.classList.remove('hidden')
  }
  function clearError() {
    $('auth-error').classList.add('hidden')
  }

  async function loadProfile() {
    try {
      const { data: me } = await api.get('/me')
      $('p-name').textContent = me.name || 'Citizen'
      $('p-email').textContent = me.email || ''
      $('p-score').textContent = me.score ?? 0
      $('p-reports').textContent = me.reports ?? 0

      // avatar
      const avatar = $('p-avatar')
      if (me.photo_url) {
        avatar.innerHTML = `<img src="${me.photo_url}" class="w-full h-full object-cover" alt="" referrerpolicy="no-referrer" />`
      }

      const { data } = await api.get('/issues', { params: { mine: 'true' } })
      const el = $('my-reports')
      if (!data.issues.length) {
        el.innerHTML = '<div class="text-center text-on-surface-variant py-8">You haven\'t reported anything yet.</div>'
      } else {
        el.innerHTML = data.issues.map(issueCard).join('')
      }
    } catch (e) { console.error(e) }
  }

  function renderSignedIn(user) {
    $('signed-out').classList.add('hidden')
    $('signed-in').classList.remove('hidden')
    loadProfile()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(loadProfile, 10000)
  }

  function renderSignedOut() {
    $('signed-in').classList.add('hidden')
    $('signed-out').classList.remove('hidden')
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function wireButtons() {
    $('google-signin').addEventListener('click', async () => {
      clearError()
      try {
        await window.CHAuth.signInWithGoogle()
        toast('Signed in successfully')
      } catch (e) {
        showError(e.message || 'Google sign-in failed')
      }
    })

    $('email-signin').addEventListener('click', async (ev) => {
      ev.preventDefault()
      clearError()
      const email = $('email-input').value.trim()
      const password = $('password-input').value
      if (!email || !password) return showError('Email and password are required')
      try {
        await window.CHAuth.signInWithEmail(email, password)
        toast('Welcome back!')
      } catch (e) {
        showError(friendly(e))
      }
    })

    $('email-register').addEventListener('click', async () => {
      clearError()
      const name = $('reg-name').value.trim()
      const email = $('email-input').value.trim()
      const password = $('password-input').value
      if (!email || !password) return showError('Email and password are required')
      if (password.length < 6) return showError('Password must be at least 6 characters')
      try {
        await window.CHAuth.registerWithEmail(name, email, password)
        toast('Account created!')
      } catch (e) {
        showError(friendly(e))
      }
    })

    $('firebase-signout').addEventListener('click', async () => {
      try { await window.CHAuth.signOut() } catch (e) {}
      toast('Signed out')
    })
  }

  function friendly(e) {
    const code = (e && e.code) || ''
    const map = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/wrong-password': 'Invalid email or password.',
      'auth/user-not-found': 'No account found — try Sign Up.',
      'auth/email-already-in-use': 'That email is already registered — try Sign In.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    }
    return map[code] || (e && e.message) || 'Authentication error'
  }

  function init() {
    if (!window.CHAuth) {
      // firebase-auth.js (module) may not have finished loading yet
      document.addEventListener('ch-firebase-ready', init, { once: true })
      return
    }
    wireButtons()
    window.CHAuth.onChange((user) => {
      if (user) renderSignedIn(user)
      else renderSignedOut()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
