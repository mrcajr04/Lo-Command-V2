import './styles/theme.css';
import { createHeader } from './shell/header.js';
import { createSidebar } from './shell/sidebar.js';
import { createWidgetDeck } from './shell/widgetDeck.js';
import { createVaultModule } from './vault/vault.js';
import { deriveKey, encryptData, decryptData, generateSalt } from './vault/crypto.js';
import { hasVaultData, getVaultSalt, getVaultIv, getVaultCiphertext, saveVaultData, getVaultPreferences, saveVaultPreferences } from './vault/storage.js';
import { createContactsModule } from './contacts/contacts.js';
import { initializeIfEmpty, loadContacts, saveContacts, exportToJSON, importFromJSON, migrateContacts } from './contacts/storage.js';
import { getItem, setItem } from './shared/storage.js';
import { supabase } from './lib/supabase.js';

// Favicon URL cache — keyed by link ID, stores the first candidate URL that loaded successfully
const faviconCache = new Map();

// Application State
let activeTab = null; // null represents the default "Central Application Canvas" empty state
let activeModule = null; // tracks mounted module instance for cleanup
let universalResults = [];
let universalActiveIndex = 0;
let universalSearchOpen = false;
let activeSettingsSection = 'account';
let activeLinksCategory = 'communications';
let sidebarCollapsed = getItem('lo_command_sidebar_collapsed', false);
const WORKSPACE_PROFILE_KEY = 'lo_command_workspace_profile';
const AUTH_SESSION_KEY = 'lo_command_auth_session';

const app = document.getElementById('app');
const DEFAULT_WORKSPACE_PROFILE = {
  companyName: 'LO COMMAND',
  companySubtitle: 'MLO Command Center',
  nmlsNumber: '',
  companyLogo: '',
  fullName: 'Arthur M.',
  roleTitle: 'Underwriter',
  profilePhoto: '',
};
const toastContainer = document.createElement('div');
toastContainer.className = 'fixed right-6 top-6 z-[160] flex flex-col gap-3 pointer-events-none';
app.appendChild(toastContainer);

// Create static components
initializeIfEmpty();
const header = createHeader();
applyHeaderProfile();
const widgetDeck = createWidgetDeck();
const globalSearchShell = header.querySelector('#global-search-shell');
const globalSearchInput = header.querySelector('#global-search');
const globalSearchPanel = header.querySelector('#global-search-panel');
const globalSearchResults = header.querySelector('#global-search-results');
const globalSearchEmpty = header.querySelector('#global-search-empty');
const headerSettingsBtn = header.querySelector('#header-settings-btn');
const headerAccountTrigger = header.querySelector('#header-account-trigger');
const headerAccountMenu = header.querySelector('#header-account-menu');
const defaultGlobalSearchPlaceholder = globalSearchInput?.getAttribute('placeholder') || 'Search contacts, modules, and actions';
const WORKSPACE_LINKS_KEY = 'lo_command_workspace_links';
const WORKSPACE_LINK_CATEGORIES_KEY = 'lo_command_workspace_link_categories';
const UNASSIGNED_LINK_CATEGORY = 'unassigned';
const UNASSIGNED_LINK_CATEGORY_LABEL = 'Unassigned';
const DEFAULT_WORKSPACE_LINKS = [
  { id: 'lnk-1', name: 'Microsoft Teams', url: 'https://teams.microsoft.com', category: 'communications', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-2', name: 'Zoom', url: 'https://zoom.us/start/videomeeting', category: 'communications', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-3', name: 'Google Meet', url: 'https://meet.google.com', category: 'communications', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-4', name: 'WhatsApp', url: 'https://web.whatsapp.com', category: 'communications', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-5', name: 'Contacts', url: 'https://outlook.office365.com/people', category: 'mlg-platforms', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-6', name: 'Netflix', url: 'https://www.netflix.com', category: 'productivity', altFaviconDomain: '', bookmarked: true },
  { id: 'lnk-7', name: 'Encompass', url: 'https://encompass.elliemae.com', category: 'mortgage-tech', altFaviconDomain: '', bookmarked: false },
  { id: 'lnk-8', name: 'Optimal Blue', url: 'https://optimalblue.com/login', category: 'mortgage-tech', altFaviconDomain: '', bookmarked: false },
  { id: 'lnk-9', name: 'LenderHomepage', url: 'https://app.lenderhomepage.com', category: 'lender-portals', altFaviconDomain: '', bookmarked: false },
];
const DEFAULT_LINK_CATEGORIES = [
  { key: 'communications', label: 'Communications' },
  { key: 'mlg-platforms', label: 'MLG Platforms' },
  { key: 'mortgage-tech', label: 'Mortgage Tech' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'lender-portals', label: 'Lender Portals' },
];

function isUnassignedLinkCategory(categoryKey) {
  return categoryKey === UNASSIGNED_LINK_CATEGORY;
}

function getSystemLinkCategory() {
  return { key: UNASSIGNED_LINK_CATEGORY, label: UNASSIGNED_LINK_CATEGORY_LABEL };
}

function loadWorkspaceLinks() {
  const links = getItem(WORKSPACE_LINKS_KEY, null);
  if (links === null) {
    setItem(WORKSPACE_LINKS_KEY, DEFAULT_WORKSPACE_LINKS);
    return DEFAULT_WORKSPACE_LINKS.slice();
  }
  return Array.isArray(links)
    ? links.map((link) => ({
      ...link,
      altFaviconDomain: link.altFaviconDomain || '',
      bookmarked: Boolean(link.bookmarked),
      category: slugifyCategoryKey(link.category || '') || UNASSIGNED_LINK_CATEGORY,
    }))
    : DEFAULT_WORKSPACE_LINKS.slice();
}

function saveWorkspaceLinks(links) {
  setItem(WORKSPACE_LINKS_KEY, links);
}

function slugifyCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadLinkCategories() {
  const saved = getItem(WORKSPACE_LINK_CATEGORIES_KEY, null);
  if (!Array.isArray(saved) || saved.length === 0) {
    setItem(WORKSPACE_LINK_CATEGORIES_KEY, DEFAULT_LINK_CATEGORIES);
    return DEFAULT_LINK_CATEGORIES.slice();
  }

  const normalized = saved
    .map((category) => ({
      key: slugifyCategoryKey(category?.key || category?.label || ''),
      label: String(category?.label || '').trim(),
    }))
    .filter((category) => category.key && category.label && !isUnassignedLinkCategory(category.key));

  return normalized.length ? normalized : DEFAULT_LINK_CATEGORIES.slice();
}

function getSettingsLinkCategories(links = loadWorkspaceLinks()) {
  const categories = loadLinkCategories().filter((category) => !isUnassignedLinkCategory(category.key));
  const hasUnassignedLinks = links.some((link) => isUnassignedLinkCategory(link.category));
  return hasUnassignedLinks ? [...categories, getSystemLinkCategory()] : categories;
}

function getAssignableLinkCategories() {
  return loadLinkCategories().filter((category) => !isUnassignedLinkCategory(category.key));
}

function saveLinkCategories(categories) {
  setItem(WORKSPACE_LINK_CATEGORIES_KEY, categories);
}

function loadWorkspaceProfile() {
  const saved = getItem(WORKSPACE_PROFILE_KEY, null);
  const profile = { ...DEFAULT_WORKSPACE_PROFILE, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (profile.companySubtitle === 'Mortgage Loan Officer Command Center') {
    profile.companySubtitle = DEFAULT_WORKSPACE_PROFILE.companySubtitle;
  }
  return profile;
}

function saveWorkspaceProfile(profile) {
  setItem(WORKSPACE_PROFILE_KEY, profile);
}

function isAuthenticated() {
  return Boolean(sessionStorage.getItem(AUTH_SESSION_KEY));
}

function setAuthenticated(token) {
  if (token) {
    sessionStorage.setItem(AUTH_SESSION_KEY, token);
  } else {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
  }
}

function getInitials(value, fallback = 'M') {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('') || fallback;
}

function normalizeLinkUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getFaviconCandidatesFromDomain(value) {
  const normalized = normalizeLinkUrl(value);
  if (!normalized) return [];
  try {
    const parsed = new URL(normalized);
    return [
      `${parsed.origin}/favicon.ico`,
      `${parsed.origin}/apple-touch-icon.png`,
      `${parsed.origin}/apple-touch-icon-precomposed.png`,
      `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`,
    ];
  } catch {
    return [];
  }
}

function getLinkFaviconCandidates(url, altFaviconDomain = '') {
  return [
    ...getFaviconCandidatesFromDomain(altFaviconDomain),
    ...getFaviconCandidatesFromDomain(url),
  ];
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>'"]/g, (token) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[token] || token));
}

function getFallbackFaviconDataUri() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <rect width="40" height="40" rx="10" fill="#eef4fb"/>
      <path d="M20 8c-5.9 0-10.8 4.6-11.2 10.5h4.2A7.1 7.1 0 0 1 20 12.9c2 0 3.9.8 5.2 2.2l-2.1 2.1H31V9.3l-2.7 2.7A11.1 11.1 0 0 0 20 8Zm-11 13A11.1 11.1 0 0 0 20 32c5.9 0 10.8-4.6 11.2-10.5H27A7.1 7.1 0 0 1 20 27.1a7.1 7.1 0 0 1-5.2-2.2l2.1-2.1H9V30.7l2.7-2.7A11.1 11.1 0 0 0 20 32" fill="#5f7898"/>
    </svg>
  `);
}

function applyFaviconToImage(imgEl, url, altFaviconDomain = '', cacheKey = null) {
  if (!imgEl) return;
  if (cacheKey && faviconCache.has(cacheKey)) {
    imgEl.src = faviconCache.get(cacheKey);
    return;
  }
  const candidates = getLinkFaviconCandidates(url, altFaviconDomain);
  const fallbackSrc = getFallbackFaviconDataUri();

  if (candidates.length === 0) {
    imgEl.src = fallbackSrc;
    return;
  }

  let candidateIndex = 0;
  imgEl.onerror = () => {
    candidateIndex += 1;
    if (candidateIndex < candidates.length) {
      imgEl.src = candidates[candidateIndex];
      return;
    }
    imgEl.onerror = null;
    imgEl.src = fallbackSrc;
  };
  imgEl.onload = () => {
    if (cacheKey) faviconCache.set(cacheKey, imgEl.src);
    imgEl.onload = null;
  };
  imgEl.src = candidates[candidateIndex];
}

function applyHeaderProfile(profile = loadWorkspaceProfile()) {
  const companyNameEl = header.querySelector('#header-company-name');
  const companySubtitleEl = header.querySelector('#header-company-subtitle');
  const brandInitialsEl = header.querySelector('#header-brand-initials');
  const brandLogoEl = header.querySelector('#header-brand-logo');
  const userNameEl = header.querySelector('#header-user-name');
  const userRoleEl = header.querySelector('#header-user-role');
  const userInitialsEl = header.querySelector('#header-user-initials');
  const userPhotoEl = header.querySelector('#header-user-photo');

  const companyName = profile.companyName?.trim() || DEFAULT_WORKSPACE_PROFILE.companyName;
  const subtitleBase = profile.companySubtitle?.trim() || DEFAULT_WORKSPACE_PROFILE.companySubtitle;
  const nmlsNumber = profile.nmlsNumber?.trim();
  const fullName = profile.fullName?.trim() || DEFAULT_WORKSPACE_PROFILE.fullName;
  const roleTitle = profile.roleTitle?.trim() || DEFAULT_WORKSPACE_PROFILE.roleTitle;

  companyNameEl.textContent = companyName;
  companySubtitleEl.textContent = nmlsNumber ? `${subtitleBase} | NMLS #${nmlsNumber}` : subtitleBase;
  brandInitialsEl.textContent = getInitials(companyName, 'M');
  userNameEl.textContent = fullName;
  userRoleEl.textContent = roleTitle;
  userInitialsEl.textContent = getInitials(fullName, 'AM');

  if (profile.companyLogo) {
    brandLogoEl.src = profile.companyLogo;
    brandLogoEl.classList.remove('hidden');
    brandInitialsEl.classList.add('hidden');
  } else {
    brandLogoEl.removeAttribute('src');
    brandLogoEl.classList.add('hidden');
    brandInitialsEl.classList.remove('hidden');
  }

  if (profile.profilePhoto) {
    userPhotoEl.src = profile.profilePhoto;
    userPhotoEl.classList.remove('hidden');
    userInitialsEl.classList.add('hidden');
  } else {
    userPhotoEl.removeAttribute('src');
    userPhotoEl.classList.add('hidden');
    userInitialsEl.classList.remove('hidden');
  }
}

function focusUniversalSearch() {
  if (isUniversalSearchDisabled()) return;
  if (!globalSearchInput) return;
  openUniversalSearch();
  globalSearchInput.focus();
  globalSearchInput.select();
}

function closeHeaderAccountMenu() {
  headerAccountMenu?.classList.add('hidden');
  headerAccountTrigger?.setAttribute('aria-expanded', 'false');
}

function openHeaderAccountMenu() {
  headerAccountMenu?.classList.remove('hidden');
  headerAccountTrigger?.setAttribute('aria-expanded', 'true');
}

function toggleHeaderAccountMenu() {
  const isOpen = headerAccountMenu && !headerAccountMenu.classList.contains('hidden');
  if (isOpen) closeHeaderAccountMenu();
  else openHeaderAccountMenu();
}

function isUniversalSearchDisabled() {
  return activeTab === 'vault' && typeof activeModule?.isUnlocked === 'function' && !activeModule.isUnlocked();
}

function updateGlobalSearchAvailability() {
  const isDisabled = isUniversalSearchDisabled();
  if (!globalSearchInput || !globalSearchShell) return;

  globalSearchInput.disabled = isDisabled;
  globalSearchInput.value = isDisabled ? '' : globalSearchInput.value;
  globalSearchInput.setAttribute(
    'placeholder',
    isDisabled ? 'Unlock the vault to use universal search' : defaultGlobalSearchPlaceholder
  );
  globalSearchShell.classList.toggle('opacity-60', isDisabled);
  globalSearchShell.classList.toggle('pointer-events-none', isDisabled);
  globalSearchShell.classList.toggle('select-none', isDisabled);
  if (isDisabled) {
    closeUniversalSearch(true);
  }
}

function showBackdrop(backdrop, panel) {
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => {
    backdrop.classList.remove('opacity-0');
    panel.classList.remove('scale-95');
  });
}

function hideBackdrop(backdrop, panel) {
  backdrop.classList.add('opacity-0');
  panel.classList.add('scale-95');
  setTimeout(() => backdrop.classList.add('hidden'), 180);
}

function syncAuthOverlay() {
  authOverlay.classList.toggle('hidden', isAuthenticated());
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto min-w-[220px] rounded-2xl border border-[#314b71] bg-[linear-gradient(180deg,rgba(20,39,67,0.98)_0%,rgba(12,24,42,0.99)_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(0,0,0,0.28)] opacity-0 translate-y-[-6px] transition-all duration-200';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-[-6px]');
  });
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-[-6px]');
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

const backupRestoreBackdrop = document.createElement('div');
backupRestoreBackdrop.className = 'fixed inset-0 z-[120] hidden flex items-center justify-center bg-navy/60 p-4 opacity-0 backdrop-blur-sm transition-all duration-200';
backupRestoreBackdrop.innerHTML = `
  <div class="w-full max-w-lg rounded-[1.8rem] border border-softBlue2 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)] transform scale-95 transition-all duration-200">
    <div class="flex items-center justify-between border-b border-softBlue1 px-6 py-5">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Backup & Restore</p>
        <h3 class="mt-1 text-2xl font-black tracking-tight text-navy">Contacts Backup Tools</h3>
      </div>
      <button type="button" id="backup-restore-close" class="flex h-10 w-10 items-center justify-center rounded-xl text-steel transition hover:bg-softBlue1 hover:text-navy focus:outline-none">
        <i class="fa-solid fa-xmark text-sm"></i>
      </button>
    </div>
    <div class="space-y-4 px-6 py-6">
      <div class="rounded-[1.4rem] border border-softBlue2 bg-[#f8fbff] p-4">
        <p class="text-sm font-bold text-navy">Export Backup</p>
        <p class="mt-1 text-sm leading-6 text-steel">Download your contacts as a JSON backup file.</p>
        <button type="button" id="backup-export-btn" class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-2.5 text-sm font-bold text-white transition hover:bg-steel">
          <i class="fa-solid fa-download text-xs"></i>
          <span>Export Contacts Backup</span>
        </button>
      </div>
      <div class="rounded-[1.4rem] border border-softBlue2 bg-[#f8fbff] p-4">
        <p class="text-sm font-bold text-navy">Restore Backup</p>
        <p class="mt-1 text-sm leading-6 text-steel">Restore contacts from a previous JSON backup file.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-softBlue2 px-4 py-2.5 text-sm font-bold text-navy transition hover:bg-softBlue1">
            <i class="fa-solid fa-upload text-xs"></i>
            <span>Choose Backup File</span>
            <input id="backup-restore-input" type="file" accept=".json,application/json" class="hidden">
          </label>
        </div>
      </div>
    </div>
  </div>
`;

const logoutBackdrop = document.createElement('div');
logoutBackdrop.className = 'fixed inset-0 z-[120] hidden items-center justify-center bg-navy/60 p-4 opacity-0 backdrop-blur-sm transition-all duration-200';
logoutBackdrop.innerHTML = `
  <div class="w-full max-w-md rounded-[1.8rem] border border-softBlue2 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)] transform scale-95 transition-all duration-200">
    <div class="px-7 py-7 text-center">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#ffd4db] bg-[#fff4f6] text-[#f05f79]">
        <i class="fa-solid fa-arrow-right-from-bracket text-lg"></i>
      </div>
      <h3 class="mt-5 text-[1.8rem] font-black tracking-tight text-navy">Logout</h3>
      <p class="mt-3 text-sm leading-6 text-steel">You’ll exit the current workspace view and return to the main hub. Your saved data will stay intact.</p>
      <div class="mt-7 flex items-center justify-center gap-3">
        <button type="button" id="logout-cancel-btn" class="inline-flex min-w-[110px] items-center justify-center rounded-2xl border border-softBlue2 px-4 py-2.5 text-sm font-bold text-navy transition hover:bg-softBlue1">
          Cancel
        </button>
        <button type="button" id="logout-confirm-btn" class="inline-flex min-w-[110px] items-center justify-center rounded-2xl bg-navy px-4 py-2.5 text-sm font-bold text-white transition hover:bg-steel">
          Logout
        </button>
      </div>
    </div>
  </div>
`;

const authOverlay = document.createElement('div');
authOverlay.className = 'fixed inset-0 z-[130] flex items-center justify-center bg-[radial-gradient(circle_at_top,#203f6d_0%,#13243f_42%,#0b1628_100%)] p-6';
authOverlay.innerHTML = `
  <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0)_35%)]"></div>
  <div class="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-[#314b71] bg-[linear-gradient(180deg,rgba(20,39,67,0.98)_0%,rgba(12,24,42,0.99)_100%)] p-7 text-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
    <div class="flex items-center gap-3">
      <div class="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-gold/70 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-xl font-black text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
        LC
      </div>
      <div>
        <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-softBlue2">Secure Access</p>
        <h2 class="mt-1 text-[1.9rem] font-black tracking-tight text-white">Sign In</h2>
      </div>
    </div>

    <p class="mt-4 text-sm leading-6 text-slate-300">Use email and password as the primary login method. Google and Outlook sign-in will be integrated later.</p>

    <form id="auth-signin-form" class="mt-6 space-y-4">
      <label class="block">
        <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-softBlue2">Email</span>
        <input id="auth-email" type="email" required placeholder="name@company.com" class="w-full rounded-2xl border border-[#34527c] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#5476a2]">
      </label>
      <label class="block">
        <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-softBlue2">Password</span>
        <input id="auth-password" type="password" required placeholder="Enter your password" class="w-full rounded-2xl border border-[#34527c] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#5476a2]">
      </label>
      <div id="auth-error" class="hidden rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"></div>
      <button id="auth-submit-btn" type="submit" class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-bold text-navy transition hover:bg-[#d9b23f] disabled:opacity-60 disabled:cursor-not-allowed">
        <i class="fa-solid fa-arrow-right-to-bracket text-xs"></i>
        <span id="auth-submit-label">Sign In</span>
      </button>
    </form>

    <div class="mt-6">
      <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-white/10"></div>
        <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-softBlue2">Coming Later</span>
        <div class="h-px flex-1 bg-white/10"></div>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" disabled class="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#34527c] bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-300 opacity-70 cursor-not-allowed">
          <i class="fa-brands fa-google text-sm"></i>
          <span>Google</span>
        </button>
        <button type="button" disabled class="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#34527c] bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-300 opacity-70 cursor-not-allowed">
          <i class="fa-brands fa-microsoft text-sm"></i>
          <span>Outlook</span>
        </button>
      </div>
    </div>
  </div>
`;

app.appendChild(backupRestoreBackdrop);
app.appendChild(logoutBackdrop);
app.appendChild(authOverlay);

// Create workspace layout wrapper
const workspace = document.createElement('div');
workspace.className = 'flex flex-1 overflow-hidden';

// Setup canvas container
const canvas = document.createElement('main');
canvas.className = 'flex-1 p-8 overflow-y-auto flex flex-col justify-between relative bg-softBlue1';

// References to toggle sidebar
let sidebar = null;

function activateTab(tabId) {
  activeTab = tabId;

  const newSidebar = createSidebar(activeTab, handleTabChange, {
    collapsed: sidebarCollapsed,
    onToggleCollapse: handleSidebarCollapse,
  });
  if (sidebar) {
    workspace.replaceChild(newSidebar, sidebar);
  }
  sidebar = newSidebar;

  renderCanvas();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function handleSidebarCollapse(nextCollapsed) {
  sidebarCollapsed = Boolean(nextCollapsed);
  setItem('lo_command_sidebar_collapsed', sidebarCollapsed);

  // Rebuild only the sidebar — do NOT re-render the canvas. Re-rendering would
  // remount the active module (e.g. a fresh, locked vault), kicking the user out.
  const newSidebar = createSidebar(activeTab, handleTabChange, {
    collapsed: sidebarCollapsed,
    onToggleCollapse: handleSidebarCollapse,
  });
  if (sidebar?.classList.contains('hidden')) newSidebar.classList.add('hidden');
  if (sidebar) {
    workspace.replaceChild(newSidebar, sidebar);
  }
  sidebar = newSidebar;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Tab Change Handler
function handleTabChange(tabId) {
  // Toggle selection: click active tab to deselect it back to empty canvas state
  if (activeTab === tabId) {
    activateTab(null);
  } else {
    activateTab(tabId);
  }
}

window.addEventListener('deck-quick-action', (event) => {
  const action = event.detail?.action;
  if (action === 'add-contact') {
    activateTab('contacts');
    requestAnimationFrame(() => activeModule?.openAddModal?.());
    return;
  }

  if (action === 'add-link') {
    activeSettingsSection = 'links';
    activateTab('settings');
    requestAnimationFrame(() => canvas.querySelector('#settings-link-name')?.focus());
  }
});

function getSettingsContentMarkup() {
  if (activeSettingsSection === 'links') {
    const categories = getAssignableLinkCategories();
    return `
      <div class="mx-auto max-w-6xl">
        <h1 class="text-4xl font-black tracking-tight text-navy">Links</h1>
        <p class="mt-2 text-base text-steel">Organize bookmarks and quick-link behavior.</p>

        <div class="mt-8 rounded-[28px] border border-softBlue2 bg-white p-6 shadow-sm">
          <div class="flex flex-col gap-5">
            <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <div class="flex items-center gap-2 text-gold">
                  <i class="fa-regular fa-bookmark text-sm"></i>
                  <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Link Manager</span>
                </div>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-steel">Add links, bookmark favorites for the toolbar, organize them by category, and remove anything you no longer need.</p>
              </div>

              <label class="relative block w-full max-w-sm">
                <i class="fa-solid fa-magnifying-glass absolute left-4 top-3.5 text-slate-400 text-sm"></i>
                <input id="settings-links-search" type="text" placeholder="Search links..." class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] py-3 pl-11 pr-4 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
            </div>

            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Add A New Link Inline</p>
              <div class="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] gap-3">
                <input id="settings-link-name" type="text" placeholder="Link name" class="rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                <div class="relative">
                  <div class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg border border-softBlue2 bg-white shadow-sm">
                    <img id="settings-link-favicon-preview" alt="" class="h-4.5 w-4.5 rounded-sm object-contain">
                  </div>
                  <input id="settings-link-url" type="text" placeholder="example.com" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] pl-12 pr-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                </div>
                <input id="settings-link-alt-domain" type="text" placeholder="Alternate favicon domain" class="rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                <select id="settings-link-category" class="rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy focus:outline-none focus:border-steel">
                  ${categories.map((option) => `<option value="${option.key}" ${option.key === activeLinksCategory ? 'selected' : ''}>${option.label}</option>`).join('')}
                </select>
                <button id="settings-link-add-btn" type="button" class="rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-steel transition">+ Add</button>
              </div>
              <div class="mt-5 flex justify-start">
                <button id="settings-manage-categories-btn" type="button" class="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-softBlue2 px-4 py-2.5 text-sm font-bold text-navy whitespace-nowrap hover:bg-softBlue1 transition">
                  <i class="fa-solid fa-tags text-xs"></i>
                  <span>Manage Categories</span>
                </button>
              </div>
            </div>

            <div id="settings-links-categories" class="flex flex-wrap gap-3"></div>

            <div id="settings-links-list" class="space-y-2"></div>
          </div>
        </div>

        <div id="settings-categories-backdrop" class="fixed inset-0 z-[120] hidden items-center justify-center bg-navy/60 p-4 opacity-0 backdrop-blur-sm transition-all duration-200">
          <div id="settings-categories-panel" class="relative mx-auto w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden rounded-[1.8rem] border border-softBlue2 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)] transform scale-95 transition-all duration-200">
            <div class="flex items-center justify-between border-b border-softBlue1 px-6 py-5">
              <div>
                <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Category Manager</p>
                <h3 class="mt-1 text-2xl font-black tracking-tight text-navy">Manage Link Categories</h3>
              </div>
              <button type="button" id="settings-categories-close" class="flex h-10 w-10 items-center justify-center rounded-xl text-steel transition hover:bg-softBlue1 hover:text-navy focus:outline-none">
                <i class="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div class="flex flex-col flex-1 overflow-hidden">
              <div class="px-6 pt-5 pb-4 border-b border-softBlue1">
                <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Add Category</p>
                <div class="mt-2 flex gap-2">
                  <input id="settings-new-category-name" type="text" placeholder="New category name" class="flex-1 rounded-2xl border border-softBlue2 bg-white px-4 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                  <button id="settings-add-category-btn" type="button" class="rounded-2xl bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-steel transition">Add Category</button>
                </div>
              </div>
              <div class="flex items-center justify-between px-6 pt-4 pb-2">
                <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Current Categories</p>
                <p class="text-xs text-steel">Delete will move links into Unassigned until you reassign them.</p>
              </div>
              <div id="settings-categories-list" class="overflow-y-auto flex-1 px-6 pb-6 space-y-2"></div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  if (activeSettingsSection === 'security') {
    const vaultPreferences = getVaultPreferences();
    return `
      <div class="mx-auto max-w-5xl">
        <h1 class="text-4xl font-black tracking-tight text-navy">Security</h1>
        <p class="mt-2 text-base text-steel">Manage your Vault PIN and automatic lock behavior.</p>

        <div class="mt-8 grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div class="rounded-3xl border border-softBlue2 bg-white p-6 shadow-sm">
            <div class="flex items-center gap-2 text-gold">
              <i class="fa-solid fa-key text-sm"></i>
              <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Vault PIN</span>
            </div>
            <form id="settings-security-pin-form" class="mt-5 space-y-4">
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Current 4-digit PIN</span>
                <input id="settings-pin-current" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="Enter current PIN" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-center text-sm font-semibold tracking-[0.35em] text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="block">
                  <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">New 4-digit PIN</span>
                  <input id="settings-pin-new" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="New PIN" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-center text-sm font-semibold tracking-[0.35em] text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                </label>
                <label class="block">
                  <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Confirm New PIN</span>
                  <input id="settings-pin-confirm" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="Confirm PIN" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-center text-sm font-semibold tracking-[0.35em] text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
                </label>
              </div>
              <div class="flex justify-center">
                <button type="submit" class="inline-flex items-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-steel transition">
                  <i class="fa-solid fa-shield text-xs"></i>
                  <span>Update PIN</span>
                </button>
              </div>
            </form>
          </div>

          <div class="rounded-3xl border border-softBlue2 bg-white p-6 shadow-sm">
            <div class="flex items-center gap-2 text-gold">
              <i class="fa-solid fa-lock text-sm"></i>
              <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Vault Behavior</span>
            </div>
            <div class="mt-5 space-y-4">
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Auto-lock Timer</span>
                <select id="settings-security-autolock" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm font-semibold text-navy focus:outline-none focus:border-steel">
                  ${[
                    { value: 1, label: '1 minute' },
                    { value: 5, label: '5 minutes' },
                    { value: 10, label: '10 minutes' },
                    { value: 15, label: '15 minutes' },
                  ].map((option) => `<option value="${option.value}" ${Number(vaultPreferences.autoLockMinutes) === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
                </select>
              </label>

              <label class="flex items-start gap-3 rounded-[1.4rem] border border-softBlue2 bg-[#f8fbff] px-4 py-4">
                <input id="settings-security-lock-logout" type="checkbox" class="mt-1 h-4 w-4 rounded border-softBlue2 accent-gold" ${vaultPreferences.lockOnLogout ? 'checked' : ''}>
                <span>
                  <span class="block text-sm font-bold text-navy">Lock vault on logout</span>
                  <span class="mt-1 block text-xs leading-5 text-steel">When you log out, the vault will be locked before the session ends.</span>
                </span>
              </label>

              <div class="rounded-[1.4rem] border border-softBlue2 bg-[#f8fbff] p-4">
                <p class="text-sm font-bold text-navy">Recovery Notice</p>
                <p class="mt-2 text-xs leading-6 text-steel">Your vault is encrypted with your PIN. If you forget it, existing vault contents may not be recoverable without a backup.</p>
              </div>

              <div class="flex justify-center">
                <button id="settings-security-save" type="button" class="inline-flex items-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-steel transition">
                  <i class="fa-solid fa-floppy-disk text-xs"></i>
                  <span>Save Security Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const profile = loadWorkspaceProfile();
  const previewSubtitle = profile.companySubtitle?.trim() || DEFAULT_WORKSPACE_PROFILE.companySubtitle;
  const previewNmls = profile.nmlsNumber?.trim();

  return `
    <div class="mx-auto max-w-6xl">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 class="text-4xl font-black tracking-tight text-navy">Account</h1>
          <p class="mt-2 text-base text-steel">Set up your personal profile and workspace branding.</p>
        </div>
        <div class="flex items-center gap-3 xl:pt-3">
          <button type="button" id="settings-account-reset" class="inline-flex items-center gap-2 rounded-2xl border border-softBlue2 px-5 py-3 text-sm font-bold text-navy hover:bg-softBlue1 transition">
            <i class="fa-solid fa-rotate-left text-xs"></i>
            <span>Reset</span>
          </button>
          <button type="button" id="settings-account-save" class="inline-flex items-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-steel transition">
            <i class="fa-solid fa-floppy-disk text-xs"></i>
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div class="rounded-3xl border border-softBlue2 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-2 text-gold">
            <i class="fa-regular fa-user text-sm"></i>
            <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Personal Profile</span>
          </div>
          <div class="mt-5 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Full Name</span>
                <input id="settings-full-name" type="text" value="${escapeHTML(profile.fullName)}" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Role / Title</span>
                <input id="settings-role-title" type="text" value="${escapeHTML(profile.roleTitle)}" placeholder="Mortgage Loan Originator" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
            </div>

            <div class="rounded-[1.6rem] border border-softBlue2 bg-[#f8fbff] p-4">
              <div class="flex items-center gap-4">
                <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-softBlue2 bg-navy text-lg font-bold text-white shadow-sm">
                  ${profile.profilePhoto ? `<img id="settings-profile-photo-preview" src="${profile.profilePhoto}" alt="" class="h-full w-full object-cover">` : `<span id="settings-profile-photo-initials">${escapeHTML(getInitials(profile.fullName, 'AM'))}</span><img id="settings-profile-photo-preview" alt="" class="hidden h-full w-full object-cover">`}
                </div>
                <div class="flex-1">
                  <p class="text-sm font-bold text-navy">Profile Photo</p>
                  <p class="mt-1 text-xs leading-5 text-steel">Optional. If you skip this, the header avatar will display your initials.</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <label class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-steel transition">
                      <i class="fa-solid fa-upload text-[11px]"></i>
                      <span>Upload Photo</span>
                      <input id="settings-profile-photo-input" type="file" accept="image/*" class="hidden">
                    </label>
                    <button type="button" id="settings-profile-photo-remove" class="inline-flex items-center gap-2 rounded-2xl border border-softBlue2 px-4 py-2 text-xs font-bold text-navy hover:bg-softBlue1 transition ${profile.profilePhoto ? '' : 'hidden'}">
                      <i class="fa-regular fa-trash-can text-[11px]"></i>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-softBlue2 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-2 text-gold">
            <i class="fa-regular fa-building text-sm"></i>
            <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Brand & Identity</span>
          </div>
          <div class="mt-5 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="block md:col-span-2">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Company Name</span>
                <input id="settings-company-name" type="text" value="${escapeHTML(profile.companyName)}" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">Workspace Subtitle</span>
                <input id="settings-company-subtitle" type="text" value="${escapeHTML(profile.companySubtitle)}" placeholder="Financial Command Center" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
              <label class="block">
                <span class="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-steel">NMLS Number</span>
                <input id="settings-nmls-number" type="text" value="${escapeHTML(profile.nmlsNumber)}" placeholder="Optional" class="w-full rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-4 py-3 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-steel">
              </label>
            </div>

            <div class="rounded-[1.6rem] border border-softBlue2 bg-[#f8fbff] p-4">
              <div class="flex items-center gap-4">
                <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.1rem] border border-gold/60 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] text-lg font-black text-navy shadow-sm">
                  ${profile.companyLogo ? `<img id="settings-company-logo-preview" src="${profile.companyLogo}" alt="" class="h-full w-full object-cover">` : `<span id="settings-company-logo-initials">${escapeHTML(getInitials(profile.companyName, 'M'))}</span><img id="settings-company-logo-preview" alt="" class="hidden h-full w-full object-cover">`}
                </div>
                <div class="flex-1">
                  <p class="text-sm font-bold text-navy">Company Logo</p>
                  <p class="mt-1 text-xs leading-5 text-steel">Optional. When added, this will replace the default badge in the header.</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <label class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-steel transition">
                      <i class="fa-solid fa-upload text-[11px]"></i>
                      <span>Upload Logo</span>
                      <input id="settings-company-logo-input" type="file" accept="image/*" class="hidden">
                    </label>
                    <button type="button" id="settings-company-logo-remove" class="inline-flex items-center gap-2 rounded-2xl border border-softBlue2 px-4 py-2 text-xs font-bold text-navy hover:bg-softBlue1 transition ${profile.companyLogo ? '' : 'hidden'}">
                      <i class="fa-regular fa-trash-can text-[11px]"></i>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5">
        <div class="rounded-3xl border border-softBlue2 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-2 text-gold">
            <i class="fa-solid fa-window-maximize text-sm"></i>
            <span class="text-[11px] font-bold uppercase tracking-[0.18em]">Header Preview</span>
          </div>
          <div class="mt-5 overflow-hidden rounded-[1.8rem] border border-[#294265] bg-[linear-gradient(180deg,#203f6d_0%,#183255_100%)] p-5 text-white shadow-[0_18px_38px_rgba(12,25,49,0.18)]">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1rem] border border-gold/70 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] font-black text-xl text-navy flex-shrink-0">
                  ${profile.companyLogo ? `<img id="settings-preview-company-logo" src="${profile.companyLogo}" alt="" class="h-full w-full object-cover">` : `<span id="settings-preview-company-initials">${escapeHTML(getInitials(profile.companyName, 'M'))}</span><img id="settings-preview-company-logo" alt="" class="hidden h-full w-full object-cover">`}
                </div>
                <div class="min-w-0">
                  <p id="settings-preview-company-name" class="truncate text-2xl font-black tracking-tight">${escapeHTML(profile.companyName)}</p>
                  <p id="settings-preview-company-subtitle" class="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-softBlue2">${escapeHTML(previewNmls ? `${previewSubtitle} | NMLS #${previewNmls}` : previewSubtitle)}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <div class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-gold bg-[linear-gradient(180deg,#395780_0%,#233b60_100%)] font-bold text-white flex-shrink-0">
                  ${profile.profilePhoto ? `<img id="settings-preview-user-photo" src="${profile.profilePhoto}" alt="" class="h-full w-full object-cover">` : `<span id="settings-preview-user-initials">${escapeHTML(getInitials(profile.fullName, 'AM'))}</span><img id="settings-preview-user-photo" alt="" class="hidden h-full w-full object-cover">`}
                </div>
                <div class="hidden sm:block min-w-0">
                  <p id="settings-preview-user-name" class="truncate text-sm font-bold">${escapeHTML(profile.fullName)}</p>
                  <p id="settings-preview-user-role" class="mt-1 truncate text-[11px] text-softBlue2">${escapeHTML(profile.roleTitle)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

// Pointer-based drag-to-reorder, mirroring the utility deck's widget reorder:
// 6px drag threshold, a dashed placeholder, the dragged row goes position:fixed and
// follows the pointer, and insertion is decided by sibling midpoints. Delegated on the
// container so it survives innerHTML re-renders. onDrop receives the new key order.
function makeListSortable(containerEl, itemSelector, handleSelector, getKey, onDrop) {
  if (!containerEl) return;
  containerEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest(handleSelector);
    if (!handle || !containerEl.contains(handle)) return;
    const slot = handle.closest(itemSelector);
    if (!slot) return;

    const startRect = slot.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerOffsetY = event.clientY - startRect.top;
    let dragging = false;
    let placeholder = null;

    const startDrag = () => {
      dragging = true;
      placeholder = document.createElement('div');
      placeholder.className = 'rounded-2xl border-2 border-dashed border-steel/40 bg-softBlue1';
      placeholder.style.height = `${startRect.height}px`;
      placeholder.style.flexShrink = '0';
      containerEl.insertBefore(placeholder, slot);
      // Float on document.body — not the container — so a transformed/overflow-hidden
      // ancestor (e.g. the categories modal panel) can't reposition or clip the fixed slot.
      document.body.appendChild(slot);

      slot.style.position = 'fixed';
      slot.style.left = `${startRect.left}px`;
      slot.style.top = `${startRect.top}px`;
      slot.style.width = `${startRect.width}px`;
      slot.style.height = `${startRect.height}px`;
      slot.style.zIndex = '150';
      slot.style.pointerEvents = 'none';
      slot.style.transform = 'scale(1.02)';
      slot.style.opacity = '0.96';
      slot.style.boxShadow = '0 20px 40px rgba(15, 23, 42, 0.18)';
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    };

    const movePlaceholder = (clientY) => {
      const siblings = [...containerEl.querySelectorAll(itemSelector)].filter((item) => item !== slot);
      let inserted = false;
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          containerEl.insertBefore(placeholder, sibling);
          inserted = true;
          break;
        }
      }
      if (!inserted) containerEl.appendChild(placeholder);
    };

    const onMove = (ev) => {
      if (!dragging) {
        if (Math.max(Math.abs(ev.clientX - startX), Math.abs(ev.clientY - startY)) < 6) return;
        startDrag();
      }
      slot.style.top = `${ev.clientY - pointerOffsetY}px`;
      movePlaceholder(ev.clientY);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!dragging) return;

      containerEl.insertBefore(slot, placeholder);
      placeholder.remove();
      slot.style.position = '';
      slot.style.left = '';
      slot.style.top = '';
      slot.style.width = '';
      slot.style.height = '';
      slot.style.zIndex = '';
      slot.style.pointerEvents = '';
      slot.style.transform = '';
      slot.style.opacity = '';
      slot.style.boxShadow = '';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      const order = [...containerEl.querySelectorAll(itemSelector)].map(getKey);
      onDrop(order);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });
}

function setupLinksManager() {
  const searchEl = canvas.querySelector('#settings-links-search');
  const listEl = canvas.querySelector('#settings-links-list');
  const categoriesEl = canvas.querySelector('#settings-links-categories');
  const nameEl = canvas.querySelector('#settings-link-name');
  const urlEl = canvas.querySelector('#settings-link-url');
  const categoryEl = canvas.querySelector('#settings-link-category');
  const altDomainEl = canvas.querySelector('#settings-link-alt-domain');
  const addBtn = canvas.querySelector('#settings-link-add-btn');
  const faviconPreviewEl = canvas.querySelector('#settings-link-favicon-preview');
  const manageCategoriesBtn = canvas.querySelector('#settings-manage-categories-btn');
  const categoriesBackdrop = canvas.querySelector('#settings-categories-backdrop');
  const categoriesPanel = canvas.querySelector('#settings-categories-panel');
  const categoriesCloseBtn = canvas.querySelector('#settings-categories-close');
  const categoriesListEl = canvas.querySelector('#settings-categories-list');
  const newCategoryNameEl = canvas.querySelector('#settings-new-category-name');
  const addCategoryBtn = canvas.querySelector('#settings-add-category-btn');
  let editingLinkId = null;
  let pendingDeleteCategoryKey = null;
  let categories = getSettingsLinkCategories();

  function getCategoryLabel(categoryKey) {
    if (isUnassignedLinkCategory(categoryKey)) return UNASSIGNED_LINK_CATEGORY_LABEL;
    return categories.find((category) => category.key === categoryKey)?.label || '';
  }

  function renderCategorySelect() {
    const assignableCategories = getAssignableLinkCategories();
    const selectedValue = categoryEl.value;
    categoryEl.innerHTML = assignableCategories.map((category) => `
      <option value="${category.key}">${category.label}</option>
    `).join('');
    const fallbackValue = activeLinksCategory !== 'all' && assignableCategories.some((category) => category.key === activeLinksCategory)
      ? activeLinksCategory
      : assignableCategories[0]?.key || '';
    categoryEl.value = assignableCategories.some((category) => category.key === selectedValue) ? selectedValue : fallbackValue;
  }

  function updateFaviconPreview() {
    applyFaviconToImage(faviconPreviewEl, urlEl.value || 'example.com', altDomainEl.value);
  }

  function getVisibleLinks() {
    const query = searchEl.value.trim().toLowerCase();
    return loadWorkspaceLinks().filter((link) => {
      const matchesCategory = activeLinksCategory === 'all' || link.category === activeLinksCategory;
      const haystack = `${link.name} ${link.url} ${link.category}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesCategory && matchesQuery;
    });
  }

  function renderCategoryPills() {
    const links = loadWorkspaceLinks();
    const pills = [
      { key: 'all', label: 'All Links', count: links.length },
      ...categories.map((option) => ({
        key: option.key,
        label: option.label,
        count: links.filter((link) => link.category === option.key).length,
      })),
    ];

    categoriesEl.innerHTML = pills.map((pill) => {
      const active = pill.key === activeLinksCategory;
      const isUnassigned = isUnassignedLinkCategory(pill.key);
      const base = 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition';
      let btnCls;
      let countCls;
      if (isUnassigned) {
        // Soft amber warning chip — subtle so it flags action without overpowering the row
        btnCls = active
          ? `${base} bg-amber text-white shadow-sm`
          : `${base} bg-amber/10 text-amber border border-amber/30 hover:bg-amber/15`;
        countCls = active ? 'bg-white/20 text-white' : 'bg-white text-amber border border-amber/30';
      } else {
        btnCls = active
          ? `${base} bg-navy text-white shadow-sm`
          : `${base} bg-[#f3f6fb] text-steel hover:bg-softBlue1`;
        countCls = active ? 'bg-white/12 text-white' : 'bg-white text-steel border border-softBlue2';
      }
      const alertIcon = isUnassigned ? '<i class="fa-solid fa-triangle-exclamation text-[11px]"></i>' : '';
      return `
        <button
          type="button"
          data-link-category="${pill.key}"
          class="${btnCls}"
        >
          ${alertIcon}
          <span>${pill.label}</span>
          <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] ${countCls}">${pill.count}</span>
        </button>
      `;
    }).join('');
  }

  function renderList() {
    const assignableCategories = getAssignableLinkCategories();
    const links = getVisibleLinks();
    listEl.innerHTML = links.map((link) => `
      <div class="settings-link-row flex items-center gap-4 rounded-2xl border border-softBlue2 bg-white px-4 py-3 shadow-sm" data-link-id="${escapeHTML(link.id)}">
        <div data-link-drag-handle class="text-slate-300 text-sm cursor-grab active:cursor-grabbing hover:text-steel select-none touch-none" title="Drag to reorder">
          <i class="fa-solid fa-grip-lines"></i>
        </div>
        <button type="button" data-toggle-bookmark="${link.id}" class="flex h-8 w-8 items-center justify-center rounded-full border transition ${link.bookmarked ? 'border-gold/40 bg-gold/10 text-gold' : 'border-softBlue2 bg-white text-slate-400 hover:bg-softBlue1 hover:text-steel'}">
          <i class="${link.bookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark text-xs"></i>
        </button>
        <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-softBlue2 bg-white shadow-sm">
          <img data-link-id="${escapeHTML(link.id)}" data-favicon-url="${escapeHTML(link.url)}" data-alt-favicon-domain="${escapeHTML(link.altFaviconDomain || '')}" alt="" class="h-5 w-5 rounded-sm object-contain">
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-navy truncate">${escapeHTML(link.name)}</div>
          <a href="${escapeHTML(normalizeLinkUrl(link.url))}" target="_blank" rel="noreferrer" class="text-xs text-steel hover:underline truncate block">${escapeHTML(normalizeLinkUrl(link.url))}</a>
        </div>
        <select data-link-category-select="${link.id}" class="w-[11rem] rounded-2xl border border-softBlue2 bg-[#f6f9fd] px-3 py-2 text-sm text-navy focus:outline-none focus:border-steel">
          <option value="${UNASSIGNED_LINK_CATEGORY}" ${isUnassignedLinkCategory(link.category) ? 'selected' : ''}>${UNASSIGNED_LINK_CATEGORY_LABEL}</option>
          ${assignableCategories.map((category) => `<option value="${category.key}" ${category.key === link.category ? 'selected' : ''}>${category.label}</option>`).join('')}
        </select>
        <div class="flex items-center gap-2">
          <button type="button" data-edit-link="${link.id}" class="h-9 w-9 rounded-xl border border-softBlue2 text-steel hover:bg-softBlue1 transition">
            <i class="fa-regular fa-pen-to-square text-sm"></i>
          </button>
          <button type="button" data-delete-link="${link.id}" class="h-9 w-9 rounded-xl border border-softBlue2 text-steel hover:bg-red-50 hover:text-red-500 transition">
            <i class="fa-regular fa-trash-can text-sm"></i>
          </button>
        </div>
      </div>
    `).join('') || `
      <div class="rounded-2xl border border-dashed border-softBlue2 bg-[#f8fbff] px-6 py-10 text-center">
        <p class="text-sm font-semibold text-navy">No links found</p>
        <p class="mt-1 text-xs text-steel">Try a different search or add a new quick link above.</p>
      </div>
    `;

    listEl.querySelectorAll('[data-favicon-url]').forEach((imgEl) => {
      applyFaviconToImage(
        imgEl,
        imgEl.getAttribute('data-favicon-url') || '',
        imgEl.getAttribute('data-alt-favicon-domain') || '',
        imgEl.getAttribute('data-link-id') || null
      );
    });
  }

  function resetForm() {
    editingLinkId = null;
    nameEl.value = '';
    urlEl.value = '';
    altDomainEl.value = '';
    renderCategorySelect();
    if (activeLinksCategory !== 'all' && categories.some((category) => category.key === activeLinksCategory)) {
      categoryEl.value = activeLinksCategory;
    }
    addBtn.textContent = '+ Add';
    updateFaviconPreview();
  }

  function openCategoriesModal() {
    categoriesBackdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
      categoriesBackdrop.classList.remove('opacity-0');
      categoriesPanel.classList.remove('scale-95');
    });
  }

  function closeCategoriesModal() {
    categoriesBackdrop.classList.add('opacity-0');
    categoriesPanel.classList.add('scale-95');
    setTimeout(() => categoriesBackdrop.classList.add('hidden'), 180);
  }

  function openInlineCategoryDelete(categoryKey) {
    pendingDeleteCategoryKey = categoryKey;
    renderCategoriesManager();
  }

  function closeInlineCategoryDelete() {
    pendingDeleteCategoryKey = null;
    renderCategoriesManager();
  }

  function syncCategories() {
    categories = getSettingsLinkCategories();
    if (activeLinksCategory !== 'all' && !categories.some((category) => category.key === activeLinksCategory)) {
      activeLinksCategory = 'all';
    }
    renderCategorySelect();
    renderCategoryPills();
    renderList();
    resetForm();
  }

  function renderCategoriesManager() {
    const links = loadWorkspaceLinks();
    categoriesListEl.innerHTML = categories
      .filter((category) => !isUnassignedLinkCategory(category.key))
      .map((category) => {
      const linkCount = links.filter((link) => link.category === category.key).length;
      const isDeletePending = pendingDeleteCategoryKey === category.key;

      return `
        <div class="settings-category-row rounded-2xl border border-softBlue2 bg-[#f8fbff] px-3 py-2.5" data-category-key="${escapeHTML(category.key)}">
          <div class="flex items-center gap-2">
            <div data-category-drag-handle class="cursor-grab active:cursor-grabbing text-slate-300 hover:text-steel select-none touch-none flex-shrink-0" title="Drag to reorder">
              <i class="fa-solid fa-grip-vertical"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  value="${escapeHTML(category.label)}"
                  data-category-rename="${category.key}"
                  class="flex-1 min-w-0 rounded-xl border border-softBlue2 bg-white px-3 py-1.5 text-sm font-semibold text-navy placeholder-slate-400 focus:outline-none focus:border-steel"
                >
                <span class="text-xs text-steel whitespace-nowrap flex-shrink-0">${linkCount} link${linkCount === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              ${isDeletePending ? `
                <div class="flex items-center gap-2 rounded-xl border border-[#7a2331] bg-[#39131b] px-3 py-1.5 text-xs">
                  <span class="font-semibold text-[#ffd2db] whitespace-nowrap">Move to ${UNASSIGNED_LINK_CATEGORY_LABEL}?</span>
                  <button type="button" data-category-delete-cancel="${category.key}" class="font-bold text-[#cfdaf1] transition hover:text-white">Cancel</button>
                  <button type="button" data-category-delete-confirm="${category.key}" class="font-bold text-[#ff6b76] transition hover:text-[#ff8f99]">Delete</button>
                </div>
              ` : `
                <button type="button" data-category-save="${category.key}" class="rounded-xl border border-softBlue2 px-3 py-1.5 text-xs font-bold text-navy transition hover:bg-softBlue1">Save</button>
                <button type="button" data-category-delete="${category.key}" class="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100">Delete</button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function addCategory() {
    const label = newCategoryNameEl.value.trim();
    const key = slugifyCategoryKey(label);
    if (!label || !key) return;
    if (categories.some((category) => category.key === key)) return;
    categories = [...categories, { key, label }];
    saveLinkCategories(categories);
    newCategoryNameEl.value = '';
    syncCategories();
    renderCategoriesManager();
  }

  function renameCategory(categoryKey) {
    const input = categoriesListEl.querySelector(`[data-category-rename="${categoryKey}"]`);
    const label = input?.value.trim() || '';
    if (!label) return;
    const nextCategories = loadLinkCategories().map((category) => category.key === categoryKey ? { ...category, label } : category);
    saveLinkCategories(nextCategories);
    syncCategories();
    renderCategoriesManager();
  }

  function deleteCategory(categoryKey) {
    const links = loadWorkspaceLinks().map((link) => link.category === categoryKey ? { ...link, category: UNASSIGNED_LINK_CATEGORY, bookmarked: false } : link);
    saveWorkspaceLinks(links);
    const nextCategories = loadLinkCategories().filter((category) => category.key !== categoryKey);
    saveLinkCategories(nextCategories);
    if (activeLinksCategory === categoryKey) {
      activeLinksCategory = UNASSIGNED_LINK_CATEGORY;
    }
    syncCategories();
    renderCategoriesManager();
    window.dispatchEvent(new CustomEvent('workspace-links-updated'));
  }

  function upsertLink() {
    const name = nameEl.value.trim();
    const url = normalizeLinkUrl(urlEl.value);
    const category = categoryEl.value;
    const altFaviconDomain = altDomainEl.value.trim();
    if (!name || !url) return;

    const links = loadWorkspaceLinks();
    if (editingLinkId) {
      const index = links.findIndex((link) => link.id === editingLinkId);
      if (index !== -1) {
        links[index] = { ...links[index], name, url, category, altFaviconDomain };
        faviconCache.delete(editingLinkId);
      }
    } else {
      links.unshift({ id: `lnk-${Date.now()}`, name, url, category, altFaviconDomain });
    }

    saveWorkspaceLinks(links);
    activeLinksCategory = category;
    renderCategoryPills();
    renderList();
    window.dispatchEvent(new CustomEvent('workspace-links-updated'));
    resetForm();
  }

  searchEl.addEventListener('input', renderList);
  urlEl.addEventListener('input', updateFaviconPreview);
  altDomainEl.addEventListener('input', updateFaviconPreview);
  addBtn.addEventListener('click', upsertLink);
  manageCategoriesBtn?.addEventListener('click', () => {
    renderCategoriesManager();
    openCategoriesModal();
  });
  categoriesCloseBtn?.addEventListener('click', closeCategoriesModal);
  categoriesBackdrop?.addEventListener('click', (event) => {
    if (event.target === categoriesBackdrop) closeCategoriesModal();
  });
  addCategoryBtn?.addEventListener('click', addCategory);
  newCategoryNameEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCategory();
    }
  });

  categoriesEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-link-category]');
    if (!button) return;
    activeLinksCategory = button.getAttribute('data-link-category');
    renderCategoryPills();
    renderList();
    if (!editingLinkId) {
      categoryEl.value = activeLinksCategory === 'all' ? categoryEl.value : activeLinksCategory;
    }
  });

  listEl.addEventListener('change', (event) => {
    const categorySelect = event.target.closest('[data-link-category-select]');
    if (!categorySelect) return;
    const linkId = categorySelect.getAttribute('data-link-category-select');
    const nextCategory = categorySelect.value;
    const nextLinks = loadWorkspaceLinks().map((link) => link.id === linkId ? { ...link, category: nextCategory } : link);
    saveWorkspaceLinks(nextLinks);
    // Stay on the current filter (e.g. Unassigned) while it still has links;
    // syncCategories() falls back to All only when the active category disappears.
    syncCategories();
    renderCategoriesManager();
    window.dispatchEvent(new CustomEvent('workspace-links-updated'));
  });

  // Apply the new visible order back onto the full link list, leaving links that are
  // hidden by the active filter in their original slots.
  function persistLinkOrder(newVisibleIds) {
    const full = loadWorkspaceLinks();
    const visible = new Set(newVisibleIds);
    const reordered = newVisibleIds.map((id) => full.find((link) => link.id === id)).filter(Boolean);
    let next = 0;
    const result = full.map((link) => (visible.has(link.id) ? reordered[next++] : link));
    saveWorkspaceLinks(result);
    renderList();
    renderCategoryPills();
    window.dispatchEvent(new CustomEvent('workspace-links-updated'));
  }

  function persistCategoryOrder(newKeys) {
    const byKey = new Map(loadLinkCategories().map((category) => [category.key, category]));
    const reordered = newKeys.map((key) => byKey.get(key)).filter(Boolean);
    loadLinkCategories().forEach((category) => {
      if (!newKeys.includes(category.key)) reordered.push(category);
    });
    saveLinkCategories(reordered);
    syncCategories();
    renderCategoriesManager();
  }

  makeListSortable(listEl, '.settings-link-row', '[data-link-drag-handle]', (el) => el.dataset.linkId, persistLinkOrder);
  makeListSortable(categoriesListEl, '.settings-category-row', '[data-category-drag-handle]', (el) => el.dataset.categoryKey, persistCategoryOrder);

  categoriesListEl?.addEventListener('click', (event) => {
    const saveBtn = event.target.closest('[data-category-save]');
    if (saveBtn) {
      renameCategory(saveBtn.getAttribute('data-category-save'));
      return;
    }
    const cancelDeleteBtn = event.target.closest('[data-category-delete-cancel]');
    if (cancelDeleteBtn) {
      closeInlineCategoryDelete();
      return;
    }
    const confirmDeleteBtn = event.target.closest('[data-category-delete-confirm]');
    if (confirmDeleteBtn) {
      deleteCategory(confirmDeleteBtn.getAttribute('data-category-delete-confirm'));
      pendingDeleteCategoryKey = null;
      return;
    }
    const deleteBtn = event.target.closest('[data-category-delete]');
    if (deleteBtn) {
      openInlineCategoryDelete(deleteBtn.getAttribute('data-category-delete'));
    }
  });

  listEl.addEventListener('click', (event) => {
    const bookmarkBtn = event.target.closest('[data-toggle-bookmark]');
    if (bookmarkBtn) {
      const links = loadWorkspaceLinks();
      const linkId = bookmarkBtn.getAttribute('data-toggle-bookmark');
      const index = links.findIndex((item) => item.id === linkId);
      if (index !== -1) {
        links[index] = { ...links[index], bookmarked: !links[index].bookmarked };
        saveWorkspaceLinks(links);
        renderList();
        window.dispatchEvent(new CustomEvent('workspace-links-updated'));
      }
      return;
    }

    const editBtn = event.target.closest('[data-edit-link]');
    if (editBtn) {
      const link = loadWorkspaceLinks().find((item) => item.id === editBtn.getAttribute('data-edit-link'));
      if (!link) return;
      editingLinkId = link.id;
      categories = loadLinkCategories();
      renderCategorySelect();
      nameEl.value = link.name;
      urlEl.value = link.url;
      categoryEl.value = link.category;
      altDomainEl.value = link.altFaviconDomain || '';
      addBtn.textContent = 'Save';
      updateFaviconPreview();
      return;
    }

    const deleteBtn = event.target.closest('[data-delete-link]');
    if (deleteBtn) {
      const nextLinks = loadWorkspaceLinks().filter((item) => item.id !== deleteBtn.getAttribute('data-delete-link'));
      saveWorkspaceLinks(nextLinks);
      renderCategoryPills();
      renderList();
      window.dispatchEvent(new CustomEvent('workspace-links-updated'));
      if (editingLinkId === deleteBtn.getAttribute('data-delete-link')) {
        resetForm();
      }
    }
  });

  categories = getSettingsLinkCategories();
  syncCategories();
}

function setupAccountSettings() {
  const fullNameEl = canvas.querySelector('#settings-full-name');
  const roleTitleEl = canvas.querySelector('#settings-role-title');
  const companyNameEl = canvas.querySelector('#settings-company-name');
  const companySubtitleEl = canvas.querySelector('#settings-company-subtitle');
  const nmlsNumberEl = canvas.querySelector('#settings-nmls-number');
  const profilePhotoInput = canvas.querySelector('#settings-profile-photo-input');
  const profilePhotoRemove = canvas.querySelector('#settings-profile-photo-remove');
  const companyLogoInput = canvas.querySelector('#settings-company-logo-input');
  const companyLogoRemove = canvas.querySelector('#settings-company-logo-remove');
  const saveBtn = canvas.querySelector('#settings-account-save');
  const resetBtn = canvas.querySelector('#settings-account-reset');

  let draft = loadWorkspaceProfile();

  function toggleImage(previewImg, initialsEl, removeBtn, value) {
    if (previewImg) {
      if (value) {
        previewImg.src = value;
        previewImg.classList.remove('hidden');
      } else {
        previewImg.removeAttribute('src');
        previewImg.classList.add('hidden');
      }
    }
    if (initialsEl) {
      initialsEl.classList.toggle('hidden', Boolean(value));
    }
    if (removeBtn) {
      removeBtn.classList.toggle('hidden', !value);
    }
  }

  function refreshPreview() {
    draft.fullName = fullNameEl.value;
    draft.roleTitle = roleTitleEl.value;
    draft.companyName = companyNameEl.value;
    draft.companySubtitle = companySubtitleEl.value;
    draft.nmlsNumber = nmlsNumberEl.value;

    const previewCompanyName = canvas.querySelector('#settings-preview-company-name');
    const previewCompanySubtitle = canvas.querySelector('#settings-preview-company-subtitle');
    const previewUserName = canvas.querySelector('#settings-preview-user-name');
    const previewUserRole = canvas.querySelector('#settings-preview-user-role');
    const companyInitialsEls = [
      canvas.querySelector('#settings-company-logo-initials'),
      canvas.querySelector('#settings-preview-company-initials'),
    ];
    const userInitialsEls = [
      canvas.querySelector('#settings-profile-photo-initials'),
      canvas.querySelector('#settings-preview-user-initials'),
    ];

    const companyName = draft.companyName.trim() || DEFAULT_WORKSPACE_PROFILE.companyName;
    const companySubtitle = draft.companySubtitle.trim() || DEFAULT_WORKSPACE_PROFILE.companySubtitle;
    const nmls = draft.nmlsNumber.trim();
    const fullName = draft.fullName.trim() || DEFAULT_WORKSPACE_PROFILE.fullName;
    const roleTitle = draft.roleTitle.trim() || DEFAULT_WORKSPACE_PROFILE.roleTitle;

    previewCompanyName.textContent = companyName;
    previewCompanySubtitle.textContent = nmls ? `${companySubtitle} | NMLS #${nmls}` : companySubtitle;
    previewUserName.textContent = fullName;
    previewUserRole.textContent = roleTitle;

    companyInitialsEls.forEach((el) => { if (el) el.textContent = getInitials(companyName, 'M'); });
    userInitialsEls.forEach((el) => { if (el) el.textContent = getInitials(fullName, 'AM'); });

    toggleImage(canvas.querySelector('#settings-company-logo-preview'), canvas.querySelector('#settings-company-logo-initials'), companyLogoRemove, draft.companyLogo);
    toggleImage(canvas.querySelector('#settings-preview-company-logo'), canvas.querySelector('#settings-preview-company-initials'), null, draft.companyLogo);
    toggleImage(canvas.querySelector('#settings-profile-photo-preview'), canvas.querySelector('#settings-profile-photo-initials'), profilePhotoRemove, draft.profilePhoto);
    toggleImage(canvas.querySelector('#settings-preview-user-photo'), canvas.querySelector('#settings-preview-user-initials'), null, draft.profilePhoto);
  }

  function readImageFile(file, onLoad) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  [fullNameEl, roleTitleEl, companyNameEl, companySubtitleEl, nmlsNumberEl].forEach((input) => {
    input?.addEventListener('input', refreshPreview);
  });

  profilePhotoInput?.addEventListener('change', (event) => {
    readImageFile(event.target.files?.[0], (result) => {
      draft.profilePhoto = result;
      refreshPreview();
    });
    event.target.value = '';
  });

  companyLogoInput?.addEventListener('change', (event) => {
    readImageFile(event.target.files?.[0], (result) => {
      draft.companyLogo = result;
      refreshPreview();
    });
    event.target.value = '';
  });

  profilePhotoRemove?.addEventListener('click', () => {
    draft.profilePhoto = '';
    refreshPreview();
  });

  companyLogoRemove?.addEventListener('click', () => {
    draft.companyLogo = '';
    refreshPreview();
  });

  saveBtn?.addEventListener('click', () => {
    refreshPreview();
    saveWorkspaceProfile(draft);
    applyHeaderProfile(draft);
  });

  resetBtn?.addEventListener('click', () => {
    draft = { ...DEFAULT_WORKSPACE_PROFILE };
    fullNameEl.value = draft.fullName;
    roleTitleEl.value = draft.roleTitle;
    companyNameEl.value = draft.companyName;
    companySubtitleEl.value = draft.companySubtitle;
    nmlsNumberEl.value = draft.nmlsNumber;
    refreshPreview();
  });

  refreshPreview();
}

function setupSecuritySettings() {
  const pinForm = canvas.querySelector('#settings-security-pin-form');
  const currentPinEl = canvas.querySelector('#settings-pin-current');
  const newPinEl = canvas.querySelector('#settings-pin-new');
  const confirmPinEl = canvas.querySelector('#settings-pin-confirm');
  const autoLockEl = canvas.querySelector('#settings-security-autolock');
  const lockOnLogoutEl = canvas.querySelector('#settings-security-lock-logout');
  const saveSecurityBtn = canvas.querySelector('#settings-security-save');

  async function updatePin(event) {
    event.preventDefault();
    const oldPin = currentPinEl.value.trim();
    const newPin = newPinEl.value.trim();
    const confirmPin = confirmPinEl.value.trim();

    if (newPin !== confirmPin) {
      showToast('New PINs do not match');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      showToast('PIN must be exactly 4 digits');
      return;
    }
    if (!hasVaultData()) {
      showToast('Vault is not initialized yet');
      return;
    }

    try {
      const currentSalt = getVaultSalt();
      const currentIv = getVaultIv();
      const currentCiphertext = getVaultCiphertext();
      const oldKey = await deriveKey(oldPin, currentSalt);
      const decryptedItems = await decryptData(oldKey, currentCiphertext, currentIv);
      const newSalt = generateSalt();
      const newKey = await deriveKey(newPin, newSalt);
      const { ciphertext: newCiphertext, iv: newIv } = await encryptData(newKey, decryptedItems);
      saveVaultData(newSalt, newIv, newCiphertext);
      pinForm.reset();
      showToast('Vault PIN updated');
    } catch {
      showToast('Current PIN is incorrect');
    }
  }

  function saveSecurityPreferences() {
    saveVaultPreferences({
      autoLockMinutes: Number(autoLockEl.value) || 5,
      lockOnLogout: Boolean(lockOnLogoutEl.checked),
    });
    showToast('Security settings saved');
  }

  pinForm?.addEventListener('submit', updatePin);
  saveSecurityBtn?.addEventListener('click', saveSecurityPreferences);
}

// Canvas Content Renderer
function renderCanvas() {
  // Tear down any previously mounted module
  if (activeModule) {
    activeModule.destroy();
    activeModule = null;
  }

  // Contacts gets the remaining width — hide only the left nav sidebar
  if (activeTab === 'contacts') {
    sidebar.classList.remove('hidden');
    widgetDeck.classList.remove('hidden');
    canvas.className = 'flex-1 overflow-hidden flex flex-col relative bg-softBlue1';
    canvas.innerHTML = '';
    const contacts = createContactsModule(() => activateTab(null));
    activeModule = contacts;
    canvas.appendChild(contacts.element);
    updateGlobalSearchAvailability();
    return;
  }

  // All other tabs — restore sidebar and widget deck
  sidebar.classList.remove('hidden');
  widgetDeck.classList.remove('hidden');

  if (activeTab === 'vault') {
    canvas.className = 'flex-1 overflow-hidden flex flex-col relative bg-softBlue1';
    canvas.innerHTML = '';
    const vault = createVaultModule();
    activeModule = vault;
    canvas.appendChild(vault.element);
    updateGlobalSearchAvailability();
    return;
  }

  if (activeTab === 'settings') {
    sidebar.classList.add('hidden');
    widgetDeck.classList.remove('hidden');
    canvas.className = 'flex-1 overflow-y-auto flex flex-col relative bg-[#f4f7fb]';
    canvas.innerHTML = `
      <div class="flex min-h-full flex-none items-stretch bg-[#f4f7fb]">
        <aside class="w-64 shrink-0 self-stretch border-r border-slate-800 bg-[#121a2b] text-slate-200 flex flex-col">
          <div class="sticky top-0 flex h-[calc(100vh-6.25rem)] flex-col">
            <div class="px-6 py-5 border-b border-white/10">
              <p class="text-[11px] font-bold uppercase tracking-[0.22em] text-softBlue2/80">Settings</p>
              <p class="mt-3 text-sm leading-6 text-slate-300">Review profile details and backup access.</p>
            </div>

            <nav class="px-3 py-5 space-y-1.5">
              <button type="button" data-settings-section="account" class="w-full flex items-center gap-3 rounded-xl ${activeSettingsSection === 'account' ? 'bg-white/6 border border-softBlue2/20 text-white' : 'text-slate-300 hover:bg-white/5'} px-4 py-3 text-left transition">
                <i class="fa-regular fa-user text-softBlue2 text-sm"></i>
                <span class="text-sm font-semibold">Account</span>
              </button>
              <button type="button" data-settings-section="security" class="w-full flex items-center gap-3 rounded-xl ${activeSettingsSection === 'security' ? 'bg-white/6 border border-softBlue2/20 text-white' : 'text-slate-300 hover:bg-white/5'} px-4 py-3 text-left transition">
                <i class="fa-solid fa-shield-halved text-softBlue2 text-sm"></i>
                <span class="text-sm font-semibold">Security</span>
              </button>
              <button type="button" data-settings-section="workspace" class="w-full flex items-center gap-3 rounded-xl ${activeSettingsSection === 'workspace' ? 'bg-white/6 border border-softBlue2/20 text-white' : 'text-slate-300 hover:bg-white/5'} px-4 py-3 text-left transition">
                <i class="fa-solid fa-sliders text-softBlue2 text-sm"></i>
                <span class="text-sm font-semibold">Workspace</span>
              </button>
            <button type="button" data-settings-section="links" class="w-full flex items-center gap-3 rounded-xl ${activeSettingsSection === 'links' ? 'bg-white/6 border border-softBlue2/20 text-white' : 'text-slate-300 hover:bg-white/5'} px-4 py-3 text-left transition">
              <i class="fa-solid fa-link text-softBlue2 text-sm"></i>
              <span class="text-sm font-semibold">Links</span>
            </button>
          </nav>

            <div class="mt-auto p-3 border-t border-white/10">
              <button type="button" id="settings-back-btn" class="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-300 hover:bg-white/5 transition">
                <i class="fa-solid fa-arrow-left text-softBlue2 text-sm"></i>
                <span class="text-sm font-semibold">Back To Hub</span>
              </button>
            </div>
          </div>
        </aside>

        <section class="flex-1 min-h-full bg-transparent">
          <div class="px-10 py-6 border-b border-slate-200 bg-white flex items-center justify-end">
            <div class="flex items-center gap-3 text-sm text-steel">
              <span>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span class="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
                <span class="h-1.5 w-1.5 rounded-full bg-teal"></span>
                Desk Secured
              </span>
            </div>
          </div>

          <div class="px-10 py-6">
            ${getSettingsContentMarkup()}
          </div>
        </section>
      </div>
    `;

    canvas.querySelectorAll('[data-settings-section]').forEach((button) => {
      button.addEventListener('click', () => {
        activeSettingsSection = button.getAttribute('data-settings-section');
        renderCanvas();
      });
    });
    canvas.querySelector('#settings-back-btn')?.addEventListener('click', () => activateTab(null));
    canvas.querySelector('#settings-export-contacts')?.addEventListener('click', () => exportToJSON(loadContacts() || []));
    canvas.querySelector('#settings-open-contacts')?.addEventListener('click', () => activateTab('contacts'));
    if (activeSettingsSection === 'links') {
      setupLinksManager();
    } else if (activeSettingsSection === 'security') {
      setupSecuritySettings();
    } else if (activeSettingsSection === 'account') {
      setupAccountSettings();
    }
    updateGlobalSearchAvailability();
    return;
  }

  // Restore standard canvas padding for non-module tabs
  canvas.className = 'flex-1 p-8 overflow-y-auto flex flex-col justify-between relative bg-softBlue1';

  if (activeTab === null) {
    // Default Empty State
    canvas.innerHTML = `
      <div class="max-w-2xl w-full mx-auto my-auto flex flex-col items-center text-center p-8 border border-dashed border-steel/30 rounded-xl bg-white/40 shadow-sm">
          <div class="h-12 w-12 rounded-full bg-softBlue2/50 flex items-center justify-center mb-4">
              <i class="fa-solid fa-folder-open text-navy text-lg"></i>
          </div>

          <h2 class="text-base font-bold tracking-tight text-navy mb-1.5">Central Application Canvas</h2>
          <p class="text-xs text-steel max-w-sm mx-auto leading-relaxed mb-4">
              Open specific mortgage pipelines to interact with active customer data files. Right side drawer provides local workspace shortcuts.
          </p>

          <div class="inline-flex items-center gap-2 bg-[#EDF4FB] text-steel px-3.5 py-1.5 rounded-md text-[11px] font-medium border border-softBlue2/60">
              <i class="fa-solid fa-circle-info text-gold text-xs"></i>
              <span>Manage workspace components directly using the Utility Deck.</span>
          </div>
      </div>

      <div class="w-full flex items-center justify-between text-[10px] text-steel mt-auto pt-4 border-t border-softBlue2/40">
          <span class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-green animate-pulse"></span>
              Terminal Session Connected
          </span>
          <span>System Protocol: MLG-HUD-2026-X9</span>
      </div>
    `;
  } else {
    // Active Tab Placeholder (Tasks, Contacts)
    const tabName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

    let iconClass = 'fa-solid fa-list-check';
    if (activeTab === 'contacts') iconClass = 'fa-solid fa-users';

    canvas.innerHTML = `
      <div class="max-w-2xl w-full mx-auto my-auto flex flex-col items-center text-center p-8 border border-dashed border-steel/30 rounded-xl bg-white/40 shadow-sm">
          <div class="h-12 w-12 rounded-full bg-softBlue2/50 flex items-center justify-center mb-4">
              <i class="${iconClass} text-navy text-lg"></i>
          </div>

          <h2 class="text-base font-bold tracking-tight text-navy mb-1.5">${tabName}</h2>
          <p class="text-xs text-steel max-w-sm mx-auto leading-relaxed mb-4">
              This module will be built in an upcoming step.
          </p>
      </div>

      <div class="w-full flex items-center justify-between text-[10px] text-steel mt-auto pt-4 border-t border-softBlue2/40">
          <span class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-green animate-pulse"></span>
              Terminal Session Connected
          </span>
          <span>System Protocol: MLG-HUD-2026-X9</span>
      </div>
    `;
  }

  updateGlobalSearchAvailability();
}

function getUniversalSearchItems() {
  const contacts = loadContacts() || [];
  const items = [
    {
      id: 'nav-home',
      title: 'Open Home',
      subtitle: 'Workspace',
      keywords: 'dashboard home workspace canvas',
      iconClass: 'fa-solid fa-house',
      kind: 'Module',
      run: () => activateTab(null),
    },
    {
      id: 'nav-tasks',
      title: 'Open Tasks',
      subtitle: 'Module',
      keywords: 'tasks to do checklist',
      iconClass: 'fa-solid fa-list-check',
      kind: 'Module',
      run: () => activateTab('tasks'),
    },
    {
      id: 'nav-contacts',
      title: 'Open Contacts',
      subtitle: 'Module',
      keywords: 'contacts people directory',
      iconClass: 'fa-solid fa-users',
      kind: 'Module',
      run: () => activateTab('contacts'),
    },
    {
      id: 'nav-vault',
      title: 'Open Vault',
      subtitle: 'Module',
      keywords: 'vault passwords secure',
      iconClass: 'fa-solid fa-vault',
      kind: 'Module',
      run: () => activateTab('vault'),
    },
    {
      id: 'nav-settings',
      title: 'Open Settings',
      subtitle: 'Workspace',
      keywords: 'settings preferences account privacy workspace backup',
      iconClass: 'fa-solid fa-gear',
      kind: 'Module',
      run: () => activateTab('settings'),
    },
    {
      id: 'contacts-add',
      title: 'Add Contact',
      subtitle: 'Quick Action',
      keywords: 'new create add contact',
      iconClass: 'fa-solid fa-user-plus',
      kind: 'Action',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.openAddModal?.());
      },
    },
    {
      id: 'contacts-all',
      title: 'Show All Contacts',
      subtitle: 'Filter',
      keywords: 'contacts all filter everyone',
      iconClass: 'fa-solid fa-users',
      kind: 'Filter',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.setFilter?.('all'));
      },
    },
    {
      id: 'contacts-personal',
      title: 'Show Personal Contacts',
      subtitle: 'Filter',
      keywords: 'contacts personal friends clients',
      iconClass: 'fa-solid fa-user',
      kind: 'Filter',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.setFilter?.('personal'));
      },
    },
    {
      id: 'contacts-business',
      title: 'Show Business Contacts',
      subtitle: 'Filter',
      keywords: 'contacts business partners lenders',
      iconClass: 'fa-solid fa-briefcase',
      kind: 'Filter',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.setFilter?.('business'));
      },
    },
    {
      id: 'contacts-starred',
      title: 'Show Starred Contacts',
      subtitle: 'Filter',
      keywords: 'contacts favorites starred important',
      iconClass: 'fa-solid fa-star',
      kind: 'Filter',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.setFilter?.('starred'));
      },
    },
    {
      id: 'contacts-export',
      title: 'Export Contacts',
      subtitle: 'Quick Action',
      keywords: 'contacts export backup json',
      iconClass: 'fa-solid fa-download',
      kind: 'Action',
      run: () => exportToJSON(loadContacts() || []),
    },
    {
      id: 'contacts-import',
      title: 'Import Contacts',
      subtitle: 'Quick Action',
      keywords: 'contacts import upload json',
      iconClass: 'fa-solid fa-upload',
      kind: 'Action',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.triggerImport?.());
      },
    },
  ];

  contacts.forEach((contact) => {
    items.push({
      id: `contact-${contact.id}`,
      title: contact.name,
      subtitle: contact.company || contact.phone || 'Contact',
      keywords: `${contact.name} ${contact.email || ''} ${contact.phone || ''} ${contact.company || ''} ${(contact.tags || []).join(' ')}`.toLowerCase(),
      iconClass: contact.favorite ? 'fa-solid fa-star' : 'fa-regular fa-address-card',
      kind: 'Contact',
      run: () => {
        activateTab('contacts');
        requestAnimationFrame(() => activeModule?.openDetail?.(contact.id));
      },
    });
  });

  return items;
}

function filterUniversalSearchItems(query) {
  const normalized = query.trim().toLowerCase();
  const items = getUniversalSearchItems();

  if (!normalized) {
    return items.slice(0, 10);
  }

  return items
    .map((item) => {
      const haystack = `${item.title} ${item.subtitle} ${item.keywords} ${item.kind}`.toLowerCase();
      const score = haystack.includes(normalized)
        ? (item.title.toLowerCase().startsWith(normalized) ? 3 : 1)
        : 0;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map(({ item }) => item)
    .slice(0, 12);
}

function renderUniversalSearchResults() {
  globalSearchResults.innerHTML = universalResults.map((item, index) => {
    const isActive = index === universalActiveIndex;
    const activeClass = isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100';
    const mutedClass = isActive ? 'text-slate-300' : 'text-slate-500';
    const badgeClass = isActive ? 'border-white/15 bg-white/10 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-500';
    return `
      <button
        type="button"
        data-search-index="${index}"
        class="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeClass}"
      >
        <div class="flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-white/10' : 'bg-slate-100'}">
          <i class="${item.iconClass} ${isActive ? 'text-white' : 'text-slate-500'} text-sm"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">${item.title}</p>
          <p class="truncate text-xs ${mutedClass}">${item.subtitle}</p>
        </div>
        <span class="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${badgeClass}">
          ${item.kind}
        </span>
      </button>
    `;
  }).join('');

  globalSearchEmpty.classList.toggle('hidden', universalResults.length !== 0);
  globalSearchResults.classList.toggle('hidden', universalResults.length === 0);
}

function updateUniversalSearchResults() {
  if (isUniversalSearchDisabled()) {
    universalResults = [];
    renderUniversalSearchResults();
    return;
  }
  universalResults = filterUniversalSearchItems(globalSearchInput.value);
  if (universalActiveIndex >= universalResults.length) {
    universalActiveIndex = 0;
  }
  renderUniversalSearchResults();
}

function openUniversalSearch() {
  if (isUniversalSearchDisabled()) return;
  universalSearchOpen = true;
  globalSearchPanel.classList.remove('hidden');
  updateUniversalSearchResults();
}

function closeUniversalSearch(clearInput = false) {
  universalSearchOpen = false;
  globalSearchPanel.classList.add('hidden');
  if (clearInput) {
    globalSearchInput.value = '';
  }
}

function runUniversalSearchResult(index) {
  const item = universalResults[index];
  if (!item) return;
  closeUniversalSearch(true);
  item.run();
}

// Initial Assembly
sidebar = createSidebar(activeTab, handleTabChange, {
  collapsed: sidebarCollapsed,
  onToggleCollapse: handleSidebarCollapse,
});
renderCanvas();

workspace.appendChild(sidebar);
workspace.appendChild(canvas);
workspace.appendChild(widgetDeck);

app.appendChild(header);
app.appendChild(workspace);

// Check for an existing Supabase session on load
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    setAuthenticated(session.access_token);
  }
  syncAuthOverlay();
})();

headerSettingsBtn?.addEventListener('click', () => activateTab('settings'));
headerAccountTrigger?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleHeaderAccountMenu();
});

headerAccountMenu?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  const action = button.getAttribute('data-account-action');
  closeHeaderAccountMenu();
  if (action === 'backup-restore') {
    showBackdrop(backupRestoreBackdrop, backupRestoreBackdrop.firstElementChild);
  }
  if (action === ‘logout’) {
    const vaultPreferences = getVaultPreferences();
    if (vaultPreferences.lockOnLogout && activeTab === ‘vault’) {
      activeModule?.lock?.();
    }
    supabase.auth.signOut();
    setAuthenticated(false);
    syncAuthOverlay();
    activateTab(null);
    showToast("You’ve been logged out");
  }
});

globalSearchInput.addEventListener('focus', openUniversalSearch);
globalSearchInput.addEventListener('click', openUniversalSearch);
globalSearchInput.addEventListener('input', () => {
  if (isUniversalSearchDisabled()) return;
  universalActiveIndex = 0;
  updateUniversalSearchResults();
});
globalSearchInput.addEventListener('keydown', (event) => {
  if (isUniversalSearchDisabled()) {
    event.preventDefault();
    return;
  }
  if (!universalSearchOpen && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    openUniversalSearch();
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (universalResults.length === 0) return;
    universalActiveIndex = (universalActiveIndex + 1) % universalResults.length;
    renderUniversalSearchResults();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (universalResults.length === 0) return;
    universalActiveIndex = (universalActiveIndex - 1 + universalResults.length) % universalResults.length;
    renderUniversalSearchResults();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    runUniversalSearchResult(universalActiveIndex);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeUniversalSearch(true);
    globalSearchInput.blur();
  }
});

globalSearchResults.addEventListener('mousemove', (event) => {
  const option = event.target.closest('[data-search-index]');
  if (!option) return;
  universalActiveIndex = Number(option.getAttribute('data-search-index'));
  renderUniversalSearchResults();
});

globalSearchResults.addEventListener('click', (event) => {
  const option = event.target.closest('[data-search-index]');
  if (!option) return;
  runUniversalSearchResult(Number(option.getAttribute('data-search-index')));
});

document.addEventListener('click', (event) => {
  if (!globalSearchShell.contains(event.target)) {
    closeUniversalSearch(false);
  }
  if (headerAccountMenu && !headerAccountMenu.classList.contains('hidden')) {
    if (!headerAccountMenu.contains(event.target) && !headerAccountTrigger?.contains(event.target)) {
      closeHeaderAccountMenu();
    }
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    focusUniversalSearch();
    return;
  }

  if (event.key === 'Escape' && universalSearchOpen) {
    closeUniversalSearch(true);
  }
  if (event.key === 'Escape') {
    closeHeaderAccountMenu();
    hideBackdrop(backupRestoreBackdrop, backupRestoreBackdrop.firstElementChild);
  }
});

window.addEventListener('vault-lock-state-changed', updateGlobalSearchAvailability);

backupRestoreBackdrop.querySelector('#backup-restore-close')?.addEventListener('click', () => {
  hideBackdrop(backupRestoreBackdrop, backupRestoreBackdrop.firstElementChild);
});

backupRestoreBackdrop.addEventListener('click', (event) => {
  if (event.target === backupRestoreBackdrop) {
    hideBackdrop(backupRestoreBackdrop, backupRestoreBackdrop.firstElementChild);
  }
});

backupRestoreBackdrop.querySelector('#backup-export-btn')?.addEventListener('click', () => {
  exportToJSON(loadContacts() || []);
});

backupRestoreBackdrop.querySelector('#backup-restore-input')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  importFromJSON(
    file,
    (importedContacts) => {
      const { migrated } = migrateContacts(importedContacts);
      saveContacts(migrated);
      if (activeTab === 'contacts') {
        renderCanvas();
      }
      hideBackdrop(backupRestoreBackdrop, backupRestoreBackdrop.firstElementChild);
    },
    () => {}
  );
  event.target.value = '';
});

authOverlay.querySelector('#auth-signin-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = authOverlay.querySelector('#auth-email')?.value.trim();
  const password = authOverlay.querySelector('#auth-password')?.value.trim();
  const errorEl = authOverlay.querySelector('#auth-error');
  const submitBtn = authOverlay.querySelector('#auth-submit-btn');
  const submitLabel = authOverlay.querySelector('#auth-submit-label');
  if (!email || !password) return;

  errorEl.classList.add('hidden');
  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitLabel.textContent = 'Signing in…';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      errorEl.textContent = error?.message || 'Invalid email or password.';
      errorEl.classList.remove('hidden');
    } else {
      setAuthenticated(data.session.access_token);
      syncAuthOverlay();
    }
  } catch {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitLabel.textContent = 'Sign In';
  }
});

// Initial Lucide setup
if (window.lucide) {
  window.lucide.createIcons();
}
