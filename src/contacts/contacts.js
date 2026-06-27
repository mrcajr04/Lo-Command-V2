import {
  loadContacts, saveContacts, initializeIfEmpty,
  exportToJSON, importFromJSON, migrateContacts
} from './storage.js';
import {
  getAvatarPalette, getInitials, renderContactCard,
  renderContactRow, renderTimelineEntry, escapeHTML
} from './render.js';

export function createContactsModule(onBack) {
  const container = document.createElement('div');
  container.className = 'flex flex-1 overflow-hidden bg-softBlue1';

  let contacts = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let sortMode = 'alpha-asc';
  let viewMode = 'grid';
  let detailContactId = null;
  let pendingDeleteId = null;
  let editingNoteId = null;
  let formTags = [];
  let formCategory = 'business';
  // Scroll thresholds (px) for the progressive compact header — measured per contact
  let compactThresholds = { contact: 9999, notes: 9999 };
  let compactHasNotes = false;
  let lastHeaderH = 112; // tracks header height to compensate scrollTop when it grows/shrinks
  let compactContactShown = false;
  let compactNotesShown = false;

  container.innerHTML = `
  <div id="ct-toast" class="fixed bottom-6 right-6 z-[60] flex flex-col space-y-3 max-w-sm w-full pointer-events-none"></div>

  <div class="flex flex-1 overflow-hidden w-full max-w-7xl mx-auto">

  <!-- MAIN CONTENT -->
  <main class="flex-grow flex flex-col gap-5 overflow-hidden px-6 pb-6 pt-0">

    <!-- Search / Sort / View row -->
    <div class="bg-white rounded-xl border border-softBlue2 p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between flex-shrink-0">
      <div class="relative w-full md:w-80">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-steel">
          <i data-lucide="search" class="w-4 h-4"></i>
        </div>
        <input id="ct-search" type="text" placeholder="Search names, phone, tags, companies..." class="w-full pl-9 pr-4 py-2 text-sm border-2 border-softBlue1 rounded-lg focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent bg-lightGray text-navy placeholder-steel/60 transition-all">
      </div>
      <div class="flex items-center justify-between w-full md:w-auto gap-4">
        <div class="flex items-center space-x-2 text-sm">
          <span class="text-steel text-xs font-bold uppercase tracking-wider whitespace-nowrap">Sort:</span>
          <select id="ct-sort" class="bg-lightGray border border-softBlue2 text-navy py-1.5 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-steel text-xs font-semibold cursor-pointer">
            <option value="alpha-asc">A – Z</option>
            <option value="alpha-desc">Z – A</option>
            <option value="recent">Recent First</option>
          </select>
        </div>
        <div class="h-5 w-px bg-softBlue2 flex-shrink-0"></div>
        <div class="flex bg-lightGray rounded-lg p-0.5 border border-softBlue1 flex-shrink-0" role="group">
          <button id="ct-view-grid" class="p-1.5 rounded-md bg-white text-navy shadow-sm transition-all focus:outline-none" title="Grid View">
            <i data-lucide="grid" class="w-4 h-4"></i>
          </button>
          <button id="ct-view-list" class="p-1.5 rounded-md text-steel hover:text-navy transition-all focus:outline-none" title="List View">
            <i data-lucide="list" class="w-4 h-4"></i>
          </button>
        </div>
        <button id="ct-export-btn" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-steel hover:text-gold hover:bg-softBlue1 rounded-lg border border-transparent transition-all focus:outline-none flex-shrink-0">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Export</span>
        </button>
        <label class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-steel hover:text-gold hover:bg-softBlue1 rounded-lg border border-transparent transition-all cursor-pointer flex-shrink-0">
          <i data-lucide="upload" class="w-4 h-4"></i>
          <span>Import</span>
          <input id="ct-import-input" type="file" accept=".json" class="hidden">
        </label>
      </div>
    </div>

    <!-- Filter pills -->
    <div class="flex flex-shrink-0 flex-wrap items-center gap-2">
      <div id="ct-filter-pills" class="flex flex-wrap items-center gap-2 min-w-0"></div>
      <button id="ct-add-btn" class="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white border border-navy shadow-sm transition-all hover:bg-steel hover:border-steel focus:outline-none flex-shrink-0">
        <i data-lucide="plus" class="w-4 h-4"></i>
        <span>Add Contact</span>
      </button>
    </div>

    <!-- Contacts output -->
    <div class="flex-grow overflow-y-auto custom-scrollbar min-h-0 pb-2">
      <div id="ct-contacts-container" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"></div>
      <div id="ct-empty-state" class="hidden flex-col items-center justify-center py-20 bg-white rounded-2xl border-2 border-dashed border-softBlue2 text-center p-6 shadow-sm">
        <div class="w-16 h-16 bg-softBlue1 rounded-2xl flex items-center justify-center text-steel mb-4 border border-softBlue2">
          <i data-lucide="folder-open" class="w-8 h-8"></i>
        </div>
        <h4 class="text-lg font-bold text-navy">No Contact Entries Match</h4>
        <p class="text-steel text-sm max-w-sm mt-1">Adjust your filter options, modify the search query, or add a new contact profile.</p>
        <button id="ct-empty-add-btn" class="mt-4 bg-navy hover:bg-steel text-white text-xs font-bold px-4 py-2 rounded-lg border border-gold transition-colors focus:outline-none">
          Create Profile Card
        </button>
      </div>
    </div>
  </main>

  </div><!-- end max-w-7xl wrapper -->

  <!-- ADD / EDIT MODAL -->
  <div id="ct-modal-backdrop" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-300 opacity-0">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-softBlue2 transform scale-95 transition-all duration-300">
      <div class="p-6 border-b border-softBlue1 flex justify-between items-center bg-lightGray flex-shrink-0">
        <div class="flex items-center space-x-2.5">
          <div id="ct-modal-icon" class="w-9 h-9 rounded-lg bg-softBlue2 text-navy flex items-center justify-center">
            <i data-lucide="user-plus" class="w-5 h-5"></i>
          </div>
          <h3 id="ct-modal-title" class="text-lg font-bold text-navy">Create Profile</h3>
        </div>
        <button id="ct-modal-close" class="text-steel hover:text-navy hover:bg-softBlue1 p-1.5 rounded-lg transition-colors focus:outline-none">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="ct-contact-form" class="p-6 space-y-4 overflow-y-auto flex-grow custom-scrollbar">
        <input type="hidden" id="form-contact-id">

        <div>
          <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Full Name *</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="user" class="w-4 h-4"></i></span>
            <input type="text" id="form-name" required placeholder="e.g., Sandra Reeves" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Phone *</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="phone" class="w-4 h-4"></i></span>
              <input type="tel" id="form-phone" required placeholder="(305) 000-0000" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Email</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="mail" class="w-4 h-4"></i></span>
              <input type="email" id="form-email" placeholder="email@domain.com" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all">
            </div>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Birthday</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="calendar-days" class="w-4 h-4"></i></span>
            <input type="date" id="form-birthday" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all [color-scheme:light]">
          </div>
        </div>

        <div id="ct-business-fields" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Company</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="building" class="w-4 h-4"></i></span>
              <input type="text" id="form-company" placeholder="Company name" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Role</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-steel"><i data-lucide="briefcase" class="w-4 h-4"></i></span>
              <input type="text" id="form-role" placeholder="e.g. Underwriter" class="w-full pl-9 pr-4 py-2 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all">
            </div>
          </div>
        </div>

        <!-- Category toggle -->
        <div>
          <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Category *</label>
          <div class="grid grid-cols-2 gap-3">
            <button type="button" id="cat-business-btn" class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm focus:outline-none transition-all border-navy bg-navy text-white">
              <i data-lucide="briefcase" class="w-4 h-4"></i>
              <span>Business</span>
            </button>
            <button type="button" id="cat-personal-btn" class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm focus:outline-none transition-all border-softBlue2 bg-white text-steel hover:border-navy hover:text-navy">
              <i data-lucide="user" class="w-4 h-4"></i>
              <span>Personal</span>
            </button>
          </div>
        </div>

        <!-- Tags chip input -->
        <div>
          <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Tags</label>
          <div id="form-tags-container" class="flex flex-wrap gap-1.5 p-2.5 border-2 border-softBlue1 bg-lightGray rounded-lg min-h-[42px] items-center cursor-text transition-all focus-within:ring-2 focus-within:ring-steel focus-within:border-transparent">
            <input id="form-tags-input" type="text" placeholder="Type and press Enter..." class="bg-transparent outline-none text-xs text-navy min-w-[140px] flex-1 placeholder-steel/50 py-0.5">
          </div>
          <p class="text-[10px] text-steel/70 mt-1">Press Enter to add · Backspace to remove last</p>
        </div>

        <div>
          <label class="block text-xs font-bold text-steel uppercase tracking-wide mb-1.5">Notes</label>
          <textarea id="form-notes" rows="3" placeholder="Add specific notes, overview, or context..." class="w-full p-3 border border-softBlue2 bg-lightGray text-navy rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent transition-all"></textarea>
        </div>

        <div class="flex items-center space-x-2.5 pt-2">
          <input type="checkbox" id="form-favorite" class="w-4 h-4 text-navy border-softBlue2 rounded focus:ring-steel cursor-pointer accent-gold">
          <label for="form-favorite" class="text-sm font-semibold text-steel select-none cursor-pointer flex items-center gap-1.5">
            <i data-lucide="star" class="w-4 h-4 text-gold fill-gold"></i> Flag as Starred Favorite
          </label>
        </div>
      </form>

      <div class="p-6 border-t border-softBlue1 bg-lightGray flex items-center justify-end space-x-3 flex-shrink-0">
        <button type="button" id="ct-modal-cancel" class="px-4 py-2 text-sm font-semibold text-steel hover:text-navy transition-colors focus:outline-none">Discard Changes</button>
        <button type="submit" form="ct-contact-form" class="px-5 py-2 text-sm font-bold text-white bg-navy hover:bg-steel active:scale-[0.98] rounded-lg border-2 border-transparent hover:border-gold transition-all duration-150 focus:outline-none">Commit Profile</button>
      </div>
    </div>
  </div>

  <!-- DELETE CONFIRM MODAL -->
  <div id="ct-delete-backdrop" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-300 opacity-0">
    <div class="bg-white rounded-[22px] shadow-2xl max-w-md w-full border border-slate-200/80 transform scale-95 transition-all duration-300 px-8 py-7">
      <div class="flex flex-col items-center text-center">
        <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500">
          <i data-lucide="triangle-alert" class="w-5 h-5"></i>
        </div>
        <h3 class="text-[1.75rem] leading-none font-extrabold text-navy">Delete Contact</h3>
        <p class="mt-4 max-w-[18rem] text-base leading-6 text-steel">
          Are you sure you want to remove <span id="ct-delete-name" class="font-semibold text-navy"></span> from the directory?
        </p>
      </div>
      <div class="mt-7 flex items-center justify-center gap-3">
        <button type="button" id="ct-delete-cancel" class="min-w-[112px] rounded-xl border border-softBlue2 bg-white px-4 py-2.5 text-sm font-semibold uppercase text-navy transition-colors hover:bg-lightGray focus:outline-none">Cancel</button>
        <button type="button" id="ct-delete-confirm" class="min-w-[120px] rounded-xl border border-transparent bg-red-500 px-4 py-2.5 text-sm font-bold uppercase text-white transition-colors hover:bg-red-600 focus:outline-none">
          Confirm
        </button>
      </div>
    </div>
  </div>

  <!-- DETAIL MODAL -->
  <div id="ct-detail-backdrop" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-300 opacity-0">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-softBlue2 transform scale-95 transition-all duration-300 flex flex-col max-h-[92vh]">
      <div id="ct-detail-header" class="h-28 bg-navy relative flex-shrink-0 border-b-2 border-gold">
        <button id="ct-detail-close" class="absolute top-4 right-4 z-20 bg-white/10 hover:bg-white/25 text-white p-1.5 rounded-full transition-all focus:outline-none">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
        <button id="ct-detail-star-btn" class="absolute top-4 left-4 z-20 bg-white/10 hover:bg-white/25 text-white p-1.5 rounded-full transition-all focus:outline-none"></button>
        <div id="ct-detail-avatar" class="absolute left-1/2 -translate-x-1/2 -bottom-12 z-10 w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-steel text-white font-extrabold text-3xl flex items-center justify-center select-none transition-opacity duration-300"></div>

        <!-- Compact identity bar — fades in and progressively expands as user scrolls down -->
        <div id="ct-detail-compact-bar" class="absolute inset-x-0 top-0 px-5 opacity-0 pointer-events-none transition-opacity duration-300">
          <div class="h-28 flex items-center gap-3 px-9">
            <div id="ct-detail-compact-avatar" class="w-9 h-9 rounded-xl font-extrabold text-sm flex items-center justify-center flex-shrink-0 select-none"></div>
            <div class="min-w-0">
              <p id="ct-detail-compact-name" class="text-white font-extrabold text-sm leading-tight truncate"></p>
              <p id="ct-detail-compact-sub" class="text-white/60 text-[10px] font-bold uppercase tracking-wider leading-tight mt-0.5 truncate"></p>
            </div>
          </div>
          <div id="ct-compact-contact" class="hidden pb-3 space-y-1.5 border-t border-white/10 pt-2.5">
            <div class="flex items-center gap-2 text-white/85 text-xs">
              <i data-lucide="phone" class="w-3.5 h-3.5 text-white/40 flex-shrink-0"></i>
              <span id="ct-compact-phone" class="font-semibold truncate"></span>
            </div>
            <div id="ct-compact-email-row" class="flex items-center gap-2 text-white/85 text-xs">
              <i data-lucide="mail" class="w-3.5 h-3.5 text-white/40 flex-shrink-0"></i>
              <span id="ct-compact-email" class="font-semibold truncate"></span>
            </div>
          </div>
          <div id="ct-compact-notes" class="hidden pb-3 border-t border-white/10 pt-2.5">
            <p id="ct-compact-notes-text" class="text-white/70 text-[11px] italic leading-snug line-clamp-2"></p>
          </div>
        </div>
      </div>

      <div id="ct-detail-scroll" class="relative overflow-y-auto flex-grow pt-16 px-6 pb-6 space-y-6 custom-scrollbar">
        <div class="flex flex-col items-center border-b border-softBlue1 pb-5">
          <h3 id="ct-detail-name" class="text-xl font-extrabold text-navy"></h3>
          <p id="ct-detail-sub" class="text-xs font-bold text-steel uppercase tracking-wider mt-1 text-center"></p>
          <div class="flex flex-col items-center gap-2 mt-3">
            <span id="ct-detail-category-tag" class="px-3 py-1 text-xs font-bold rounded-full"></span>
            <div id="ct-detail-tags-row" class="flex flex-wrap gap-1.5 justify-center"></div>
          </div>
        </div>

        <div id="ct-detail-contact-section" class="space-y-3">
          <h4 class="text-xs font-bold text-steel uppercase tracking-wider">Contact Details</h4>
          <div class="flex items-start justify-between bg-lightGray p-3.5 rounded-xl border border-softBlue2">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-softBlue1 text-steel flex items-center justify-center">
                <i data-lucide="phone" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="block text-[10px] font-bold text-steel uppercase tracking-wide leading-none mb-1">Phone Number</span>
                <a id="ct-detail-phone" href="#" class="text-sm font-bold text-navy hover:text-steel transition-colors"></a>
              </div>
            </div>
            <button id="ct-copy-phone" class="text-steel hover:text-gold transition-colors focus:outline-none" title="Copy Phone">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
          </div>
          <div id="ct-detail-email-row" class="flex items-start justify-between bg-lightGray p-3.5 rounded-xl border border-softBlue2">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-softBlue1 text-steel flex items-center justify-center">
                <i data-lucide="mail" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="block text-[10px] font-bold text-steel uppercase tracking-wide leading-none mb-1">Email Address</span>
                <a id="ct-detail-email" href="#" class="text-sm font-bold text-navy hover:text-steel transition-colors"></a>
              </div>
            </div>
            <button id="ct-copy-email" class="text-steel hover:text-gold transition-colors focus:outline-none" title="Copy Email">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <div id="ct-detail-notes-wrapper" class="space-y-2">
          <h4 class="text-xs font-bold text-steel uppercase tracking-wider">Notes</h4>
          <div class="bg-softBlue1 p-4 rounded-xl border border-softBlue2 text-xs text-navy leading-relaxed">
            <p id="ct-detail-notes" class="italic"></p>
          </div>
        </div>

        <div id="ct-detail-activity-section" class="space-y-4 pt-2 border-t border-softBlue2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-steel uppercase tracking-wider flex items-center gap-1.5">
              <i data-lucide="clipboard-list" class="w-4 h-4 text-gold"></i>
              Activity Log
            </h4>
            <span id="ct-timeline-count" class="text-[10px] font-bold px-2 py-0.5 rounded bg-softBlue1 text-steel border border-softBlue2">0 Entries</span>
          </div>
          <div class="space-y-2">
            <textarea id="ct-note-input" rows="2" placeholder="Record a timestamped note, meeting log, or action item..." class="w-full p-3 text-xs bg-lightGray border-2 border-softBlue1 rounded-xl text-navy focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent resize-none transition-all placeholder-steel/50"></textarea>
            <div class="flex justify-end">
              <button id="ct-note-add-btn" class="flex items-center space-x-1 px-4 py-2 text-xs font-bold text-white bg-steel hover:bg-navy rounded-lg border border-transparent transition-all focus:outline-none">
                <i data-lucide="sticky-note" class="w-3.5 h-3.5 text-gold"></i>
                <span>Save Note</span>
              </button>
            </div>
          </div>
          <div class="relative pl-4 space-y-4 border-l-2 border-softBlue2/80 mt-2" id="ct-timeline-list"></div>
        </div>
      </div>
    </div>
  </div>
  `;

  // ─── DOM REFS ─────────────────────────────────────────────────────────────
  const searchInput       = container.querySelector('#ct-search');
  const sortSelect        = container.querySelector('#ct-sort');
  const viewGridBtn       = container.querySelector('#ct-view-grid');
  const viewListBtn       = container.querySelector('#ct-view-list');
  const addBtn            = container.querySelector('#ct-add-btn');
  const exportBtn         = container.querySelector('#ct-export-btn');
  const importInput       = container.querySelector('#ct-import-input');

  const filterPillsDiv    = container.querySelector('#ct-filter-pills');
  const contactsContainer = container.querySelector('#ct-contacts-container');
  const emptyState        = container.querySelector('#ct-empty-state');

  const modalBackdrop     = container.querySelector('#ct-modal-backdrop');
  const modalInner        = modalBackdrop.querySelector('div');
  const modalIcon         = container.querySelector('#ct-modal-icon');
  const modalTitle        = container.querySelector('#ct-modal-title');
  const contactForm       = container.querySelector('#ct-contact-form');
  const businessFields    = container.querySelector('#ct-business-fields');
  const deleteBackdrop    = container.querySelector('#ct-delete-backdrop');
  const deleteInner       = deleteBackdrop.querySelector('div');
  const deleteName        = container.querySelector('#ct-delete-name');

  const detailBackdrop    = container.querySelector('#ct-detail-backdrop');
  const detailInner       = detailBackdrop.querySelector('div');
  const detailHeader      = container.querySelector('#ct-detail-header');
  const detailAvatar      = container.querySelector('#ct-detail-avatar');
  const detailScroll      = container.querySelector('#ct-detail-scroll');
  const detailCompactBar  = container.querySelector('#ct-detail-compact-bar');
  const detailCompactAv   = container.querySelector('#ct-detail-compact-avatar');
  const detailCompactName = container.querySelector('#ct-detail-compact-name');
  const detailCompactSub  = container.querySelector('#ct-detail-compact-sub');
  const compactContact    = container.querySelector('#ct-compact-contact');
  const compactPhone      = container.querySelector('#ct-compact-phone');
  const compactEmailRow   = container.querySelector('#ct-compact-email-row');
  const compactEmail      = container.querySelector('#ct-compact-email');
  const compactNotes      = container.querySelector('#ct-compact-notes');
  const compactNotesText  = container.querySelector('#ct-compact-notes-text');
  const detailName        = container.querySelector('#ct-detail-name');
  const detailSub         = container.querySelector('#ct-detail-sub');
  const detailPhone       = container.querySelector('#ct-detail-phone');
  const detailEmailRow    = container.querySelector('#ct-detail-email-row');
  const detailEmail       = container.querySelector('#ct-detail-email');
  const detailNotesWrap   = container.querySelector('#ct-detail-notes-wrapper');
  const detailNotes       = container.querySelector('#ct-detail-notes');
  const timelineCount     = container.querySelector('#ct-timeline-count');
  const timelineList      = container.querySelector('#ct-timeline-list');
  const noteInput         = container.querySelector('#ct-note-input');

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    initializeIfEmpty(); // seeds defaults + runs migration on existing data
    contacts = loadContacts() || [];
    renderAll();
  }

  // ─── DATA ─────────────────────────────────────────────────────────────────
  function getFiltered() {
    let list = contacts.slice();
    if (activeFilter === 'starred')  list = list.filter(c => c.favorite);
    else if (activeFilter === 'personal') list = list.filter(c => c.category === 'personal');
    else if (activeFilter === 'business') list = list.filter(c => c.category === 'business');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.email   || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.role    || '').toLowerCase().includes(q) ||
        (c.tags    || []).some(t => t.toLowerCase().includes(q)) ||
        (c.notes   || '').toLowerCase().includes(q)
      );
    }
    if (sortMode === 'alpha-asc')  list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'alpha-desc') list.sort((a, b) => b.name.localeCompare(a.name));
    if (sortMode === 'recent')     list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  function renderAll() {
    renderFilterPills();
    renderContacts();
  }

  function renderFilterPills() {
    const allCount      = contacts.length;
    const personalCount = contacts.filter(c => c.category === 'personal').length;
    const businessCount = contacts.filter(c => c.category === 'business').length;
    const starredCount  = contacts.filter(c => c.favorite).length;

    const defs = [
      { key: 'all',      label: 'All',      icon: 'users',     count: allCount },
      { key: 'personal', label: 'Personal', icon: 'user',      count: personalCount },
      { key: 'business', label: 'Business', icon: 'briefcase', count: businessCount },
      { key: 'starred',  label: 'Starred',  icon: 'star',      count: starredCount },
    ];

    filterPillsDiv.innerHTML = defs.map(p => {
      const isActive = activeFilter === p.key;
      const base = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all focus:outline-none';
      const cls  = isActive
        ? `${base} bg-navy text-white border-navy shadow-sm`
        : `${base} bg-white text-steel border-softBlue2 hover:border-steel hover:text-navy`;
      const iconCls = p.key === 'starred'
        ? (isActive ? 'w-3.5 h-3.5 fill-white' : 'w-3.5 h-3.5 text-gold')
        : 'w-3.5 h-3.5';
      return `<button data-pill="${p.key}" class="${cls}">
        <i data-lucide="${p.icon}" class="${iconCls}"></i>
        <span>${p.label} (${p.count})</span>
      </button>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
  }

  function renderContacts() {
    const filtered = getFiltered();
    if (filtered.length === 0) {
      contactsContainer.innerHTML = '';
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    if (viewMode === 'grid') {
      contactsContainer.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';
      contactsContainer.innerHTML = filtered.map(renderContactCard).join('');
    } else {
      contactsContainer.className = 'flex flex-col space-y-2.5 bg-white border border-softBlue2 rounded-2xl p-4 shadow-sm';
      const header = `
        <div class="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-steel uppercase tracking-wider border-b border-softBlue1">
          <div class="col-span-4">Contact Profile</div>
          <div class="col-span-3">Contact Channels</div>
          <div class="col-span-3">Tags</div>
          <div class="col-span-2 text-right">Actions</div>
        </div>`;
      contactsContainer.innerHTML = header + filtered.map((c, i) => renderContactRow(c, i)).join('');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function renderViewToggle() {
    const active   = 'p-1.5 rounded-md bg-white text-navy shadow-sm transition-all focus:outline-none';
    const inactive = 'p-1.5 rounded-md text-steel hover:text-navy transition-all focus:outline-none';
    viewGridBtn.className = viewMode === 'grid' ? active : inactive;
    viewListBtn.className = viewMode === 'list' ? active : inactive;
  }

  // ─── MODAL HELPERS ────────────────────────────────────────────────────────
  function showModal(backdrop, inner) {
    backdrop.classList.remove('hidden');
    setTimeout(() => { backdrop.classList.remove('opacity-0'); inner.classList.remove('scale-95'); }, 10);
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal(backdrop, inner) {
    backdrop.classList.add('opacity-0');
    inner.classList.add('scale-95');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
  }

  // ─── CATEGORY TOGGLE ──────────────────────────────────────────────────────
  function updateCategoryToggle(val) {
    formCategory = val;
    const busBtn = container.querySelector('#cat-business-btn');
    const perBtn = container.querySelector('#cat-personal-btn');
    const activeBase   = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm focus:outline-none transition-all';
    const inactiveBase = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm focus:outline-none transition-all hover:border-navy hover:text-navy';
    busBtn.className = val === 'business'
      ? `${activeBase} border-navy bg-navy text-white`
      : `${inactiveBase} border-softBlue2 bg-white text-steel`;
    perBtn.className = val === 'personal'
      ? `${activeBase} border-steel bg-steel text-white`
      : `${inactiveBase} border-softBlue2 bg-white text-steel`;
    businessFields.classList.toggle('hidden', val === 'personal');
    if (window.lucide) window.lucide.createIcons();
  }

  // ─── TAG CHIPS (modal) ────────────────────────────────────────────────────
  function renderTagChips() {
    const tagsBox   = container.querySelector('#form-tags-container');
    const tagsInput = container.querySelector('#form-tags-input');
    tagsBox.querySelectorAll('.ct-tag-chip').forEach(el => el.remove());
    formTags.forEach((tag, idx) => {
      const chip = document.createElement('span');
      chip.className = 'ct-tag-chip inline-flex items-center gap-1 px-2 py-0.5 bg-navy text-white text-[10px] font-bold rounded-md flex-shrink-0';
      chip.innerHTML = `${escapeHTML(tag)}<button type="button" data-idx="${idx}" class="ct-tag-remove ml-0.5 leading-none hover:text-gold focus:outline-none">×</button>`;
      tagsBox.insertBefore(chip, tagsInput);
    });
    tagsBox.querySelectorAll('.ct-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        formTags.splice(parseInt(btn.getAttribute('data-idx')), 1);
        renderTagChips();
      });
    });
  }

  // ─── ADD / EDIT MODAL ─────────────────────────────────────────────────────
  function openAddModal() {
    formTags = [];
    formCategory = 'business';
    container.querySelector('#form-contact-id').value = '';
    contactForm.reset();
    renderTagChips();
    updateCategoryToggle('business');
    modalTitle.textContent = 'Create Profile Card';
    modalIcon.innerHTML = '<i data-lucide="user-plus" class="w-5 h-5"></i>';
    showModal(modalBackdrop, modalInner);
  }

  function openEditModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    formTags = [...(c.tags || [])];
    formCategory = c.category || 'business';
    container.querySelector('#form-contact-id').value = c.id;
    container.querySelector('#form-name').value    = c.name;
    container.querySelector('#form-phone').value   = c.phone;
    container.querySelector('#form-email').value   = c.email    || '';
    container.querySelector('#form-birthday').value = c.birthday || '';
    container.querySelector('#form-company').value = c.company  || '';
    container.querySelector('#form-role').value    = c.role     || '';
    container.querySelector('#form-notes').value   = c.notes    || '';
    container.querySelector('#form-favorite').checked = c.favorite || false;
    renderTagChips();
    updateCategoryToggle(formCategory);
    modalTitle.textContent = 'Modify Profile Information';
    modalIcon.innerHTML = '<i data-lucide="edit" class="w-5 h-5"></i>';
    showModal(modalBackdrop, modalInner);
  }

  function openDeleteModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    pendingDeleteId = id;
    deleteName.textContent = c.name;
    showModal(deleteBackdrop, deleteInner);
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    closeModal(deleteBackdrop, deleteInner);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const companyValue = container.querySelector('#form-company').value.trim();
    const roleValue = container.querySelector('#form-role').value.trim();
    const id   = container.querySelector('#form-contact-id').value;
    const data = {
      name:     container.querySelector('#form-name').value.trim(),
      phone:    container.querySelector('#form-phone').value.trim(),
      email:    container.querySelector('#form-email').value.trim(),
      birthday: container.querySelector('#form-birthday').value,
      company:  formCategory === 'business' ? companyValue : '',
      role:     formCategory === 'business' ? roleValue : '',
      category: formCategory,
      tags:     [...formTags],
      notes:    container.querySelector('#form-notes').value.trim(),
      favorite: container.querySelector('#form-favorite').checked,
    };
    if (!data.name || !data.phone) { showToast('Name and Phone are required.', 'error'); return; }

    if (id) {
      const c = contacts.find(x => x.id === id);
      if (c) { Object.assign(c, data); showToast(`Changes committed for "${data.name}"`, 'success'); }
    } else {
      contacts.push({ id: Date.now().toString(), ...data, createdAt: new Date().toISOString(), timeline: [] });
      showToast(`Profile created for "${data.name}"`, 'success');
    }
    saveContacts(contacts);
    closeModal(modalBackdrop, modalInner);
    renderAll();
  }

  // ─── DETAIL MODAL ─────────────────────────────────────────────────────────
  function openDetailModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    detailContactId = id;
    editingNoteId = null;

    const { bg, text } = getAvatarPalette(c.name);
    detailAvatar.className = `absolute left-1/2 -translate-x-1/2 -bottom-12 z-10 w-24 h-24 rounded-2xl border-4 border-white shadow-lg font-extrabold text-3xl flex items-center justify-center select-none transition-opacity duration-300 ${bg} ${text}`;
    detailAvatar.style.opacity = '1';
    detailAvatar.textContent = getInitials(c.name);

    detailName.textContent = c.name;
    const subParts = [c.role, c.company ? `• ${c.company}` : ''].filter(Boolean);
    detailSub.textContent = subParts.join(' ') || 'No Registered Job Designation';

    // Populate compact bar — identity row
    detailCompactAv.className = `w-9 h-9 rounded-xl font-extrabold text-sm flex items-center justify-center flex-shrink-0 select-none ${bg} ${text}`;
    detailCompactAv.textContent = getInitials(c.name);
    detailCompactName.textContent = c.name;
    detailCompactSub.textContent = subParts.join(' ') || 'No Registered Job Designation';

    // Populate compact bar — phone / email
    compactPhone.textContent = c.phone;
    if (c.email) {
      compactEmail.textContent = c.email;
      compactEmailRow.classList.remove('hidden');
    } else {
      compactEmailRow.classList.add('hidden');
    }

    // Populate compact bar — notes
    compactHasNotes = Boolean(c.notes);
    compactNotesText.textContent = c.notes || '';

    // Reset scroll + compact state each time modal opens
    detailScroll.scrollTop = 0;
    detailCompactBar.style.opacity = '0';
    detailAvatar.style.opacity = '1';
    detailHeader.style.height = '';
    lastHeaderH = 112;
    compactContactShown = false;
    compactNotesShown = false;
    compactContact.classList.add('hidden');
    compactNotes.classList.add('hidden');

    const catTag = container.querySelector('#ct-detail-category-tag');
    catTag.textContent = c.category === 'business' ? 'Business' : 'Personal';
    catTag.className = `px-3 py-1 text-xs font-bold rounded-full ${c.category === 'business' ? 'bg-navy text-white' : 'bg-steel/15 text-steel border border-steel/25'}`;

    const tagsRow = container.querySelector('#ct-detail-tags-row');
    tagsRow.innerHTML = (c.tags || []).length > 0
      ? c.tags.map(t => `<span class="px-2.5 py-0.5 text-[10px] font-bold rounded-md bg-softBlue1 text-steel border border-softBlue2">${escapeHTML(t)}</span>`).join('')
      : '<span class="text-[10px] text-steel/50 italic">No tags</span>';

    detailPhone.textContent = c.phone;
    detailPhone.href = `tel:${c.phone}`;

    if (c.email) {
      detailEmail.textContent = c.email;
      detailEmail.href = `mailto:${c.email}`;
      detailEmailRow.classList.remove('hidden');
    } else {
      detailEmailRow.classList.add('hidden');
    }

    if (c.notes) {
      detailNotes.textContent = c.notes;
      detailNotesWrap.classList.remove('hidden');
    } else {
      detailNotesWrap.classList.add('hidden');
    }

    updateDetailStar(c);
    renderTimeline(c);
    showModal(detailBackdrop, detailInner);

    // Measure scroll thresholds after layout settles.
    // contact: surface phone/email once the Contact Details block scrolls above the fold.
    // notes:   surface notes once the Notes block scrolls above the fold.
    requestAnimationFrame(() => {
      const contactSection  = container.querySelector('#ct-detail-contact-section');
      const notesSection    = container.querySelector('#ct-detail-notes-wrapper');
      const activitySection = container.querySelector('#ct-detail-activity-section');
      compactThresholds.contact = contactSection
        ? contactSection.offsetTop + contactSection.offsetHeight - 40
        : 9999;
      compactThresholds.notes = compactHasNotes && notesSection
        ? notesSection.offsetTop + notesSection.offsetHeight - 40
        : (activitySection ? activitySection.offsetTop : 9999);
    });
  }

  function updateDetailStar(c) {
    const starBtn = container.querySelector('#ct-detail-star-btn');
    const cls = c.favorite ? 'text-gold fill-gold' : 'text-white';
    starBtn.innerHTML = `<i data-lucide="star" class="w-5 h-5 ${cls}"></i>`;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderTimeline(c) {
    const entries = (c.timeline || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    timelineCount.textContent = `${entries.length} Entry(ies)`;
    timelineList.innerHTML = entries.length === 0
      ? '<div class="text-center py-4 text-steel/60 italic text-xs">No recorded timeline actions yet.</div>'
      : entries.map(e => renderTimelineEntry(e, editingNoteId)).join('');
    if (window.lucide) window.lucide.createIcons();
    if (editingNoteId) {
      const ta = timelineList.querySelector(`[data-note-edit-input="${editingNoteId}"]`);
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  function toggleFavorite(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    c.favorite = !c.favorite;
    saveContacts(contacts);
    showToast(c.favorite ? `Starred: ${c.name}` : `Unstarred: ${c.name}`, 'success');
    renderAll();
    if (detailContactId === id && !detailBackdrop.classList.contains('hidden')) updateDetailStar(c);
  }

  function deleteContact(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    contacts = contacts.filter(x => x.id !== id);
    saveContacts(contacts);
    showToast(`Profile deleted for "${c.name}"`, 'success');
    if (detailContactId === id) {
      closeModal(detailBackdrop, detailInner);
      detailContactId = null;
    }
    closeDeleteModal();
    renderAll();
  }

  function addTimelineNote() {
    const text = noteInput.value.trim();
    if (!text) { showToast('Note cannot be blank.', 'error'); return; }
    const c = contacts.find(x => x.id === detailContactId);
    if (!c) return;
    if (!c.timeline) c.timeline = [];
    c.timeline.push({ id: Date.now().toString(), note: text, timestamp: new Date().toISOString() });
    noteInput.value = '';
    saveContacts(contacts);
    showToast('Activity note saved!', 'success');
    renderTimeline(c);
    renderContacts();
  }

  function deleteTimelineNote(noteId) {
    const c = contacts.find(x => x.id === detailContactId);
    if (!c) return;
    if (editingNoteId === noteId) editingNoteId = null;
    c.timeline = (c.timeline || []).filter(n => n.id !== noteId);
    saveContacts(contacts);
    showToast('Activity note removed.', 'success');
    renderTimeline(c);
    renderContacts();
  }

  function startEditTimelineNote(noteId) {
    editingNoteId = noteId;
    const c = contacts.find(x => x.id === detailContactId);
    if (c) renderTimeline(c);
  }

  function cancelEditTimelineNote() {
    editingNoteId = null;
    const c = contacts.find(x => x.id === detailContactId);
    if (c) renderTimeline(c);
  }

  function saveEditTimelineNote(noteId) {
    const c = contacts.find(x => x.id === detailContactId);
    if (!c) return;
    const ta = timelineList.querySelector(`[data-note-edit-input="${noteId}"]`);
    const text = (ta?.value || '').trim();
    if (!text) { showToast('Note cannot be blank.', 'error'); return; }
    const entry = (c.timeline || []).find(n => n.id === noteId);
    if (!entry) return;
    entry.note = text;
    entry.editedAt = new Date().toISOString();
    editingNoteId = null;
    saveContacts(contacts);
    showToast('Activity note updated.', 'success');
    renderTimeline(c);
    renderContacts();
  }

  // ─── CLIPBOARD ────────────────────────────────────────────────────────────
  function copyText(text, msg) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.cssText = 'position:fixed;left:-9999px;top:0';
    container.appendChild(temp);
    temp.select();
    try { document.execCommand('copy'); showToast(msg, 'success'); }
    catch { showToast('Clipboard write blocked.', 'error'); }
    container.removeChild(temp);
  }

  // ─── TOAST ────────────────────────────────────────────────────────────────
  function showToast(message, type = 'success') {
    const tc = container.querySelector('#ct-toast');
    if (!tc) return;
    const cfg = type === 'success'
      ? { cls: 'bg-softBlue1 border-2 border-green text-navy', icon: 'check-circle', iconCls: 'text-green' }
      : type === 'error'
      ? { cls: 'bg-softBlue1 border-2 border-amber text-navy', icon: 'alert-circle', iconCls: 'text-amber' }
      : { cls: 'bg-lightGray border-2 border-steel text-navy', icon: 'info', iconCls: 'text-steel' };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center justify-between p-4 rounded-xl shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 ${cfg.cls}`;
    toast.innerHTML = `
      <div class="flex items-center space-x-2.5">
        <i data-lucide="${cfg.icon}" class="w-5 h-5 flex-shrink-0 ${cfg.iconCls}"></i>
        <span class="text-sm font-semibold">${escapeHTML(message)}</span>
      </div>
      <button class="text-steel hover:text-navy transition ml-3 focus:outline-none" onclick="this.parentElement.remove()">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>`;
    tc.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => { toast.classList.add('opacity-0', 'translate-y-2'); setTimeout(() => toast.remove(), 300); }, 3800);
  }

  // ─── EVENT WIRING ─────────────────────────────────────────────────────────

  // Filter pills (event delegation — stable parent, innerHTML replacements don't break this)
  filterPillsDiv.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-pill]');
    if (pill) { activeFilter = pill.getAttribute('data-pill'); renderFilterPills(); renderContacts(); }
  });

  searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderContacts(); });
  sortSelect.addEventListener('change', (e) => { sortMode = e.target.value; renderContacts(); });
  viewGridBtn.addEventListener('click', () => { viewMode = 'grid'; renderContacts(); renderViewToggle(); });
  viewListBtn.addEventListener('click', () => { viewMode = 'list'; renderContacts(); renderViewToggle(); });

  addBtn.addEventListener('click', openAddModal);
  container.querySelector('#ct-empty-add-btn').addEventListener('click', openAddModal);

  exportBtn.addEventListener('click', () => { exportToJSON(contacts); showToast('Database snapshot exported!', 'success'); });
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFromJSON(file, (importedContacts) => {
      // Migrate imported data in case it uses the old `group` field
      const { migrated } = migrateContacts(importedContacts);
      const map = new Map(contacts.map(c => [c.id, c]));
      migrated.forEach(c => map.set(c.id, c));
      contacts = Array.from(map.values());
      saveContacts(contacts);
      renderAll();
      showToast(`Loaded ${migrated.length} profile(s).`, 'success');
    }, (err) => showToast(err, 'error'));
    e.target.value = '';
  });

  // Category toggle
  container.querySelector('#cat-business-btn').addEventListener('click', () => updateCategoryToggle('business'));
  container.querySelector('#cat-personal-btn').addEventListener('click', () => updateCategoryToggle('personal'));

  // Tags chip input
  container.querySelector('#form-tags-container').addEventListener('click', () => container.querySelector('#form-tags-input').focus());
  container.querySelector('#form-tags-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && !formTags.includes(val)) { formTags.push(val); renderTagChips(); }
      else if (val) showToast(`Tag "${val}" already added.`, 'error');
      e.target.value = '';
    }
    if (e.key === 'Backspace' && e.target.value === '' && formTags.length > 0) {
      formTags.pop(); renderTagChips();
    }
  });

  // Add/Edit modal
  container.querySelector('#ct-modal-close').addEventListener('click', () => closeModal(modalBackdrop, modalInner));
  container.querySelector('#ct-modal-cancel').addEventListener('click', () => closeModal(modalBackdrop, modalInner));
  contactForm.addEventListener('submit', handleFormSubmit);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(modalBackdrop, modalInner); });

  // Delete confirmation modal
  container.querySelector('#ct-delete-cancel').addEventListener('click', closeDeleteModal);
  container.querySelector('#ct-delete-confirm').addEventListener('click', () => {
    if (pendingDeleteId) deleteContact(pendingDeleteId);
  });
  deleteBackdrop.addEventListener('click', (e) => { if (e.target === deleteBackdrop) closeDeleteModal(); });

  // Contact grid/list (event delegation)
  contactsContainer.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]:not([data-action="open-detail"])');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const id     = actionBtn.getAttribute('data-id');
      if (action === 'call' || action === 'email') { return; }
      if (action === 'toggle-fav') { toggleFavorite(id); return; }
      if (action === 'edit')       { openEditModal(id);   return; }
      if (action === 'delete')     { openDeleteModal(id); return; }
      return;
    }
    const card = e.target.closest('[data-action="open-detail"]');
    if (card) openDetailModal(card.getAttribute('data-id'));
  });

  // Detail modal — progressive compact header on scroll
  detailScroll.addEventListener('scroll', () => {
    const y = detailScroll.scrollTop;
    const active = y > 72;
    detailAvatar.style.opacity = active ? '0' : '1';
    detailCompactBar.style.opacity = active ? '1' : '0';

    // Hysteresis: each row turns on when scrolled past its threshold, but only turns
    // off after scrolling back BAND px above it. Without this dead-band, dragging the
    // scrollbar near a threshold flickers — the header height change re-maps the held
    // mouse position to a different scrollTop, which re-crosses the threshold, and so on.
    const BAND = 90;
    if (!active) {
      compactContactShown = false;
      compactNotesShown = false;
    } else {
      compactContactShown = compactContactShown
        ? y > compactThresholds.contact - BAND
        : y > compactThresholds.contact;
      compactNotesShown = compactHasNotes && (compactNotesShown
        ? y > compactThresholds.notes - BAND
        : y > compactThresholds.notes);
    }
    compactContact.classList.toggle('hidden', !compactContactShown);
    compactNotes.classList.toggle('hidden', !compactNotesShown);

    // Grow the navy header to fit whatever compact rows are visible
    const newHeaderH = active ? detailCompactBar.scrollHeight : 112;
    detailHeader.style.height = active ? `${newHeaderH}px` : '';

    // The header lives above the scroll viewport, so growing it shoves all content
    // down — a backward lurch against the scroll direction. Compensate scrollTop by
    // the height delta so the content stays visually anchored. (No height animation,
    // so the instant compensation cancels the jump perfectly.)
    const delta = newHeaderH - lastHeaderH;
    if (delta !== 0) detailScroll.scrollTop = y + delta;
    lastHeaderH = newHeaderH;
  });

  container.querySelector('#ct-detail-close').addEventListener('click', () => closeModal(detailBackdrop, detailInner));
  detailBackdrop.addEventListener('click', (e) => { if (e.target === detailBackdrop) closeModal(detailBackdrop, detailInner); });
  container.querySelector('#ct-detail-star-btn').addEventListener('click', () => { if (detailContactId) toggleFavorite(detailContactId); });
  container.querySelector('#ct-copy-phone').addEventListener('click', () => {
    const c = contacts.find(x => x.id === detailContactId);
    if (c) copyText(c.phone, 'Phone copied!');
  });
  container.querySelector('#ct-copy-email').addEventListener('click', () => {
    const c = contacts.find(x => x.id === detailContactId);
    if (c && c.email) copyText(c.email, 'Email copied!');
  });
  container.querySelector('#ct-note-add-btn').addEventListener('click', addTimelineNote);
  noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTimelineNote(); } });
  timelineList.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const noteId = action.getAttribute('data-note-id');
    switch (action.getAttribute('data-action')) {
      case 'delete-note':      deleteTimelineNote(noteId); break;
      case 'edit-note':        startEditTimelineNote(noteId); break;
      case 'save-note-edit':   saveEditTimelineNote(noteId); break;
      case 'cancel-note-edit': cancelEditTimelineNote(); break;
    }
  });

  // ─── RUN ──────────────────────────────────────────────────────────────────
  init();
  return {
    element: container,
    destroy: () => {},
    openAddModal,
    openDetail: openDetailModal,
    setFilter: (filterKey) => {
      activeFilter = filterKey;
      renderFilterPills();
      renderContacts();
    },
    triggerImport: () => importInput.click(),
  };
}
