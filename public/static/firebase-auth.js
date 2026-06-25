// Firebase citizen authentication for Community Hero AI.
// Loaded as a module. Initializes Firebase, exposes window.CHAuth, and wires
// the Firebase ID token into every axios /api request (Authorization: Bearer).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'

const app = initializeApp(window.FIREBASE_CONFIG)
const auth = getAuth(app)
auth.useDeviceLanguage()
const googleProvider = new GoogleAuthProvider()

// --- Token plumbing: attach the current Firebase ID token to all /api calls ---
let currentUser = null
const readyWaiters = []
let resolvedOnce = false

function notifyReady(user) {
  currentUser = user
  if (!resolvedOnce) {
    resolvedOnce = true
    readyWaiters.splice(0).forEach((fn) => fn(user))
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user
  notifyReady(user)
  document.dispatchEvent(new CustomEvent('ch-auth-changed', { detail: { user } }))
})

// axios interceptor — adds a fresh ID token to every API request when signed in.
if (window.axios) {
  window.axios.interceptors.request.use(async (config) => {
    const url = config.url || ''
    const isApi = (config.baseURL || '').includes('/api') || url.startsWith('/api')
    if (isApi && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken()
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
      } catch (e) { /* ignore — request proceeds unauthenticated */ }
    }
    return config
  })
}

const CHAuth = {
  auth,
  // Resolves with the Firebase user (or null) once the initial auth state is known.
  ready() {
    return new Promise((resolve) => {
      if (resolvedOnce) return resolve(currentUser)
      readyWaiters.push(resolve)
    })
  },
  getUser() {
    return auth.currentUser
  },
  async getToken() {
    return auth.currentUser ? auth.currentUser.getIdToken() : null
  },
  async signInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    return cred.user
  },
  async signInWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return cred.user
  },
  async registerWithEmail(name, email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name) await updateProfile(cred.user, { displayName: name })
    return cred.user
  },
  async signOut() {
    await signOut(auth)
  },
  onChange(cb) {
    return onAuthStateChanged(auth, cb)
  },
}

window.CHAuth = CHAuth
document.dispatchEvent(new CustomEvent('ch-firebase-ready'))
