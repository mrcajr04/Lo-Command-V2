/**
 * Vault Module
 * PIN-locked credential manager with AES-GCM local encryption.
 */
import { deriveKey, encryptData, decryptData, generateSalt } from './crypto.js';
import { hasVaultData, getVaultSalt, getVaultIv, getVaultCiphertext, saveVaultData } from './storage.js';

// Default mock data to initialize on first run
const DEFAULT_CREDENTIALS = [
  {
    id: '1',
    category: 'websites',
    name: 'Encompass LOS Portal',
    url: 'encompass.elliemae.com',
    username: 'NMLS_ID_482910',
    email: 'alex.mlo@apexmortgage.com',
    password: 'Enc$99ShieldOrigination!',
    notes: 'Primary loan application system. Recovery answer: Bluebird.',
    createdDate: new Date().toISOString()
  },
  {
    id: '2',
    category: 'websites',
    name: 'Optimal Blue Pricing Engine',
    url: 'optimalblue.com/login',
    username: 'alex.pricing@apexmortgage.com',
    email: 'alex.mlo@apexmortgage.com',
    password: 'Opt_Blue!8271_Pricing',
    notes: 'Interest rates sheet & loan scenarios calculation tool. Checked daily.',
    createdDate: new Date().toISOString()
  },
  {
    id: '3',
    category: 'emails',
    name: 'Outlook Company Email',
    url: 'outlook.office.com',
    username: 'alex.mlo@apexmortgage.com',
    email: 'alex.mlo@apexmortgage.com',
    password: 'Out_Lock_Primary_##2026',
    notes: 'Email associated with the brokerage and client pipelines.',
    createdDate: new Date().toISOString()
  }
];

export function createVaultModule() {
  const container = document.createElement('div');
  container.className = 'w-full flex-grow flex flex-col min-h-0';

  // Module state
  let isLocked = true;
  let enteredPin = '';
  let activeCategory = 'all';
  let searchQuery = '';
  let items = []; // Decrypted credentials list
  let expandedItems = new Set(); // Tracks expanded details tray IDs
  let derivedKey = null; // In-memory cryptographic key (never stored)
  let isProcessing = false; // Prevents double submission during crypto actions
  const AUTO_LOCK_MS = 5 * 60 * 1000;
  let autoLockDeadline = null;
  let autoLockIntervalId = null;

  // Initial markup structure
  container.innerHTML = `
    <!-- Toast Container -->
    <div id="vault-toast-container" class="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none"></div>

    <!-- ================= LOCK SCREEN ================= -->
    <section id="vault-lock-screen" class="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-slate-900/35 backdrop-blur-xl transition-all duration-300">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.32),rgba(15,23,42,0.54))]"></div>
        <div class="relative w-full max-w-sm px-6">
            <div id="vault-lockpad-card" class="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))] px-8 py-6 text-center shadow-[0_28px_70px_rgba(15,23,42,0.45)] ring-1 ring-white/5 transition-all backdrop-blur-sm select-none">
                <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/25 bg-gold/8 text-gold shadow-[0_0_0_1px_rgba(201,160,44,0.08)]">
                    <i data-lucide="lock" class="w-6 h-6"></i>
                </div>
                <h1 class="text-[1.75rem] font-extrabold tracking-tight text-white">Credential Vault</h1>
                <p class="mt-2 text-sm leading-6 text-slate-300">Unlock to reveal saved credentials and email accounts</p>

                <div class="flex justify-center gap-3 mb-6 mt-5">
                    <div class="pin-dot w-3 h-3 rounded-full border border-white/15 bg-transparent shadow-inner transition-all duration-150"></div>
                    <div class="pin-dot w-3 h-3 rounded-full border border-white/15 bg-transparent shadow-inner transition-all duration-150"></div>
                    <div class="pin-dot w-3 h-3 rounded-full border border-white/15 bg-transparent shadow-inner transition-all duration-150"></div>
                    <div class="pin-dot w-3 h-3 rounded-full border border-white/15 bg-transparent shadow-inner transition-all duration-150"></div>
                </div>

                <div class="grid grid-cols-3 gap-3 max-w-[210px] mx-auto select-none">
                    <button data-key="1" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">1</button>
                    <button data-key="2" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">2</button>
                    <button data-key="3" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">3</button>

                    <button data-key="4" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">4</button>
                    <button data-key="5" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">5</button>
                    <button data-key="6" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">6</button>

                    <button data-key="7" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">7</button>
                    <button data-key="8" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">8</button>
                    <button data-key="9" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">9</button>

                    <button id="btn-clear" class="h-12 rounded-full border border-gold/20 bg-gold/8 text-gold text-[11px] font-bold uppercase transition-all hover:bg-gold/14 focus:outline-none">Clear</button>
                    <button data-key="0" class="h-12 rounded-full border border-white/12 bg-white/7 text-white text-[1.35rem] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-white/20 hover:bg-white/12 focus:outline-none">0</button>
                    <button id="btn-backspace" class="h-12 rounded-full border border-gold/20 bg-gold/8 text-gold flex items-center justify-center transition-all hover:bg-gold/14 focus:outline-none">
                        <i data-lucide="delete" class="w-4.5 h-4.5"></i>
                    </button>
                </div>

                <div class="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gold/16 bg-gold/8 px-4 py-2 text-[11px] font-semibold text-gold">
                    <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
                    <span>Protected with Vault PIN</span>
                </div>
            </div>
        </div>
    </section>

    <!-- ================= APP DASHBOARD ================= -->
    <main id="vault-dashboard" class="hidden flex-grow flex flex-col overflow-hidden bg-softBlue1">
        <!-- Header -->
        <header class="bg-navy border-b-2 border-gold py-3 text-white shadow-md flex-shrink-0 select-none">
            <div class="max-w-7xl mx-auto px-8 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-white/10 border border-gold/35 rounded-xl text-gold">
                        <i data-lucide="shield" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <span class="text-sm font-bold block tracking-wide text-white leading-tight">Mortgage Credentials Vault</span>
                        <span class="text-[10px] text-softBlue2 font-medium">Secure PBKDF2/AES-GCM Local Sandbox</span>
                    </div>
                </div>

                <div class="flex items-center gap-2.5">
                    <div id="vault-timer-pill" class="inline-flex items-center gap-1.5 rounded-lg border border-softBlue2/25 bg-white/8 px-3 py-1.5 text-xs font-semibold text-softBlue2">
                        <i data-lucide="timer-reset" class="w-3.5 h-3.5 text-gold"></i>
                        <span>Auto-lock in</span>
                        <span id="vault-timer-value" class="font-mono text-white">05:00</span>
                    </div>
                    <button id="btn-lock-vault" class="px-3 py-1.5 rounded-lg text-xs border border-softBlue2/30 hover:border-red-400/45 text-softBlue2 hover:text-red-300 hover:bg-red-950/20 transition-all flex items-center gap-1.5 focus:outline-none">
                        <i data-lucide="lock" class="w-3.5 h-3.5"></i> Lock Vault
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Viewport -->
        <div class="flex-grow max-w-7xl w-full mx-auto px-8 py-5 flex flex-col min-h-0">
            <!-- Search & Actions -->
            <div class="flex flex-col sm:flex-row gap-4 mb-5 flex-shrink-0">
                <div class="relative flex-grow">
                    <input type="text" id="vault-search" placeholder="Search credentials (e.g. Encompass, Credit, DU)..." class="w-full bg-white border-2 border-softBlue2 focus:border-steel outline-none rounded-2xl py-3 pl-12 pr-4 text-sm text-navy placeholder-steel/60 shadow-sm transition-all">
                    <i data-lucide="search" class="w-4.5 h-4.5 text-steel absolute left-4 top-3.5"></i>
                </div>
                <button id="btn-add-password" class="py-3 px-5 rounded-2xl bg-steel hover:bg-navy text-white font-bold flex items-center justify-center gap-2 shadow-md hover:shadow transition-colors text-sm shrink-0 focus:outline-none">
                    <i data-lucide="plus" class="w-4.5 h-4.5"></i> Add Password
                </button>
            </div>

            <!-- Category Filters -->
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5 flex-shrink-0 select-none">
                <button data-cat="all" id="cat-all" class="cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 border-softBlue2 bg-softBlue2 text-navy text-center transition-all focus:outline-none">All Systems</button>
                <button data-cat="emails" id="cat-emails" class="cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 border-transparent bg-white text-steel text-center transition-all hover:bg-lightGray focus:outline-none">Emails</button>
                <button data-cat="social" id="cat-social" class="cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 border-transparent bg-white text-steel text-center transition-all hover:bg-lightGray focus:outline-none">Social</button>
                <button data-cat="banking" id="cat-banking" class="cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 border-transparent bg-white text-steel text-center transition-all hover:bg-lightGray focus:outline-none">Banking</button>
                <button data-cat="websites" id="cat-websites" class="cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 border-transparent bg-white text-steel text-center transition-all hover:bg-lightGray focus:outline-none">Portals</button>
            </div>

            <!-- Scrollable Ledger List -->
            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 min-h-0">
                <!-- Search Empty State -->
                <div id="vault-empty-state" class="hidden flex-col items-center justify-center py-8 px-4 bg-white/50 border-2 border-dashed border-softBlue2 rounded-xl text-center select-none">
                    <i data-lucide="search" class="w-8 h-8 text-steel mb-2"></i>
                    <h3 class="text-xs font-semibold text-navy">No credentials found</h3>
                    <p class="text-[10px] text-steel max-w-xs mt-1">Try refining your search keyword or add a new entry.</p>
                </div>

                <div id="vault-credential-grid" class="flex flex-col gap-3 pb-5">
                    <!-- Dynamic list items -->
                </div>
            </div>
        </div>

        <!-- Footer -->
        <footer class="border-t border-softBlue2 bg-white py-3 text-center text-[10px] text-steel font-medium flex-shrink-0 select-none">
            <div class="max-w-7xl mx-auto px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
                <p class="text-left max-w-md leading-relaxed text-slate-400">
                    PIN-based local encryption. Suitable for personal use on a trusted device — not a substitute for a dedicated password manager for highly sensitive accounts.
                </p>
                <button id="btn-change-pin" class="hover:text-navy transition-colors flex items-center gap-1 font-bold text-steel focus:outline-none">
                    <i data-lucide="key-round" class="w-3 h-3"></i> Set Custom Master PIN
                </button>
            </div>
        </footer>
    </main>

    <!-- ================= ADD / EDIT MODAL ================= -->
    <div id="vault-modal-backdrop" class="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm hidden items-center justify-center p-4 transition-all">
        <div id="vault-modal-content" class="bg-white border-2 border-softBlue2 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden scale-95 opacity-0 transition-all duration-150">
            <!-- Modal Header -->
            <div class="px-5 py-4 border-b border-softBlue2 flex items-center justify-between bg-lightGray select-none">
                <div>
                    <h3 id="vault-modal-title" class="text-sm font-bold text-navy">New Credential</h3>
                    <p class="text-[10px] text-steel mt-0.5">Required fields are marked *</p>
                </div>
                <button id="btn-modal-close" class="p-1 hover:bg-softBlue2 rounded-lg text-steel hover:text-navy transition-colors focus:outline-none">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <!-- Form -->
            <form id="vault-credential-form" class="p-5 space-y-4">
                <input type="hidden" id="form-item-id">
                
                <div>
                    <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">Category *</label>
                    <select id="form-category" required class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy font-semibold focus:border-steel outline-none">
                        <option value="emails">Emails</option>
                        <option value="social">Social Networks</option>
                        <option value="banking">Banking & Finance</option>
                        <option value="websites">Websites / Apps / Portals</option>
                    </select>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">System Name *</label>
                        <input type="text" id="form-name" required placeholder="e.g. Encompass" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy focus:border-steel outline-none">
                    </div>
                    <div>
                        <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">Direct URL</label>
                        <input type="text" id="form-url" placeholder="e.g. encompass.com" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy focus:border-steel outline-none">
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">Username / ID *</label>
                        <input type="text" id="form-username" required placeholder="Enter login ID" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy focus:border-steel outline-none">
                    </div>
                    <div>
                        <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">Associated Email</label>
                        <input type="email" id="form-email" placeholder="Linked email address" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy focus:border-steel outline-none">
                    </div>
                </div>

                <div>
                    <div class="flex justify-between items-center mb-1 select-none">
                        <label class="text-[9px] font-bold uppercase tracking-wider text-steel">Password *</label>
                        <button type="button" id="btn-generate-password" class="text-[10px] text-gold hover:underline font-bold flex items-center gap-0.5 focus:outline-none">
                            <i data-lucide="sparkles" class="w-3 h-3"></i> Make Safe Key
                        </button>
                    </div>
                    <div class="relative">
                        <input type="text" id="form-password" required placeholder="Enter password or auto-generate" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg py-1.5 pl-2.5 pr-9 text-xs text-navy font-mono focus:border-steel outline-none">
                        <button type="button" id="btn-toggle-form-pw" class="absolute right-2.5 top-2 text-steel hover:text-navy transition-colors focus:outline-none">
                            <i data-lucide="eye" id="form-pw-eye" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>

                <div>
                    <label class="block text-[9px] font-bold uppercase tracking-wider text-steel mb-1">Helper Notes / Hints</label>
                    <textarea id="form-notes" rows="2" placeholder="e.g. security questions answer: Bluebird" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-2.5 py-1.5 text-xs text-navy focus:border-steel outline-none resize-none"></textarea>
                </div>

                <div class="pt-4 border-t border-softBlue2 flex items-center justify-end gap-2 select-none">
                    <button type="button" id="btn-modal-cancel" class="px-3 py-1.5 border border-softBlue2 text-steel rounded-lg text-xs font-semibold hover:text-navy hover:bg-lightGray transition-colors focus:outline-none">Cancel</button>
                    <button type="submit" id="btn-modal-save" class="px-3.5 py-1.5 bg-steel hover:bg-navy text-white rounded-lg text-xs font-bold transition-colors focus:outline-none">Save Securely</button>
                </div>
            </form>
        </div>
    </div>

    <!-- ================= MASTER PIN CHANGE MODAL ================= -->
    <div id="vault-pin-modal-backdrop" class="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm hidden items-center justify-center p-4 transition-all">
        <div id="vault-pin-modal-content" class="bg-white border-2 border-softBlue2 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden scale-95 opacity-0 transition-all duration-150">
            <div class="p-4 border-b border-softBlue2 flex items-center justify-between bg-lightGray select-none">
                <h3 class="text-sm font-bold text-navy">Change Master PIN</h3>
                <button id="btn-pin-modal-close" class="p-1 hover:bg-softBlue2 rounded-lg text-steel hover:text-navy transition-colors focus:outline-none">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <form id="vault-pin-change-form" class="p-4 space-y-3.5">
                <div>
                    <label class="block text-[10px] font-bold text-steel uppercase tracking-wider mb-1">Current 4-digit PIN</label>
                    <input type="password" id="pin-old" maxlength="4" pattern="[0-9]{4}" required placeholder="Type current PIN" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-3 py-1.5 text-xs text-navy tracking-widest text-center focus:border-steel outline-none font-mono">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-steel uppercase tracking-wider mb-1">New 4-digit PIN</label>
                    <input type="password" id="pin-new" maxlength="4" pattern="[0-9]{4}" required placeholder="Type new PIN" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-3 py-1.5 text-xs text-navy tracking-widest text-center focus:border-steel outline-none font-mono">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-steel uppercase tracking-wider mb-1">Confirm New 4-digit PIN</label>
                    <input type="password" id="pin-confirm" maxlength="4" pattern="[0-9]{4}" required placeholder="Confirm new PIN" class="w-full bg-lightGray border-2 border-softBlue2 rounded-lg px-3 py-1.5 text-xs text-navy tracking-widest text-center focus:border-steel outline-none font-mono">
                </div>
                <div class="pt-3 border-t border-softBlue2 flex items-center justify-end gap-2 select-none">
                    <button type="button" id="btn-pin-modal-cancel" class="px-3.5 py-1.5 border border-softBlue2 text-steel rounded-lg text-xs hover:text-navy hover:bg-lightGray transition-all focus:outline-none">Cancel</button>
                    <button type="submit" id="btn-pin-modal-save" class="px-4 py-2 bg-steel hover:bg-navy text-white rounded-lg text-xs font-bold transition-all focus:outline-none">Update PIN</button>
                </div>
            </form>
        </div>
    </div>
  `;

  // Get DOM nodes
  const lockScreen = container.querySelector('#vault-lock-screen');
  const dashboard = container.querySelector('#vault-dashboard');
  const lockpadCard = container.querySelector('#vault-lockpad-card');
  const pinDots = container.querySelectorAll('.pin-dot');
  
  const searchInput = container.querySelector('#vault-search');
  const btnAddPassword = container.querySelector('#btn-add-password');
  const btnLockVault = container.querySelector('#btn-lock-vault');
  const btnChangePin = container.querySelector('#btn-change-pin');
  const timerValue = container.querySelector('#vault-timer-value');
  
  const categoryTabs = container.querySelectorAll('.cat-tab');
  const emptyState = container.querySelector('#vault-empty-state');
  const credentialGrid = container.querySelector('#vault-credential-grid');
  
  const modalBackdrop = container.querySelector('#vault-modal-backdrop');
  const modalContent = container.querySelector('#vault-modal-content');
  const modalTitle = container.querySelector('#vault-modal-title');
  const credentialForm = container.querySelector('#vault-credential-form');
  const btnModalClose = container.querySelector('#btn-modal-close');
  const btnModalCancel = container.querySelector('#btn-modal-cancel');
  const btnGeneratePassword = container.querySelector('#btn-generate-password');
  const btnToggleFormPw = container.querySelector('#btn-toggle-form-pw');
  const formPassword = container.querySelector('#form-password');
  const formPwEye = container.querySelector('#form-pw-eye');

  const pinModalBackdrop = container.querySelector('#vault-pin-modal-backdrop');
  const pinModalContent = container.querySelector('#vault-pin-modal-content');
  const pinChangeForm = container.querySelector('#vault-pin-change-form');
  const btnPinModalClose = container.querySelector('#btn-pin-modal-close');
  const btnPinModalCancel = container.querySelector('#btn-pin-modal-cancel');
  const categoryTabBaseClass = 'cat-tab py-2.5 px-4 rounded-xl text-xs font-bold border-2 text-center transition-all focus:outline-none';
  const categoryTabInactiveClass = `${categoryTabBaseClass} border-transparent bg-white text-steel hover:bg-lightGray`;
  const categoryTabActiveClass = `${categoryTabBaseClass} border-softBlue2 bg-softBlue2 text-navy`;

  // Initialize vault with default PIN on first load
  async function ensureInitialized() {
    if (!hasVaultData()) {
      try {
        const salt = generateSalt();
        const key = await deriveKey('1234', salt);
        const { ciphertext, iv } = await encryptData(key, DEFAULT_CREDENTIALS);
        saveVaultData(salt, iv, ciphertext);
      } catch (err) {
        console.error('Failed to initialize default vault:', err);
      }
    }
  }

  // --- Lockpad input handling ---
  function pressPin(digit) {
    if (isProcessing) return;
    if (enteredPin.length < 4) {
      enteredPin += digit;
      updatePinDots();
    }
    if (enteredPin.length === 4) {
      isProcessing = true;
      setTimeout(verifyEnteredPin, 100);
    }
  }

  function clearPin() {
    if (isProcessing) return;
    enteredPin = '';
    updatePinDots();
  }

  function backspacePin() {
    if (isProcessing) return;
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
  }

  function updatePinDots() {
    pinDots.forEach((dot, index) => {
      if (index < enteredPin.length) {
        dot.classList.add('bg-gold', 'border-gold', 'scale-110', 'shadow-[0_0_16px_rgba(201,160,44,0.35)]');
        dot.classList.remove('border-white/15');
      } else {
        dot.classList.remove('bg-gold', 'border-gold', 'scale-110', 'shadow-[0_0_16px_rgba(201,160,44,0.35)]');
        dot.classList.add('border-white/15');
      }
    });
  }

  async function verifyEnteredPin() {
    try {
      const salt = getVaultSalt();
      const ciphertext = getVaultCiphertext();
      const iv = getVaultIv();

      if (!salt || !ciphertext || !iv) {
        showToast('Vault files corrupted. Clearing...', 'error');
        isProcessing = false;
        clearPin();
        return;
      }

      // Derivation + Decryption
      const key = await deriveKey(enteredPin, salt);
      const decryptedData = await decryptData(key, ciphertext, iv);

      // Store key & items in memory
      derivedKey = key;
      items = decryptedData.map(item => ({ ...item, visible: false }));
      
      showToast('Access Approved');
      unlockVault();
    } catch (err) {
      // Decryption failed (wrong PIN)
      lockpadCard.classList.add('animate-shake', 'border-red-400/80');
      showToast('Wrong PIN. Check hint.', 'error');
      
      enteredPin = '';
      updatePinDots();

      setTimeout(() => {
        lockpadCard.classList.remove('animate-shake', 'border-red-400/80');
      }, 300);
    } finally {
      isProcessing = false;
    }
  }

  function unlockVault() {
    isLocked = false;
    lockScreen.classList.add('opacity-0', 'pointer-events-none');
    dashboard.classList.remove('hidden');
    
    renderVaultItems();
    startAutoLockTimer();
    window.dispatchEvent(new CustomEvent('vault-lock-state-changed'));
    window.removeEventListener('keydown', handleLockpadKeyboard);
  }

  function lockVault(reason = 'manual') {
    isLocked = true;
    enteredPin = '';
    derivedKey = null;
    items = [];
    stopAutoLockTimer();
    updatePinDots();
    
    lockScreen.classList.remove('opacity-0', 'pointer-events-none');
    dashboard.classList.add('hidden');
    
    showToast(reason === 'timeout' ? 'Vault auto-locked after 5 minutes.' : 'Safe-locked', 'info');
    window.dispatchEvent(new CustomEvent('vault-lock-state-changed'));
    window.addEventListener('keydown', handleLockpadKeyboard);
  }

  function formatRemainingTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function updateAutoLockTimerDisplay() {
    if (!timerValue) return;
    const remaining = autoLockDeadline ? Math.max(0, autoLockDeadline - Date.now()) : AUTO_LOCK_MS;
    timerValue.textContent = formatRemainingTime(remaining);
  }

  function resetAutoLockTimer() {
    if (isLocked) return;
    autoLockDeadline = Date.now() + AUTO_LOCK_MS;
    updateAutoLockTimerDisplay();
  }

  function stopAutoLockTimer() {
    autoLockDeadline = null;
    if (autoLockIntervalId) {
      clearInterval(autoLockIntervalId);
      autoLockIntervalId = null;
    }
    updateAutoLockTimerDisplay();
  }

  function startAutoLockTimer() {
    resetAutoLockTimer();
    if (autoLockIntervalId) {
      clearInterval(autoLockIntervalId);
    }
    autoLockIntervalId = setInterval(() => {
      if (isLocked || !autoLockDeadline) return;
      const remaining = autoLockDeadline - Date.now();
      if (remaining <= 0) {
        lockVault('timeout');
        return;
      }
      updateAutoLockTimerDisplay();
    }, 1000);
  }

  function handleVaultActivity() {
    resetAutoLockTimer();
  }

  function handleLockpadKeyboard(event) {
    if (isLocked && !isProcessing) {
      if (/[0-9]/.test(event.key)) {
        pressPin(event.key);
      } else if (event.key === 'Backspace') {
        backspacePin();
      } else if (event.key === 'Escape') {
        clearPin();
      }
    }
  }

  // --- Rendering UI elements ---
  function renderVaultItems() {
    let filtered = items;
    
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.username.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      credentialGrid.innerHTML = '';
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
      return;
    }

    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    let listHTML = '';
    filtered.forEach(item => {
      const isPasswordVisible = item.visible;
      const formattedPassword = isPasswordVisible ? item.password : '••••••••••••';
      const eyeIcon = isPasswordVisible ? 'eye-off' : 'eye';
      const isExpanded = expandedItems.has(item.id);
      
      let catBadgeText = '';
      let catBadgeClass = '';
      
      if (item.category === 'emails') {
        catBadgeText = 'Email';
        catBadgeClass = 'bg-softBlue2 text-steel border-softBlue2';
      } else if (item.category === 'social') {
        catBadgeText = 'Social';
        catBadgeClass = 'bg-amber/10 text-amber border-amber/20';
      } else if (item.category === 'banking') {
        catBadgeText = 'Finance';
        catBadgeClass = 'bg-green/10 text-green border-green/20';
      } else if (item.category === 'websites') {
        catBadgeText = 'Portal';
        catBadgeClass = 'bg-teal/10 text-teal border-teal/20';
      }

      listHTML += `
      <div class="bg-white border-2 border-softBlue2 hover:border-steel rounded-2xl shadow-sm transition-all overflow-hidden">
          <div class="flex flex-col md:flex-row md:items-center justify-between px-4 py-3.5 gap-3 md:gap-5">
              
              <!-- Col 1: System Name and Badge -->
              <div class="flex items-center gap-2.5 min-w-[220px] shrink-0">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${catBadgeClass} uppercase">
                      ${catBadgeText}
                  </span>
                  <div class="truncate">
                      <h4 class="text-sm font-bold text-navy leading-none truncate">${escapeHTML(item.name)}</h4>
                      ${item.url ? `
                      <a href="https://${escapeHTML(item.url)}" target="_blank" class="text-[10px] text-steel hover:underline inline-flex items-center gap-1 mt-1.5 focus:outline-none">
                          <i data-lucide="link" class="w-3 h-3"></i> ${escapeHTML(item.url)}
                      </a>` : ''}
                  </div>
              </div>

              <!-- Col 2: Username -->
              <div class="flex items-center justify-between bg-lightGray border border-softBlue2/40 px-3 py-1 rounded-xl min-w-[170px] max-w-[220px] truncate">
                  <div class="truncate mr-1">
                      <span class="text-[8px] uppercase font-bold text-steel block leading-none">Username ID</span>
                      <span class="text-navy text-xs font-semibold font-mono truncate block select-all mt-1">${escapeHTML(item.username)}</span>
                  </div>
                  <button data-action="copy-username" data-value="${escapeHTML(item.username)}" class="p-1.5 hover:bg-softBlue2 text-steel hover:text-navy rounded-lg transition-colors shrink-0 focus:outline-none" title="Copy Username">
                      <i data-lucide="copy" class="w-4 h-4"></i>
                  </button>
              </div>

              <!-- Col 3: Password Field -->
              <div class="flex items-center justify-between bg-lightGray border border-softBlue2/40 px-3 py-1 rounded-xl min-w-[220px] max-w-[260px]">
                  <div class="truncate mr-2">
                      <span class="text-[8px] uppercase font-bold text-steel block leading-none">Password Key</span>
                      <span class="text-navy text-xs font-bold font-mono tracking-wide select-all block mt-1">${escapeHTML(formattedPassword)}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                      <button data-action="toggle-password" data-id="${item.id}" class="p-1 hover:bg-softBlue2 text-steel hover:text-navy rounded-lg transition-colors focus:outline-none" title="Show/Hide">
                          <i data-lucide="${eyeIcon}" class="w-4 h-4"></i>
                      </button>
                      <button data-action="copy-password" data-value="${escapeHTML(item.password)}" class="p-1.5 bg-softBlue2 hover:bg-steel text-navy hover:text-white rounded-lg transition-colors focus:outline-none" title="Copy Password">
                          <i data-lucide="copy" class="w-4 h-4"></i>
                      </button>
                  </div>
              </div>

              <!-- Col 4: Row Actions -->
              <div class="flex items-center justify-end gap-1.5 shrink-0 ml-auto md:ml-0">
                  <button data-action="toggle-details" data-id="${item.id}" class="p-1.5 hover:bg-lightGray text-steel rounded-xl flex items-center gap-1 text-xs font-semibold focus:outline-none" title="Helper Details">
                      <i data-lucide="info" class="w-4 h-4 text-gold"></i> Details
                      <i data-lucide="chevron-${isExpanded ? 'up' : 'down'}" class="w-3.5 h-3.5"></i>
                  </button>

                  <button data-action="edit" data-id="${item.id}" class="p-1.5 hover:bg-lightGray border border-transparent hover:border-softBlue2 text-steel hover:text-navy rounded-xl focus:outline-none" title="Edit">
                      <i data-lucide="edit-2" class="w-4 h-4"></i>
                  </button>
                  
                  <button data-action="delete" data-id="${item.id}" class="p-1.5 hover:bg-red-50 text-red-500 rounded-xl focus:outline-none" title="Delete">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
              </div>

          </div>

          <!-- Collapsible Notes Tray -->
          ${isExpanded ? `
          <div class="bg-lightGray/40 px-4 py-3 border-t border-softBlue2/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-text">
              <div class="flex-grow">
                  <span class="font-bold text-[9px] text-steel uppercase block leading-none mb-1.5">Passphrase Hint / Security notes:</span>
                  <span class="text-navy font-medium block leading-relaxed">${item.notes ? escapeHTML(item.notes) : 'No notes configured for this account.'}</span>
              </div>
              ${item.email ? `
              <div class="shrink-0 bg-white border border-softBlue2/50 px-3 py-1 rounded-lg text-[11px] flex items-center gap-1.5 select-none">
                  <span class="text-[9px] font-bold text-steel uppercase">Linked Email:</span>
                  <span class="font-mono text-navy">${escapeHTML(item.email)}</span>
              </div>` : ''}
          </div>` : ''}

      </div>
      `;
    });

    credentialGrid.innerHTML = listHTML;
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Password Actions ---
  function togglePasswordVisibility(id) {
    const item = items.find(i => i.id === id);
    if (item) {
      item.visible = !item.visible;
      renderVaultItems();
    }
  }

  async function deleteCredential(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const confirmed = window.confirm(`Are you sure you want to delete the login for "${item.name}"?`);
    if (confirmed) {
      try {
        items = items.filter(i => i.id !== id);
        
        // Encrypt and save updated items
        const salt = getVaultSalt();
        const { ciphertext, iv } = await encryptData(derivedKey, items.map(({ visible, ...rest }) => rest));
        saveVaultData(salt, iv, ciphertext);

        renderVaultItems();
        showToast(`Deleted "${item.name}"`, 'error');
      } catch (err) {
        showToast('Failed to save encryption update.', 'error');
      }
    }
  }

  function copyToClipboard(text, successMessage) {
    const tempTextarea = document.createElement('textarea');
    tempTextarea.value = text;
    tempTextarea.setAttribute('readonly', '');
    tempTextarea.style.position = 'absolute';
    tempTextarea.style.left = '-9999px';
    container.appendChild(tempTextarea);
    tempTextarea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showToast(successMessage);
      } else {
        showToast('Failed to copy', 'error');
      }
    } catch (err) {
      showToast('Unable to copy in sandbox', 'error');
    }
    
    container.removeChild(tempTextarea);
  }

  function toggleNotesExpanded(id) {
    if (expandedItems.has(id)) {
      expandedItems.delete(id);
    } else {
      expandedItems.add(id);
    }
    renderVaultItems();
  }

  // --- Form Modal Handling ---
  function openAddModal() {
    modalTitle.innerText = 'New Credential';
    credentialForm.reset();
    container.querySelector('#form-item-id').value = '';
    
    if (activeCategory !== 'all') {
      container.querySelector('#form-category').value = activeCategory;
    } else {
      container.querySelector('#form-category').value = 'websites';
    }

    formPwEye.setAttribute('data-lucide', 'eye');
    formPassword.type = 'text';

    showModal(modalBackdrop, modalContent);
  }

  function openEditModal(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    modalTitle.innerText = `Edit: ${item.name}`;
    container.querySelector('#form-item-id').value = item.id;
    container.querySelector('#form-category').value = item.category;
    container.querySelector('#form-name').value = item.name;
    container.querySelector('#form-url').value = item.url || '';
    container.querySelector('#form-username').value = item.username;
    container.querySelector('#form-email').value = item.email || '';
    container.querySelector('#form-password').value = item.password;
    container.querySelector('#form-notes').value = item.notes || '';

    formPwEye.setAttribute('data-lucide', 'eye');
    formPassword.type = 'text';

    showModal(modalBackdrop, modalContent);
  }

  function showModal(backdrop, content) {
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    
    setTimeout(() => {
      content.classList.remove('scale-95', 'opacity-0');
      content.classList.add('scale-100', 'opacity-100');
    }, 50);
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function closeModal(backdrop, content) {
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    
    setTimeout(() => {
      backdrop.classList.add('hidden');
      backdrop.classList.remove('flex');
    }, 150);
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    
    const id = container.querySelector('#form-item-id').value;
    const category = container.querySelector('#form-category').value;
    const name = container.querySelector('#form-name').value;
    const url = container.querySelector('#form-url').value;
    const username = container.querySelector('#form-username').value;
    const email = container.querySelector('#form-email').value;
    const password = container.querySelector('#form-password').value;
    const notes = container.querySelector('#form-notes').value;

    const dataItem = {
      category,
      name,
      url,
      username,
      email,
      password,
      notes,
    };

    try {
      if (id) {
        // Edit flow
        const index = items.findIndex(item => item.id === id);
        if (index !== -1) {
          items[index] = {
            ...items[index],
            ...dataItem,
            createdDate: new Date().toISOString()
          };
          showToast(`Updated "${name}"`);
        }
      } else {
        // Add flow
        const newItem = {
          id: Date.now().toString(),
          ...dataItem,
          createdDate: new Date().toISOString(),
          visible: false
        };
        items.push(newItem);
        showToast(`Saved login for "${name}"`);
      }

      // Re-encrypt the full array and overwrite in localStorage
      const salt = getVaultSalt();
      const { ciphertext, iv } = await encryptData(derivedKey, items.map(({ visible, ...rest }) => rest));
      saveVaultData(salt, iv, ciphertext);

      renderVaultItems();
      closeModal(modalBackdrop, modalContent);
    } catch (err) {
      showToast('Encryption failed. Data not saved.', 'error');
    }
  }

  function toggleFormPasswordVisibility() {
    if (formPassword.type === 'password') {
      formPassword.type = 'text';
      formPwEye.setAttribute('data-lucide', 'eye-off');
    } else {
      formPassword.type = 'password';
      formPwEye.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function fillFormPasswordWithGenerator() {
    const pw = generateMemorablePassword();
    formPassword.value = pw;
    formPassword.type = 'text';
    formPwEye.setAttribute('data-lucide', 'eye-off');
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
    showToast('Safe key assigned!');
  }

  function generateMemorablePassword() {
    const words = ['Blue', 'Sky', 'Lock', 'Vault', 'Rate', 'Loan', 'Home', 'Safe', 'Key', 'Pass', 'Firm', 'Wire', 'Gold', 'Teal', 'Navy'];
    const w1 = words[Math.floor(Math.random() * words.length)];
    const w2 = words[Math.floor(Math.random() * words.length)];
    const w3 = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${w1}-${w2}-${w3}-${num}`;
  }

  // --- Master PIN Change Modal Flows ---
  function openChangePinModal() {
    pinChangeForm.reset();
    showModal(pinModalBackdrop, pinModalContent);
  }

  async function handlePinChangeSubmit(event) {
    event.preventDefault();
    if (isProcessing) return;

    const oldPin = container.querySelector('#pin-old').value;
    const newPin = container.querySelector('#pin-new').value;
    const confirmPin = container.querySelector('#pin-confirm').value;

    if (newPin !== confirmPin) {
      showToast('New PINs do not match.', 'error');
      return;
    }

    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      showToast('PIN must be exactly 4 numbers.', 'error');
      return;
    }

    isProcessing = true;
    try {
      // Cryptographically verify old PIN by attempting to decrypt the current ciphertext with it
      const currentSalt = getVaultSalt();
      const currentCiphertext = getVaultCiphertext();
      const currentIv = getVaultIv();

      const testKey = await deriveKey(oldPin, currentSalt);
      await decryptData(testKey, currentCiphertext, currentIv);

      // Old PIN is correct. Proceed with changing master PIN.
      // Re-derive a NEW key with a NEW random salt
      const newSalt = generateSalt();
      const newKey = await deriveKey(newPin, newSalt);

      // Re-encrypt existing items with the NEW key
      const { ciphertext: newCiphertext, iv: newIv } = await encryptData(newKey, items.map(({ visible, ...rest }) => rest));
      
      // Save new salt, IV, and ciphertext to localStorage
      saveVaultData(newSalt, newIv, newCiphertext);

      // Update cached memory key
      derivedKey = newKey;

      showToast('Master Vault PIN Changed!');
      closeModal(pinModalBackdrop, pinModalContent);
    } catch (err) {
      showToast('Current PIN is incorrect.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // --- Bind Event Listeners ---
  // Lockpad Button Clicks
  container.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const digit = btn.getAttribute('data-key');
      pressPin(digit);
    });
  });

  container.querySelector('#btn-clear').addEventListener('click', clearPin);
  container.querySelector('#btn-backspace').addEventListener('click', backspacePin);

  // Search Input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    handleVaultActivity();
    renderVaultItems();
  });

  // Action Buttons
  btnAddPassword.addEventListener('click', () => {
    handleVaultActivity();
    openAddModal();
  });
  btnLockVault.addEventListener('click', () => lockVault());
  btnChangePin.addEventListener('click', () => {
    handleVaultActivity();
    openChangePinModal();
  });

  // Category Tabs
  categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      handleVaultActivity();
      activeCategory = tab.getAttribute('data-cat');
      
      categoryTabs.forEach(t => {
        t.className = categoryTabInactiveClass;
      });
      tab.className = categoryTabActiveClass;
      
      renderVaultItems();
    });
  });

  // Event Delegation for Ledger Clicks
  credentialGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    handleVaultActivity();
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const val = btn.getAttribute('data-value');

    if (action === 'copy-username') {
      copyToClipboard(val, 'Username copied');
    } else if (action === 'copy-password') {
      copyToClipboard(val, 'Password copied!');
    } else if (action === 'toggle-password') {
      togglePasswordVisibility(id);
    } else if (action === 'toggle-details') {
      toggleNotesExpanded(id);
    } else if (action === 'edit') {
      openEditModal(id);
    } else if (action === 'delete') {
      deleteCredential(id);
    }
  });

  // Add/Edit Modal Controls
  btnModalClose.addEventListener('click', () => closeModal(modalBackdrop, modalContent));
  btnModalCancel.addEventListener('click', () => closeModal(modalBackdrop, modalContent));
  credentialForm.addEventListener('submit', handleFormSubmit);
  btnGeneratePassword.addEventListener('click', fillFormPasswordWithGenerator);
  btnToggleFormPw.addEventListener('click', toggleFormPasswordVisibility);
  modalBackdrop.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) closeModal(modalBackdrop, modalContent);
  });

  // PIN Change Modal Controls
  btnPinModalClose.addEventListener('click', () => closeModal(pinModalBackdrop, pinModalContent));
  btnPinModalCancel.addEventListener('click', () => closeModal(pinModalBackdrop, pinModalContent));
  pinChangeForm.addEventListener('submit', handlePinChangeSubmit);
  pinModalBackdrop.addEventListener('click', (event) => {
    if (event.target === pinModalBackdrop) closeModal(pinModalBackdrop, pinModalContent);
  });

  container.addEventListener('pointerdown', handleVaultActivity);
  container.addEventListener('keydown', handleVaultActivity, true);

  // Simple toast trigger
  function showToast(message, type = 'success') {
    const toastContainer = container.querySelector('#vault-toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = 'flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold transition-all duration-300 transform translate-y-2 opacity-0 select-none bg-white border-softBlue2 text-navy';
    
    let iconMarkup = '<i data-lucide="check-circle" class="w-4 h-4 text-green"></i>';
    if (type === 'error') {
      iconMarkup = '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber"></i>';
    } else if (type === 'info') {
      iconMarkup = '<i data-lucide="info" class="w-4 h-4 text-steel"></i>';
    }

    toast.innerHTML = `${iconMarkup} <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    if (window.lucide) {
      window.lucide.createIcons();
    }

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 50);

    setTimeout(() => {
      toast.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => { toast.remove(); }, 300);
    }, 2500);
  }

  // Sanitize DOM inputs
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Register Keyboard Listeners
  window.addEventListener('keydown', handleLockpadKeyboard);

  // Initialization check
  ensureInitialized().then(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Return DOM node + teardown method to avoid listener leaks
  return {
    element: container,
    isUnlocked: () => !isLocked,
    destroy: () => {
      stopAutoLockTimer();
      container.removeEventListener('pointerdown', handleVaultActivity);
      container.removeEventListener('keydown', handleVaultActivity, true);
      window.removeEventListener('keydown', handleLockpadKeyboard);
    }
  };
}
