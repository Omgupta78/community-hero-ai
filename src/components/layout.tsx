// Shared layout components: TopBar and BottomNav

export const TopBar = ({ title, admin, authority }: { title?: string; admin?: boolean; authority?: boolean }) => {
  const staff = admin || authority
  return (
    <header class="fixed top-0 left-0 right-0 z-[1000] bg-surface-lowest/90 backdrop-blur border-b border-outline-variant">
      <div class="max-w-5xl mx-auto h-[64px] flex items-center gap-3 px-container-margin">
        <a href="/" class="flex items-center gap-2 text-primary shrink-0">
          <img src="/static/logo.svg" alt="TrustLens AI" class="w-7 h-7" />
          {!title && <span class="font-bold text-[18px] text-on-surface hidden sm:block">TrustLens AI</span>}
        </a>
        {title ? (
          <h1 class="font-bold text-[18px] text-on-surface truncate">{title}</h1>
        ) : (
          <span class="font-bold text-[18px] text-on-surface sm:hidden">TrustLens AI</span>
        )}
        <div class="ml-auto flex items-center gap-1">
          {staff ? (
            <>
              <a href="/" class="text-xs font-bold text-primary px-3 py-1.5 rounded-full hover:bg-surface-container flex items-center gap-1">
                <span class="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span class="hidden sm:inline">Switch Role</span>
              </a>
              <a href="/home" class="text-xs font-bold text-primary px-3 py-1.5 rounded-full hover:bg-surface-container flex items-center gap-1">
                <span class="material-symbols-outlined text-[18px]">public</span>
                <span class="hidden sm:inline">Citizen View</span>
              </a>
              <button id="logout-btn" class="text-xs font-bold text-error px-3 py-1.5 rounded-full hover:bg-error-container flex items-center gap-1">
                <span class="material-symbols-outlined text-[18px]">logout</span>
                <span class="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              {/* Notifications bell — citizen status updates */}
              <button id="notif-btn" aria-label="Notifications" class="relative w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[22px]">notifications</span>
                <span id="notif-badge" class="hidden absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">0</span>
              </button>
              {/* Citizen auth chip — updated client-side by Firebase auth state */}
              <a href="/profile" id="citizen-auth-chip" class="hidden items-center gap-1 px-2 py-1 rounded-full hover:bg-surface-container">
                <span id="citizen-avatar" class="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center overflow-hidden">
                  <span class="material-symbols-outlined text-[18px]">person</span>
                </span>
                <span id="citizen-name" class="text-xs font-bold text-on-surface hidden sm:inline max-w-[100px] truncate"></span>
              </a>
              {/* Single, clear way to reach the other portals */}
              <a href="/" class="text-xs font-bold text-primary px-3 py-1.5 rounded-full hover:bg-surface-container flex items-center gap-1" title="Switch role">
                <span class="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span class="hidden sm:inline">Switch Role</span>
              </a>
            </>
          )}
          <span id="live-dot" class="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary px-2">
            <span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span> Live
          </span>
        </div>
      </div>
    </header>
  )
}

const navItems = [
  { key: 'home', href: '/home', icon: 'home', label: 'Home' },
  { key: 'map', href: '/map', icon: 'map', label: 'Map' },
  { key: 'report', href: '/report', icon: 'add_circle', label: 'Report' },
  { key: 'myreports', href: '/my-reports', icon: 'fact_check', label: 'My Reports' },
  { key: 'profile', href: '/profile', icon: 'person', label: 'Profile' },
]

export const BottomNav = ({ active }: { active: string }) => {
  return (
    <nav class="fixed bottom-0 left-0 right-0 z-[1000] bg-surface-lowest border-t border-outline-variant">
      <div class="max-w-2xl mx-auto grid grid-cols-5 h-[72px]">
        {navItems.map((item) => {
          const isActive = item.key === active
          const isReport = item.key === 'report'
          if (isReport) {
            return (
              <a href={item.href} class="flex flex-col items-center justify-center gap-0.5">
                <span class="w-12 h-12 -mt-4 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg">
                  <span class="material-symbols-outlined text-[28px]">add</span>
                </span>
                <span class="text-[10px] font-medium text-primary">{item.label}</span>
              </a>
            )
          }
          return (
            <a
              href={item.href}
              class={`flex flex-col items-center justify-center gap-0.5 ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <span class="material-symbols-outlined text-[24px]" style={isActive ? "font-variation-settings: 'FILL' 1;" : ''}>
                {item.icon}
              </span>
              <span class="text-[10px] font-medium">{item.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
