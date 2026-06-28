import {
  loadContacts, saveContacts, initializeIfEmpty,
  exportToJSON, importFromJSON, importFromOutlookCSV, importFromGoogleCSV, migrateContacts
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
  let hideServiceNumbers = false;
  let importCandidates = []; // { contact, isDuplicate, dupReason, selected }
  let pendingCsvSource = 'outlook'; // which CSV parser to use for the next file pick
  let sortMode = 'alpha-asc';
  let viewMode = 'list';
  let contentMode = 'directory';
  let selectedMemoContactId = null;
  let detailContactId = null;
  let pendingDeleteId = null;
  let editingNoteId = null;
  let selectedContactIds = new Set();
  let formTags = [];
  let formCategory = 'business';
  let advancedFilters = createEmptyAdvancedFilters();
  let isFilterFlyoutOpen = false;
  let activeFilterFlyoutGroup = 'roles';
  // Scroll thresholds (px) for the progressive compact header — measured per contact
  let compactThresholds = { contact: 9999, notes: 9999 };
  let compactHasNotes = false;
  let lastHeaderH = 112; // tracks header height to compensate scrollTop when it grows/shrinks
  let compactContactShown = false;
  let compactNotesShown = false;
  let memoCategory = null;
  let editingMemoId = null;
  let pendingDeleteMemoId = null;

  container.innerHTML = `
  <div id="ct-toast" class="fixed bottom-6 right-6 z-[60] flex flex-col space-y-3 max-w-sm w-full pointer-events-none"></div>

  <div class="flex flex-1 overflow-hidden w-full max-w-7xl mx-auto">

  <!-- MAIN CONTENT -->
  <main class="flex-grow flex flex-col gap-5 overflow-hidden px-6 pb-6 pt-0">

    <!-- Search / Sort / View row -->
    <div id="ct-toolbar-controls" class="bg-white rounded-xl border border-softBlue2 p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between flex-shrink-0">
      <div class="flex w-full flex-col xl:flex-row xl:items-center gap-3 xl:flex-1">
        <div class="inline-flex items-center rounded-xl border border-softBlue2 bg-lightGray p-1 flex-shrink-0">
          <button id="ct-mode-directory" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none">
            <i data-lucide="users" class="w-3.5 h-3.5"></i>
            <span>Directory View</span>
          </button>
          <button id="ct-mode-memos" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none">
            <i data-lucide="history" class="w-3.5 h-3.5"></i>
            <span>Timed Activity Memos</span>
          </button>
        </div>
        <div class="relative w-full xl:flex-1 xl:max-w-md">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-steel">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <input id="ct-search" type="text" placeholder="Search names, phone, tags, companies..." class="w-full pl-9 pr-4 py-2 text-sm border-2 border-softBlue1 rounded-lg focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent bg-lightGray text-navy placeholder-steel/60 transition-all">
        </div>
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
        <div class="relative flex-shrink-0">
          <button id="ct-import-btn" type="button" class="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-steel hover:text-gold hover:bg-softBlue1 rounded-lg border border-transparent transition-all focus:outline-none">
            <i data-lucide="upload" class="w-4 h-4"></i>
            <span>Import</span>
            <i data-lucide="chevron-down" class="w-3 h-3"></i>
          </button>
          <div id="ct-import-menu" class="hidden absolute right-0 mt-1.5 w-52 bg-white border border-softBlue2 rounded-xl shadow-lg z-30 overflow-hidden">
            <button type="button" data-import-type="json" class="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-navy hover:bg-softBlue1 transition-colors flex items-center gap-2.5 focus:outline-none">
              <i data-lucide="file-text" class="w-4 h-4 text-steel flex-shrink-0"></i>
              <span>JSON Backup</span>
            </button>
            <button type="button" data-import-type="contacts-csv" class="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-navy hover:bg-softBlue1 transition-colors flex items-center gap-2.5 border-t border-softBlue1 focus:outline-none">
              <i data-lucide="users" class="w-4 h-4 text-steel flex-shrink-0"></i>
              <span>Google / Outlook Contacts CSV</span>
            </button>
          </div>
          <input id="ct-import-input" type="file" accept=".json" class="hidden">
          <input id="ct-import-csv-input" type="file" accept=".csv,text/csv" class="hidden">
        </div>
      </div>
    </div>

    <!-- Filter pills -->
    <div id="ct-pill-bar" class="flex flex-shrink-0 flex-wrap items-center gap-2">
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
        <h4 id="ct-empty-title" class="text-lg font-bold text-navy">No Contact Entries Match</h4>
        <p id="ct-empty-copy" class="text-steel text-sm max-w-sm mt-1">Adjust your filter options, modify the search query, or add a new contact profile.</p>
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

  <!-- ADD MEMO MODAL -->
  <div id="ct-memo-backdrop" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-300 opacity-0">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-softBlue2 transform scale-95 transition-all duration-300">
      <div class="p-5 border-b border-softBlue1 bg-lightGray flex items-center justify-between">
        <h3 class="text-base font-bold text-navy">Log New Activity Memo</h3>
        <button id="ct-memo-close" class="text-steel hover:text-navy hover:bg-softBlue1 p-1.5 rounded-lg transition-colors focus:outline-none">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Note Category</label>
          <select id="ct-memo-category-select" class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition bg-white">
            <option value="">General Memo</option>
            <option value="follow-up">Follow Up</option>
            <option value="meeting">Meeting</option>
            <option value="idea">Idea</option>
            <option value="update">Update</option>
            <option value="milestone">Milestone</option>
          </select>
        </div>
        <div id="ct-memo-followup-field" class="hidden">
          <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Follow Up Date &amp; Time</label>
          <input type="datetime-local" id="ct-memo-followup-dt" class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition" />
        </div>
        <div id="ct-memo-meeting-fields" class="hidden space-y-3">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Meeting Date &amp; Time</label>
            <input type="datetime-local" id="ct-memo-meeting-dt" class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Meeting Link <span class="text-steel/50 normal-case font-normal">(optional)</span></label>
            <input type="url" id="ct-memo-meeting-link" placeholder="https://meet.google.com/..." class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition" />
          </div>
        </div>
        <div>
          <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Note Title / Headline <span class="text-steel/50 normal-case font-normal">(optional)</span></label>
          <input type="text" id="ct-memo-title" placeholder="Brief headline of this activity" class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition" />
        </div>
        <div>
          <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel block mb-1.5">Detailed Content <span class="text-red-400">*</span></label>
          <textarea id="ct-memo-content" rows="4" placeholder="Write down conversation briefs, next actions, or agreements made..." class="w-full rounded-lg border border-softBlue2 px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition resize-none"></textarea>
        </div>
      </div>
      <div class="px-5 py-4 border-t border-softBlue1 bg-lightGray flex items-center justify-end gap-3">
        <button type="button" id="ct-memo-cancel" class="px-4 py-2 text-sm font-semibold text-steel hover:text-navy transition-colors focus:outline-none">Cancel</button>
        <button type="button" id="ct-memo-save" class="px-5 py-2 text-sm font-bold text-white bg-navy hover:bg-steel active:scale-[0.98] rounded-lg border-2 border-transparent hover:border-gold transition-all duration-150 focus:outline-none">Save Log Entry</button>
      </div>
    </div>
  </div>

  <!-- IMPORT PREVIEW MODAL -->
  <div id="ct-import-backdrop" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-300 opacity-0">
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-softBlue2 transform scale-95 transition-all duration-300 flex flex-col max-h-[90vh]">
      <div class="p-5 border-b border-softBlue1 bg-lightGray flex items-start justify-between flex-shrink-0">
        <div class="flex items-center space-x-2.5">
          <div class="w-9 h-9 rounded-lg bg-softBlue2 text-navy flex items-center justify-center flex-shrink-0">
            <i data-lucide="user-check" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-navy leading-tight">Review Import</h3>
            <p id="ct-import-summary" class="text-xs text-steel mt-0.5"></p>
          </div>
        </div>
        <button id="ct-import-close" class="text-steel hover:text-navy hover:bg-softBlue1 p-1.5 rounded-lg transition-colors focus:outline-none">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="px-5 py-2.5 border-b border-softBlue1 flex items-center justify-between flex-shrink-0 text-xs">
        <div class="flex items-center gap-2">
          <button id="ct-import-select-all" class="px-2.5 py-1 rounded-md font-semibold text-steel hover:bg-softBlue1 transition focus:outline-none">Select all</button>
          <span class="text-softBlue2">|</span>
          <button id="ct-import-select-none" class="px-2.5 py-1 rounded-md font-semibold text-steel hover:bg-softBlue1 transition focus:outline-none">Select none</button>
        </div>
      </div>

      <div id="ct-import-list" class="overflow-y-auto flex-grow custom-scrollbar p-3 space-y-1.5"></div>

      <div class="p-4 border-t border-softBlue1 bg-lightGray flex items-center justify-between flex-shrink-0">
        <button type="button" id="ct-import-cancel" class="px-4 py-2 text-sm font-semibold text-steel hover:text-navy transition-colors focus:outline-none">Cancel</button>
        <button type="button" id="ct-import-confirm" class="px-5 py-2 text-sm font-bold text-white bg-navy hover:bg-steel active:scale-[0.98] rounded-lg border-2 border-transparent hover:border-gold transition-all duration-150 focus:outline-none">Import Selected</button>
      </div>
    </div>
  </div>

  `;

  // ─── DOM REFS ─────────────────────────────────────────────────────────────
  const searchInput       = container.querySelector('#ct-search');
  const modeDirectoryBtn  = container.querySelector('#ct-mode-directory');
  const modeMemosBtn      = container.querySelector('#ct-mode-memos');
  const sortSelect        = container.querySelector('#ct-sort');
  const viewGridBtn       = container.querySelector('#ct-view-grid');
  const viewListBtn       = container.querySelector('#ct-view-list');
  const addBtn            = container.querySelector('#ct-add-btn');
  const toolbarControls   = container.querySelector('#ct-toolbar-controls');
  const pillBar           = container.querySelector('#ct-pill-bar');
  const exportBtn         = container.querySelector('#ct-export-btn');
  const importInput       = container.querySelector('#ct-import-input');
  const importCsvInput    = container.querySelector('#ct-import-csv-input');
  const importBtn         = container.querySelector('#ct-import-btn');
  const importMenu        = container.querySelector('#ct-import-menu');
  const importBackdrop    = container.querySelector('#ct-import-backdrop');
  const importInner       = importBackdrop.querySelector('div');
  const importSummary     = container.querySelector('#ct-import-summary');
  const importList        = container.querySelector('#ct-import-list');
  const importConfirmBtn  = container.querySelector('#ct-import-confirm');
  const memoBackdrop      = container.querySelector('#ct-memo-backdrop');
  const memoInner         = memoBackdrop.querySelector('div');
  const filterPillsDiv    = container.querySelector('#ct-filter-pills');
  const contactsContainer = container.querySelector('#ct-contacts-container');
  const emptyState        = container.querySelector('#ct-empty-state');
  const emptyTitle        = container.querySelector('#ct-empty-title');
  const emptyCopy         = container.querySelector('#ct-empty-copy');
  let filterBtn           = null;
  let filterFlyout        = null;
  let filterFlyoutMenu    = null;
  let filterFlyoutOptions = null;

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
  // Short codes (119, 156), starred/hash codes (*123), and other ≤6-digit lines are
  // utility / service numbers rather than real people.
  function createEmptyAdvancedFilters() {
    return {
      roles: [],
      tags: [],
      activityStatuses: [],
    };
  }

  function cloneAdvancedFilters(filters) {
    return {
      roles: [...(filters.roles || [])],
      tags: [...(filters.tags || [])],
      activityStatuses: [...(filters.activityStatuses || [])],
    };
  }

  function countActiveAdvancedFilters(filters = advancedFilters) {
    return ['roles', 'tags', 'activityStatuses']
      .reduce((sum, key) => sum + (filters[key]?.length || 0), 0);
  }

  function getLatestTimelineTimestamp(contact) {
    const entries = (contact.timeline || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return entries[0]?.timestamp || '';
  }

  function getDynamicFilterOptions() {
    const roles = [...new Set(contacts.map(c => String(c.role || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const tags = [...new Set(contacts.flatMap(c => Array.isArray(c.tags) ? c.tags : []).map(tag => String(tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { roles, tags };
  }

  function isServiceNumber(phone) {
    const raw = String(phone || '');
    if (/[*#]/.test(raw)) return true;
    const digits = raw.replace(/\D/g, '');
    return digits.length > 0 && digits.length <= 6;
  }

  function matchesActivityStatus(contact, status) {
    const hasTimeline = (contact.timeline || []).length > 0;
    const lastActivityAt = getLatestTimelineTimestamp(contact);
    const activityAgeDays = lastActivityAt ? (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (status === 'hasActivity') return hasTimeline;
    if (status === 'noActivity') return !hasTimeline;
    if (status === 'recentlyActive') return hasTimeline && activityAgeDays <= 30;
    if (status === 'noRecentActivity') return !hasTimeline || activityAgeDays > 30;
    return true;
  }

  function passesAdvancedFilters(contact) {
    if (advancedFilters.roles.length > 0 && !advancedFilters.roles.includes(String(contact.role || '').trim())) return false;
    if (advancedFilters.tags.length > 0 && !advancedFilters.tags.some(tag => (contact.tags || []).includes(tag))) return false;
    if (advancedFilters.activityStatuses.length > 0 && !advancedFilters.activityStatuses.some(status => matchesActivityStatus(contact, status))) return false;
    return true;
  }

  function getFiltered() {
    let list = contacts.slice();
    if (activeFilter === 'starred')  list = list.filter(c => c.favorite);
    else if (activeFilter === 'personal') list = list.filter(c => c.category === 'personal');
    else if (activeFilter === 'business') list = list.filter(c => c.category === 'business');

    if (hideServiceNumbers) list = list.filter(c => !isServiceNumber(c.phone));
    list = list.filter(passesAdvancedFilters);

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
    renderFilterButtonState();
    if (isFilterFlyoutOpen) renderFilterFlyout();
    renderContentModeToggle();
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

    const base = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all focus:outline-none';
    const categoryHTML = defs.map(p => {
      const isActive = activeFilter === p.key;
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

    // Toggle to hide utility / service numbers — only shown when any exist
    const serviceCount = contacts.filter(c => isServiceNumber(c.phone)).length;
    const toggleCls = hideServiceNumbers
      ? `${base} bg-amber text-white border-amber shadow-sm`
      : `${base} bg-white text-steel border-softBlue2 hover:border-amber hover:text-amber`;
    const toggleHTML = serviceCount > 0
      ? `<span class="self-center mx-1 h-5 w-px bg-softBlue2"></span>
         <button data-toggle="service" class="${toggleCls}" title="Hide short utility / service numbers (e.g. 119, *123)">
           <i data-lucide="phone-off" class="w-3.5 h-3.5"></i>
           <span>Hide Service #s (${serviceCount})</span>
         </button>`
      : '';

    filterPillsDiv.innerHTML = categoryHTML + toggleHTML;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderFilterButtonState() {
    if (!filterBtn) return;
    const activeCount = countActiveAdvancedFilters();
    filterBtn.innerHTML = `<i data-lucide="filter" class="w-4 h-4"></i><span>Filters</span>${activeCount > 0 ? `<span class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-navy text-white text-[10px] font-bold">${activeCount}</span>` : ''}<i data-lucide="chevron-down" class="w-4 h-4 text-steel"></i>`;
    filterBtn.classList.toggle('bg-softBlue1', isFilterFlyoutOpen);
    filterBtn.classList.toggle('border-navy', isFilterFlyoutOpen);
    if (window.lucide) window.lucide.createIcons();
  }

  function renderFilterFlyout() {
    if (!filterFlyoutMenu || !filterFlyoutOptions) return;
    const { roles, tags } = getDynamicFilterOptions();
    const groups = [
      {
        key: 'roles',
        label: 'Role',
        description: 'Filter by the role saved on the profile.',
        emptyLabel: 'No roles available yet.',
        items: roles,
      },
      {
        key: 'tags',
        label: 'Tags',
        description: 'Match any saved contact tags.',
        emptyLabel: 'No tags available yet.',
        items: tags,
      },
      {
        key: 'activityStatuses',
        label: 'Activity status',
        description: 'Use memo activity to find recent or untouched contacts.',
        emptyLabel: '',
        items: [
          { value: 'hasActivity', label: 'Has timed activity memo' },
          { value: 'noActivity', label: 'No timed activity memo' },
          { value: 'recentlyActive', label: 'Recently active' },
          { value: 'noRecentActivity', label: 'No recent activity' },
        ],
      },
    ];
    const activeGroup = groups.find((group) => group.key === activeFilterFlyoutGroup) || groups[0];
    activeFilterFlyoutGroup = activeGroup.key;

    filterFlyoutMenu.innerHTML = groups.map((group) => {
      const isActive = group.key === activeGroup.key;
      const selectedCount = advancedFilters[group.key]?.length || 0;
      return `
        <button
          type="button"
          data-filter-menu-trigger="${group.key}"
          class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isActive ? 'bg-softBlue1 text-navy' : 'text-steel hover:bg-softBlue1/70 hover:text-navy'}"
        >
          <span>${group.label}</span>
          <span class="flex items-center gap-2">
            ${selectedCount > 0 ? `<span class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-navy text-white text-[10px] font-bold">${selectedCount}</span>` : ''}
            <i data-lucide="chevron-right" class="w-4 h-4 ${isActive ? 'text-navy' : 'text-steel'}"></i>
          </span>
        </button>`;
    }).join('');

    const selectedValues = new Set(advancedFilters[activeGroup.key] || []);
    const optionItems = activeGroup.items.map((item) => typeof item === 'string' ? { value: item, label: item } : item);
    filterFlyoutOptions.innerHTML = `
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 class="text-sm font-bold text-navy">${activeGroup.label}</h4>
          <p class="mt-1 text-xs text-steel">${activeGroup.description}</p>
        </div>
        ${countActiveAdvancedFilters() > 0 ? '<button type="button" data-filter-clear class="text-xs font-bold text-steel hover:text-navy transition">Clear all</button>' : ''}
      </div>
      ${optionItems.length > 0 ? `
        <div class="max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          ${optionItems.map((item) => `
            <label class="flex items-center gap-2 rounded-xl border border-softBlue2 bg-lightGray/60 px-3 py-2 text-sm text-navy">
              <input type="checkbox" data-filter-group="${activeGroup.key}" value="${escapeHTML(item.value)}" ${selectedValues.has(item.value) ? 'checked' : ''} class="h-4 w-4 cursor-pointer accent-navy">
              <span>${escapeHTML(item.label)}</span>
            </label>
          `).join('')}
        </div>` : `<p class="text-xs italic text-steel/70">${activeGroup.emptyLabel}</p>`}
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  function openFilterFlyout() {
    isFilterFlyoutOpen = true;
    filterFlyout?.classList.remove('hidden');
    renderFilterButtonState();
    renderFilterFlyout();
  }

  function closeFilterFlyout() {
    isFilterFlyoutOpen = false;
    filterFlyout?.classList.add('hidden');
    renderFilterButtonState();
  }

  function toggleFilterFlyout() {
    if (isFilterFlyoutOpen) closeFilterFlyout();
    else openFilterFlyout();
  }

  function clearAdvancedFilters() {
    advancedFilters = createEmptyAdvancedFilters();
    renderFilterButtonState();
    renderFilterFlyout();
    renderContacts();
  }

  function restructureTopToolbar() {
    if (!toolbarControls || !pillBar || toolbarControls.dataset.restructured === 'true') return;

    const main = toolbarControls.parentElement;
    const originalLeft = toolbarControls.children[0];
    const originalRight = toolbarControls.children[1];
    const modeToggle = originalLeft?.children[0];
    const searchWrap = originalLeft?.children[1];
    const sortWrap = originalRight?.children[0];
    const divider = originalRight?.children[1];
    const viewToggle = originalRight?.children[2];

    const modeShell = document.createElement('div');
    modeShell.className = 'flex flex-shrink-0';
    modeShell.innerHTML = '<div class="inline-flex items-center rounded-2xl border border-softBlue2 bg-white p-1.5 shadow-sm"></div>';
    modeShell.firstElementChild.appendChild(modeToggle);
    main.insertBefore(modeShell, toolbarControls);

    toolbarControls.className = 'bg-white rounded-2xl border border-softBlue2 p-4 shadow-sm flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between flex-shrink-0';

    const leftControls = document.createElement('div');
    leftControls.className = 'flex w-full flex-col lg:flex-row gap-3 xl:flex-1';
    const rightControls = document.createElement('div');
    rightControls.className = 'flex w-full flex-wrap items-center gap-3 xl:w-auto xl:flex-nowrap';

    if (viewToggle) {
      viewToggle.className = 'flex bg-lightGray rounded-xl p-1 border border-softBlue1 flex-shrink-0 self-start';
      leftControls.appendChild(viewToggle);
    }

    if (searchWrap) {
      searchWrap.className = 'relative w-full xl:max-w-xl xl:flex-1';
      searchInput.className = 'w-full pl-10 pr-4 py-3 text-sm border-2 border-softBlue1 rounded-xl focus:outline-none focus:ring-2 focus:ring-steel focus:border-transparent bg-lightGray text-navy placeholder-steel/60 transition-all';
      searchInput.placeholder = 'Search by name, phone, email, company, or tag...';
      leftControls.appendChild(searchWrap);
    }

    const filterWrap = document.createElement('div');
    filterWrap.className = 'relative flex-shrink-0';

    filterBtn = document.createElement('button');
    filterBtn.id = 'ct-filter-btn';
    filterBtn.type = 'button';
    filterBtn.className = 'inline-flex items-center gap-2 rounded-xl border border-softBlue2 bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:bg-softBlue1 focus:outline-none';
    filterBtn.innerHTML = '<i data-lucide="filter" class="w-4 h-4"></i><span>Filters</span><i data-lucide="chevron-down" class="w-4 h-4 text-steel"></i>';

    filterFlyout = document.createElement('div');
    filterFlyout.id = 'ct-filter-flyout';
    filterFlyout.className = 'hidden absolute right-0 top-full z-40 mt-2 w-[36rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-softBlue2 bg-white shadow-2xl';
    filterFlyout.innerHTML = `
      <div class="grid grid-cols-[220px_minmax(0,1fr)]">
        <div id="ct-filter-flyout-menu" class="border-r border-softBlue1 bg-lightGray/60 p-3"></div>
        <div id="ct-filter-flyout-options" class="p-4"></div>
      </div>
    `;

    filterWrap.append(filterBtn, filterFlyout);
    rightControls.appendChild(filterWrap);
    filterFlyoutMenu = filterFlyout.querySelector('#ct-filter-flyout-menu');
    filterFlyoutOptions = filterFlyout.querySelector('#ct-filter-flyout-options');

    if (sortWrap) {
      sortWrap.className = 'flex items-center gap-2 rounded-xl border border-softBlue2 bg-white px-4 py-3 text-sm';
      const sortLabel = sortWrap.querySelector('span');
      if (sortLabel) {
        sortLabel.className = 'text-steel font-bold whitespace-nowrap';
      }
      sortSelect.className = 'bg-transparent text-navy focus:outline-none text-sm font-semibold cursor-pointer';
      rightControls.appendChild(sortWrap);
    }

    if (divider) divider.remove();

    exportBtn.className = 'inline-flex items-center gap-2 rounded-xl border border-softBlue2 bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:bg-softBlue1 focus:outline-none flex-shrink-0';
    importBtn.className = 'inline-flex items-center gap-2 rounded-xl border border-softBlue2 bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:bg-softBlue1 focus:outline-none';
    rightControls.append(exportBtn, importBtn.parentElement);

    toolbarControls.replaceChildren(leftControls, rightControls);

    pillBar.className = 'bg-white rounded-2xl border border-softBlue2 p-3 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 flex-shrink-0';
    addBtn.className = 'inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white border border-navy shadow-sm transition-all hover:bg-steel hover:border-steel focus:outline-none flex-shrink-0 self-start lg:self-auto';

    toolbarControls.dataset.restructured = 'true';
    renderFilterButtonState();
    if (window.lucide) window.lucide.createIcons();
  }

  function getMemoContacts() {
    return getFiltered()
      .filter(contact => (contact.timeline || []).length > 0)
      .map(contact => {
        const entries = (contact.timeline || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return {
          ...contact,
          timelineEntries: entries,
          lastActivityAt: entries[0]?.timestamp || contact.createdAt,
          memoCount: entries.length,
        };
      })
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
  }

  function pruneSelectedContacts() {
    const validIds = new Set(contacts.map(contact => contact.id));
    selectedContactIds.forEach((id) => {
      if (!validIds.has(id)) selectedContactIds.delete(id);
    });
  }

  function setSelectedContacts(ids) {
    selectedContactIds = new Set(ids);
  }

  function applyBulkAction(action) {
    const selectedIds = Array.from(selectedContactIds);
    if (selectedIds.length === 0) {
      showToast('Select at least one contact first.', 'error');
      return;
    }
    if (action === 'delete') {
      const confirmed = window.confirm(`Delete ${selectedIds.length} selected contact(s)?`);
      if (!confirmed) return;
      contacts = contacts.filter(contact => !selectedContactIds.has(contact.id));
      saveContacts(contacts);
      setSelectedContacts([]);
      showToast(`${selectedIds.length} contact(s) deleted.`, 'success');
      renderAll();
      return;
    }
    if (action === 'personal' || action === 'business') {
      contacts.forEach((contact) => {
        if (!selectedContactIds.has(contact.id)) return;
        contact.category = action;
        if (action === 'personal') {
          contact.company = '';
          contact.role = '';
        }
      });
      saveContacts(contacts);
      showToast(`${selectedIds.length} contact(s) updated to ${action}.`, 'success');
      renderAll();
    }
  }

  function hasActiveContactFilters() {
    return activeFilter !== 'all' || hideServiceNumbers || countActiveAdvancedFilters() > 0;
  }

  function renderContacts() {
    pruneSelectedContacts();
    const filtered = getFiltered();
    const memoContacts = getMemoContacts();
    const isDirectoryMode = contentMode === 'directory';
    const hasResults = isDirectoryMode ? filtered.length > 0 : memoContacts.length > 0;

    if (!hasResults) {
      contactsContainer.innerHTML = '';
      const filtersActive = isDirectoryMode && hasActiveContactFilters();
      emptyTitle.textContent = isDirectoryMode
        ? (filtersActive ? 'No contacts match these filters.' : 'No Contact Entries Match')
        : 'No Activity Memos Match';
      emptyCopy.textContent = isDirectoryMode
        ? (filtersActive
          ? 'Try clearing filters or adjusting your search.'
          : 'Adjust your filter options, modify the search query, or add a new contact profile.')
        : 'Try a different filter or search query, or add a new activity memo from a contact profile.';
      const emptyActionBtn = container.querySelector('#ct-empty-add-btn');
      emptyActionBtn.textContent = filtersActive ? 'Clear Filters' : 'Create Profile Card';
      emptyActionBtn.dataset.mode = filtersActive ? 'clear-filters' : 'add-contact';
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    if (!isDirectoryMode) {
      const hasSelectedContact = memoContacts.some(contact => contact.id === selectedMemoContactId);
      if (!hasSelectedContact) selectedMemoContactId = memoContacts[0]?.id || null;
      const activeMemoContact = memoContacts.find(contact => contact.id === selectedMemoContactId) || memoContacts[0];
      const memoSubtitle = [activeMemoContact.role, activeMemoContact.company].filter(Boolean).join(' · ') || 'Personal Contact';
      const activeCategoryClass = activeMemoContact.category === 'business'
        ? 'bg-navy text-white'
        : 'bg-steel/15 text-steel border border-steel/25';

      contactsContainer.className = 'grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start';
      contactsContainer.innerHTML = `
        <aside class="bg-white border border-softBlue2 rounded-2xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-softBlue1 bg-lightGray/60 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-steel">Contacts List</p>
              <p class="text-sm font-bold text-navy mt-1">${memoContacts.length} active timelines</p>
            </div>
            <span class="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-softBlue1 text-navy text-xs font-bold border border-softBlue2">${memoContacts.length}</span>
          </div>
          <div class="max-h-[70vh] overflow-y-auto custom-scrollbar">
            ${memoContacts.map(contact => {
              const { bg, text } = getAvatarPalette(contact.name);
              const isActive = contact.id === activeMemoContact.id;
              const contactSubtitle = [contact.role, contact.company].filter(Boolean).join(' · ') || 'Personal Contact';
              const colorDots = (contact.tags || []).slice(0, 4).map((_, index) => {
                const palette = ['bg-green', 'bg-softBlue2', 'bg-gold', 'bg-amber'];
                return `<span class="h-2.5 w-2.5 rounded-full ${palette[index % palette.length]}"></span>`;
              }).join('');
              return `
                <button type="button" data-action="select-memo-contact" data-id="${contact.id}" class="w-full text-left px-4 py-4 border-l-4 transition-all ${isActive ? 'bg-navy text-white border-softBlue2' : 'bg-white hover:bg-lightGray/70 border-transparent'}">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-sm ${bg} ${text}">
                      ${getInitials(contact.name)}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <h4 class="text-sm font-bold truncate ${isActive ? 'text-white' : 'text-navy'}">${escapeHTML(contact.name)}</h4>
                          <p class="text-xs mt-0.5 truncate ${isActive ? 'text-white/70' : 'text-steel'}">${escapeHTML(contactSubtitle)}</p>
                        </div>
                        <span class="text-[10px] whitespace-nowrap ${isActive ? 'text-white/55' : 'text-steel/70'}">${new Date(contact.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div class="mt-3 flex items-center justify-between gap-2">
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/10 text-white' : 'bg-softBlue1 text-navy border border-softBlue2'}">${contact.memoCount} notes</span>
                        <div class="flex items-center gap-1.5">${colorDots}</div>
                      </div>
                    </div>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </aside>

        <section class="min-w-0 bg-white border border-softBlue2 rounded-2xl shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-softBlue1 bg-lightGray/40">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex items-start gap-3 min-w-0">
                <div class="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-base ${getAvatarPalette(activeMemoContact.name).bg} ${getAvatarPalette(activeMemoContact.name).text}">
                  ${getInitials(activeMemoContact.name)}
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-xl font-extrabold text-navy truncate">${escapeHTML(activeMemoContact.name)}</h3>
                    <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${activeCategoryClass}">
                      ${activeMemoContact.category === 'business' ? 'Business' : 'Personal'}
                    </span>
                  </div>
                  <p class="text-sm text-steel mt-1 truncate">${escapeHTML(memoSubtitle)}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-steel">
                    <span class="inline-flex items-center gap-1.5"><i data-lucide="mail" class="w-3.5 h-3.5"></i>${escapeHTML(activeMemoContact.email || 'No email')}</span>
                    <span class="inline-flex items-center gap-1.5"><i data-lucide="phone" class="w-3.5 h-3.5"></i>${escapeHTML(activeMemoContact.phone)}</span>
                  </div>
                </div>
              </div>
              <div class="text-xs font-semibold text-steel whitespace-nowrap">${activeMemoContact.memoCount} activity memos</div>
            </div>
          </div>
          <div class="p-5 space-y-4 bg-softBlue1/35">
            ${activeMemoContact.timelineEntries.map(entry => {
              const catMeta = {
                'follow-up': { label: 'Follow Up', icon: 'clock', color: 'bg-amber/10 text-amber border-amber/30' },
                'meeting':   { label: 'Meeting',   icon: 'calendar', color: 'bg-softBlue1 text-navy border-softBlue2' },
                'idea':      { label: 'Idea',      icon: 'lightbulb', color: 'bg-green/10 text-green border-green/30' },
                'update':    { label: 'Update',    icon: 'refresh-cw', color: 'bg-steel/10 text-steel border-steel/25' },
                'milestone': { label: 'Milestone', icon: 'trophy', color: 'bg-gold/10 text-gold border-gold/30' },
              }[entry.category] || { label: 'Memo', icon: 'clipboard-list', color: 'bg-softBlue1 text-navy border-softBlue2' };
              const displayTitle = entry.title || entry.note.split('\n')[0].slice(0, 64) || '';
              const createdStr = new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
              const editedStr = entry.editedAt ? new Date(entry.editedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
              return `
              <div class="bg-white border border-softBlue2 rounded-2xl p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3 mb-2.5">
                  <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-steel min-w-0">
                    <i data-lucide="clock" class="w-3 h-3 flex-shrink-0"></i>
                    <span class="font-semibold whitespace-nowrap">${createdStr}</span>
                    ${editedStr ? `<span class="text-steel/50">·</span><i data-lucide="pencil" class="w-2.5 h-2.5 flex-shrink-0 opacity-50"></i><span class="text-steel/70 whitespace-nowrap">Last edited ${editedStr}</span>` : ''}
                  </div>
                  ${pendingDeleteMemoId === entry.id ? `
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-[11px] font-semibold text-red-500">This will remove this memo.</span>
                    <button type="button" data-action="cancel-delete-memo" data-entry-id="${entry.id}" class="text-[11px] font-bold text-steel hover:text-navy transition focus:outline-none">Cancel</button>
                    <button type="button" data-action="confirm-delete-memo" data-id="${activeMemoContact.id}" data-entry-id="${entry.id}" class="text-[11px] font-bold text-red-500 hover:text-red-700 transition focus:outline-none">Delete</button>
                  </div>
                  ` : `
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button type="button" data-action="edit-memo" data-id="${activeMemoContact.id}" data-entry-id="${entry.id}" class="p-1.5 rounded-lg text-steel hover:text-navy hover:bg-softBlue1 transition focus:outline-none" title="Edit memo">
                      <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button type="button" data-action="delete-memo" data-id="${activeMemoContact.id}" data-entry-id="${entry.id}" class="p-1.5 rounded-lg text-steel hover:text-red-500 hover:bg-red-50 transition focus:outline-none" title="Delete memo">
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                  `}
                </div>
                <div class="flex items-center gap-2 min-w-0">
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 ${catMeta.color}">
                    <i data-lucide="${catMeta.icon}" class="w-3 h-3"></i>
                    ${catMeta.label}
                  </span>
                  ${displayTitle ? `<span class="text-sm font-bold text-navy truncate">${escapeHTML(displayTitle)}</span>` : ''}
                </div>
                ${entry.followUpAt ? `<p class="mt-2 text-[10px] font-semibold text-amber flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i>Follow up: ${new Date(entry.followUpAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>` : ''}
                ${entry.meetingAt ? `<p class="mt-2 text-[10px] font-semibold text-navy flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i>Meeting: ${new Date(entry.meetingAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>` : ''}
                ${entry.meetingLink ? `<p class="mt-1 text-[10px] flex items-center gap-1"><a href="${escapeHTML(entry.meetingLink)}" target="_blank" rel="noopener noreferrer" class="text-gold hover:underline truncate flex items-center gap-1"><i data-lucide="link" class="w-3 h-3 flex-shrink-0"></i>${escapeHTML(entry.meetingLink)}</a></p>` : ''}
                <div class="mt-3 text-sm text-navy leading-relaxed break-words whitespace-pre-wrap">${escapeHTML(entry.note)}</div>
              </div>
            `}).join('')}
          </div>
        </section>
      `;
    } else if (viewMode === 'grid') {
      contactsContainer.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';
      contactsContainer.innerHTML = filtered.map(renderContactCard).join('');
    } else {
      contactsContainer.className = 'flex flex-col space-y-2.5 bg-white border border-softBlue2 rounded-2xl p-4 shadow-sm';
      const visibleIds = filtered.map(contact => contact.id);
      const visibleSelectedCount = visibleIds.filter(id => selectedContactIds.has(id)).length;
      const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
      const hasAnySelection = selectedContactIds.size > 0;
      const bulkBar = `
        <div class="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-3 bg-white border-b border-softBlue1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 text-xs font-bold text-navy">
              <input type="checkbox" data-action="toggle-select-all-visible" ${allVisibleSelected ? 'checked' : ''} class="w-4 h-4 accent-navy cursor-pointer">
              <span>Select visible (${visibleSelectedCount}/${visibleIds.length})</span>
            </label>
          </div>
          <div class="flex items-center gap-2 ${hasAnySelection ? '' : 'hidden'}">
            <select id="ct-bulk-action-select" class="min-w-[190px] bg-lightGray border border-softBlue2 text-navy py-2 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-steel text-xs font-semibold cursor-pointer">
              <option value="">Bulk actions</option>
              <option value="delete">Delete selected</option>
              <option value="personal">Mark as Personal</option>
              <option value="business">Mark as Business</option>
            </select>
            <button type="button" id="ct-bulk-action-apply" class="px-4 py-2 text-xs font-bold text-white bg-navy hover:bg-steel rounded-lg border border-navy transition-colors focus:outline-none">
              Apply
            </button>
          </div>
        </div>`;
      const header = `
        <div class="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-steel uppercase tracking-wider border-b border-softBlue1">
          <div class="col-span-1 text-center">Select</div>
          <div class="col-span-3">Contact Profile</div>
          <div class="col-span-3">Contact Channels</div>
          <div class="col-span-2">Tags</div>
          <div class="col-span-3 text-right">Actions</div>
        </div>`;
      contactsContainer.innerHTML = bulkBar + header + filtered.map((c, i) => renderContactRow(c, i, {
        showCheckboxes: true,
        isSelected: selectedContactIds.has(c.id),
      })).join('');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function renderViewToggle() {
    const active   = 'p-2 rounded-lg bg-white text-navy shadow-sm transition-all focus:outline-none';
    const inactive = 'p-2 rounded-lg text-steel hover:text-navy transition-all focus:outline-none';
    viewGridBtn.className = viewMode === 'grid' ? active : inactive;
    viewListBtn.className = viewMode === 'list' ? active : inactive;
    const hidden = contentMode === 'memos';
    viewGridBtn.parentElement.classList.toggle('hidden', hidden);
  }

  function renderContentModeToggle() {
    const active = 'bg-white text-navy shadow-sm';
    const inactive = 'text-steel hover:text-navy';
    modeDirectoryBtn.className = `inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all focus:outline-none ${contentMode === 'directory' ? active : inactive}`;
    modeMemosBtn.className = `inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all focus:outline-none ${contentMode === 'memos' ? active : inactive}`;
    const addBtnSpan = addBtn.querySelector('span');
    if (addBtnSpan) addBtnSpan.textContent = contentMode === 'memos' ? 'Add Memo' : 'Add Contact';
    renderViewToggle();
  }

  // ─── MEMO MODAL ───────────────────────────────────────────────────────────
  function updateMemoFollowUpField() {
    container.querySelector('#ct-memo-followup-field').classList.toggle('hidden', memoCategory !== 'follow-up');
    container.querySelector('#ct-memo-meeting-fields').classList.toggle('hidden', memoCategory !== 'meeting');
  }

  function openMemoModal(entryId = null) {
    if (!selectedMemoContactId) { showToast('Select a contact first.', 'error'); return; }
    const c = contacts.find(x => x.id === selectedMemoContactId);
    editingMemoId = entryId;
    const isEdit = !!entryId;
    const modalHeading = memoBackdrop.querySelector('h3');
    if (modalHeading) modalHeading.textContent = `${isEdit ? 'Edit' : 'Log New'} Activity Memo${c ? ` for ${c.name}` : ''}`;
    const entry = isEdit ? (c?.timeline || []).find(e => e.id === entryId) : null;
    memoCategory = entry?.category || null;
    container.querySelector('#ct-memo-category-select').value = memoCategory || '';
    container.querySelector('#ct-memo-title').value = entry?.title || '';
    container.querySelector('#ct-memo-content').value = entry?.note || '';
    container.querySelector('#ct-memo-followup-dt').value = entry?.followUpAt || '';
    container.querySelector('#ct-memo-meeting-dt').value = entry?.meetingAt || '';
    container.querySelector('#ct-memo-meeting-link').value = entry?.meetingLink || '';
    updateMemoFollowUpField();
    showModal(memoBackdrop, memoInner);
  }

  function saveMemo() {
    const title = container.querySelector('#ct-memo-title').value.trim();
    const content = container.querySelector('#ct-memo-content').value.trim();
    if (!content) { showToast('Content is required.', 'error'); return; }
    const c = contacts.find(x => x.id === selectedMemoContactId);
    if (!c) return;
    if (!c.timeline) c.timeline = [];
    if (editingMemoId) {
      const entry = c.timeline.find(e => e.id === editingMemoId);
      if (!entry) return;
      entry.category = memoCategory || null;
      entry.title = title;
      entry.note = content;
      entry.editedAt = new Date().toISOString();
      entry.followUpAt = memoCategory === 'follow-up' ? (container.querySelector('#ct-memo-followup-dt').value || undefined) : undefined;
      entry.meetingAt  = memoCategory === 'meeting'   ? (container.querySelector('#ct-memo-meeting-dt').value || undefined)   : undefined;
      entry.meetingLink = memoCategory === 'meeting'  ? (container.querySelector('#ct-memo-meeting-link').value.trim() || undefined) : undefined;
    } else {
      const entry = { id: Date.now().toString(), category: memoCategory || null, title, note: content, timestamp: new Date().toISOString() };
      if (memoCategory === 'follow-up') { const dt = container.querySelector('#ct-memo-followup-dt').value; if (dt) entry.followUpAt = dt; }
      if (memoCategory === 'meeting') {
        const dt = container.querySelector('#ct-memo-meeting-dt').value;
        const link = container.querySelector('#ct-memo-meeting-link').value.trim();
        if (dt) entry.meetingAt = dt;
        if (link) entry.meetingLink = link;
      }
      c.timeline.push(entry);
    }
    saveContacts(contacts);
    closeModal(memoBackdrop, memoInner);
    showToast(editingMemoId ? 'Memo updated!' : 'Memo saved!', 'success');
    editingMemoId = null;
    renderContacts();
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
  restructureTopToolbar();
  filterPillsDiv.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle="service"]');
    if (toggle) { hideServiceNumbers = !hideServiceNumbers; renderFilterPills(); renderContacts(); return; }
    const pill = e.target.closest('[data-pill]');
    if (pill) { activeFilter = pill.getAttribute('data-pill'); renderFilterPills(); renderContacts(); }
  });

  searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderContacts(); });
  filterBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterFlyout();
  });
  modeDirectoryBtn.addEventListener('click', () => { contentMode = 'directory'; renderContentModeToggle(); renderContacts(); });
  modeMemosBtn.addEventListener('click', () => { contentMode = 'memos'; renderContentModeToggle(); renderContacts(); });
  sortSelect.addEventListener('change', (e) => { sortMode = e.target.value; renderContacts(); });
  viewGridBtn.addEventListener('click', () => { viewMode = 'grid'; renderContacts(); renderViewToggle(); });
  viewListBtn.addEventListener('click', () => { viewMode = 'list'; renderContacts(); renderViewToggle(); });

  addBtn.addEventListener('click', () => { if (contentMode === 'memos') openMemoModal(); else openAddModal(); });

  container.querySelector('#ct-memo-close').addEventListener('click', () => { editingMemoId = null; closeModal(memoBackdrop, memoInner); });
  container.querySelector('#ct-memo-cancel').addEventListener('click', () => { editingMemoId = null; closeModal(memoBackdrop, memoInner); });
  container.querySelector('#ct-memo-save').addEventListener('click', saveMemo);
  container.querySelector('#ct-memo-category-select').addEventListener('change', (e) => {
    memoCategory = e.target.value || null;
    updateMemoFollowUpField();
  });

  container.querySelector('#ct-empty-add-btn').addEventListener('click', () => {
    if (container.querySelector('#ct-empty-add-btn').dataset.mode === 'clear-filters') {
      activeFilter = 'all';
      hideServiceNumbers = false;
      advancedFilters = createEmptyAdvancedFilters();
      renderFilterPills();
      renderFilterButtonState();
      renderContacts();
      return;
    }
    openAddModal();
  });

  exportBtn.addEventListener('click', () => { exportToJSON(contacts); showToast('Database snapshot exported!', 'success'); });

  filterFlyoutMenu?.addEventListener('mouseover', (e) => {
    const trigger = e.target.closest('[data-filter-menu-trigger]');
    if (!trigger) return;
    activeFilterFlyoutGroup = trigger.getAttribute('data-filter-menu-trigger');
    renderFilterFlyout();
  });

  filterFlyoutMenu?.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-filter-menu-trigger]');
    if (!trigger) return;
    activeFilterFlyoutGroup = trigger.getAttribute('data-filter-menu-trigger');
    renderFilterFlyout();
  });

  filterFlyoutOptions?.addEventListener('change', (e) => {
    const checkbox = e.target.closest('[data-filter-group]');
    if (!checkbox) return;
    const group = checkbox.getAttribute('data-filter-group');
    const value = checkbox.value;
    const nextValues = new Set(advancedFilters[group] || []);
    if (checkbox.checked) nextValues.add(value);
    else nextValues.delete(value);
    advancedFilters[group] = Array.from(nextValues);
    renderFilterButtonState();
    renderFilterFlyout();
    renderContacts();
  });

  filterFlyoutOptions?.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('[data-filter-clear]');
    if (!clearBtn) return;
    clearAdvancedFilters();
  });

  document.addEventListener('click', (e) => {
    if (!isFilterFlyoutOpen) return;
    if (e.target.closest('#ct-filter-btn') || e.target.closest('#ct-filter-flyout')) return;
    closeFilterFlyout();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFilterFlyoutOpen) closeFilterFlyout();
  });

  // Import dropdown: choose JSON backup or direct CSV import
  importBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => importMenu.classList.add('hidden'));
  importMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-import-type]');
    if (!opt) return;
    importMenu.classList.add('hidden');
    const type = opt.getAttribute('data-import-type');
    if (type === 'json') { importInput.click(); return; }
    pendingCsvSource = type; // 'contacts-csv'
    importCsvInput.click();
  });

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

  importCsvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (pendingCsvSource === 'contacts-csv') {
      importFromGoogleCSV(file, (imported) => openImportPreview(imported), () => {
        importFromOutlookCSV(file, (imported) => openImportPreview(imported), (err) => showToast(err, 'error'));
      });
    }
    e.target.value = '';
  });

  // ─── IMPORT PREVIEW ───────────────────────────────────────────────────────
  // Normalize a phone for duplicate comparison: digits only, last 10 (ignores
  // country-code prefixes so +1 305… matches (305)…).
  function phoneKey(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function getImportPhoneStatus(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return 'missing';
    if (digits.length <= 6) return 'utility';
    if (digits.length === 10) return 'valid';
    if (digits.length >= 11 && digits.length <= 13) return 'valid';
    return 'invalid';
  }

  // Flag each imported contact as a duplicate if its phone or email matches an
  // existing contact (or an earlier row in the same file). Duplicates start unchecked.
  function buildImportCandidates(imported) {
    const existingEmails = new Set(contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
    const existingPhones = new Set(contacts.map(c => phoneKey(c.phone)).filter(Boolean));
    const seenEmails = new Set();
    const seenPhones = new Set();
    return imported.map((c) => {
      const emailKey = (c.email || '').toLowerCase();
      const pKey = phoneKey(c.phone);
      let dupReason = '';
      if (emailKey && (existingEmails.has(emailKey) || seenEmails.has(emailKey))) dupReason = 'email';
      else if (pKey && (existingPhones.has(pKey) || seenPhones.has(pKey))) dupReason = 'phone';
      if (emailKey) seenEmails.add(emailKey);
      if (pKey) seenPhones.add(pKey);
      const isDuplicate = Boolean(dupReason);
      const hasPlaceholderName = isPlaceholderImportName(c.name);
      const isSpamLike = isSpamImportName(c.name);
      const phoneStatus = getImportPhoneStatus(c.phone);
      const skipReasons = [];
      if (isDuplicate) skipReasons.push(`Duplicate · ${dupReason}`);
      if (hasPlaceholderName) skipReasons.push('Unnamed');
      if (isSpamLike) skipReasons.push('Spam');
      if (phoneStatus === 'missing') skipReasons.push('No phone');
      if (phoneStatus === 'utility') skipReasons.push('Utility number');
      if (phoneStatus === 'invalid') skipReasons.push('Invalid phone');
      return { contact: c, isDuplicate, dupReason, hasPlaceholderName, isSpamLike, phoneStatus, skipReasons, selected: skipReasons.length === 0 };
    });
  }

  function normalizeImportName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isPlaceholderImportName(name) {
    const normalized = normalizeImportName(name);
    return !normalized || normalized === 'unnamed contact' || normalized === 'unnamed' || normalized === 'unknown' || normalized === 'no name';
  }

  function isSpamImportName(name) {
    return normalizeImportName(name) === 'spam';
  }

  function openImportPreview(imported) {
    importCandidates = buildImportCandidates(imported);
    renderImportList();
    showModal(importBackdrop, importInner);
  }

  function renderImportList() {
    const dupCount = importCandidates.filter(c => c.isDuplicate).length;
    const unnamedCount = importCandidates.filter(c => c.hasPlaceholderName).length;
    const spamCount = importCandidates.filter(c => c.isSpamLike).length;
    const utilityCount = importCandidates.filter(c => c.phoneStatus === 'utility').length;
    const noPhoneCount = importCandidates.filter(c => c.phoneStatus === 'missing').length;
    const invalidPhoneCount = importCandidates.filter(c => c.phoneStatus === 'invalid').length;
    importSummary.textContent = `${importCandidates.length} found · ${dupCount} possible duplicate${dupCount === 1 ? '' : 's'} · ${unnamedCount} unnamed contact${unnamedCount === 1 ? '' : 's'} · ${spamCount} possible spam · ${utilityCount} utility number${utilityCount === 1 ? '' : 's'} · ${noPhoneCount} with no phone · ${invalidPhoneCount} invalid phone${invalidPhoneCount === 1 ? '' : 's'}`;
    importList.innerHTML = importCandidates.map((cand, i) => {
      const c = cand.contact;
      const { bg, text } = getAvatarPalette(c.name);
      const suggestedSkipBadge = cand.skipReasons.length
        ? '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-lightGray text-steel border border-softBlue2 whitespace-nowrap flex-shrink-0">Suggested skip</span>'
        : '';
      const reasonBadges = cand.skipReasons.map((reason) => {
        if (reason.startsWith('Duplicate')) return `<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-amber/15 text-amber border border-amber/30 whitespace-nowrap flex-shrink-0">${reason}</span>`;
        if (reason === 'Spam') return '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap flex-shrink-0">Spam</span>';
        if (reason === 'Utility number') return '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap flex-shrink-0">Utility number</span>';
        if (reason === 'No phone') return '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap flex-shrink-0">No phone</span>';
        if (reason === 'Invalid phone') return '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap flex-shrink-0">Invalid phone</span>';
        return '<span class="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap flex-shrink-0">Unnamed</span>';
      }).join('');
      return `
        <label class="flex items-center gap-3 rounded-xl border ${cand.selected ? 'border-softBlue2 bg-white' : 'border-softBlue1 bg-lightGray/60'} px-3 py-2.5 cursor-pointer transition-colors hover:border-steel">
          <input type="checkbox" data-import-idx="${i}" ${cand.selected ? 'checked' : ''} class="w-4 h-4 accent-navy cursor-pointer flex-shrink-0">
          <span class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-[11px] ${bg} ${text} select-none">${getInitials(c.name)}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-sm font-bold text-navy truncate">${escapeHTML(c.name || 'Unnamed contact')}</p>
              ${suggestedSkipBadge}
              ${reasonBadges}
            </div>
            <p class="text-xs text-steel truncate">${escapeHTML(c.phone || 'No phone')}${c.email ? ' · ' + escapeHTML(c.email) : ''}</p>
          </div>
        </label>`;
    }).join('') || `<div class="text-center py-8 text-steel/60 italic text-xs">Nothing to import.</div>`;
    updateImportFooter();
  }

  function updateImportFooter() {
    const n = importCandidates.filter(c => c.selected).length;
    importConfirmBtn.textContent = `Import Selected (${n})`;
    importConfirmBtn.disabled = n === 0;
    importConfirmBtn.classList.toggle('opacity-50', n === 0);
    importConfirmBtn.classList.toggle('cursor-not-allowed', n === 0);
  }

  function confirmImport() {
    const chosen = importCandidates.filter(c => c.selected).map(c => c.contact);
    if (chosen.length === 0) return;
    chosen.forEach(c => contacts.push(c));
    saveContacts(contacts);
    closeModal(importBackdrop, importInner);
    importCandidates = [];
    renderAll();
    showToast(`Imported ${chosen.length} contact(s).`, 'success');
  }

  importList.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-import-idx]');
    if (!cb) return;
    const i = Number(cb.getAttribute('data-import-idx'));
    importCandidates[i].selected = cb.checked;
    const label = cb.closest('label');
    if (label) {
      label.classList.toggle('bg-white', cb.checked);
      label.classList.toggle('border-softBlue2', cb.checked);
      label.classList.toggle('bg-lightGray/60', !cb.checked);
      label.classList.toggle('border-softBlue1', !cb.checked);
    }
    updateImportFooter();
  });
  container.querySelector('#ct-import-select-all').addEventListener('click', () => {
    importCandidates.forEach(c => { c.selected = true; });
    renderImportList();
  });
  container.querySelector('#ct-import-select-none').addEventListener('click', () => {
    importCandidates.forEach(c => { c.selected = false; });
    renderImportList();
  });
  container.querySelector('#ct-import-close').addEventListener('click', () => closeModal(importBackdrop, importInner));
  container.querySelector('#ct-import-cancel').addEventListener('click', () => closeModal(importBackdrop, importInner));
  importBackdrop.addEventListener('click', (e) => { if (e.target === importBackdrop) closeModal(importBackdrop, importInner); });
  importConfirmBtn.addEventListener('click', confirmImport);

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
      if (action === 'toggle-select-contact') {
        if (selectedContactIds.has(id)) selectedContactIds.delete(id);
        else selectedContactIds.add(id);
        renderContacts();
        return;
      }
      if (action === 'toggle-select-all-visible') {
        const visibleContacts = getFiltered();
        const visibleIds = visibleContacts.map(contact => contact.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(contactId => selectedContactIds.has(contactId));
        if (allVisibleSelected) {
          visibleIds.forEach(contactId => selectedContactIds.delete(contactId));
        } else {
          visibleIds.forEach(contactId => selectedContactIds.add(contactId));
        }
        renderContacts();
        return;
      }
      if (action === 'view-profile') { openDetailModal(id); return; }
      if (action === 'call' || action === 'email') { return; }
      if (action === 'select-memo-contact') {
        selectedMemoContactId = id;
        pendingDeleteMemoId = null;
        renderContacts();
        return;
      }
      if (action === 'toggle-fav') { toggleFavorite(id); return; }
      if (action === 'edit')       { openEditModal(id);   return; }
      if (action === 'delete')     { openDeleteModal(id); return; }
      if (action === 'edit-memo') {
        selectedMemoContactId = id;
        openMemoModal(actionBtn.getAttribute('data-entry-id'));
        return;
      }
      if (action === 'delete-memo') {
        pendingDeleteMemoId = actionBtn.getAttribute('data-entry-id');
        renderContacts();
        return;
      }
      if (action === 'cancel-delete-memo') {
        pendingDeleteMemoId = null;
        renderContacts();
        return;
      }
      if (action === 'confirm-delete-memo') {
        const c = contacts.find(x => x.id === id);
        if (!c) return;
        c.timeline = (c.timeline || []).filter(e => e.id !== actionBtn.getAttribute('data-entry-id'));
        pendingDeleteMemoId = null;
        saveContacts(contacts);
        showToast('Memo deleted.', 'success');
        renderContacts();
        return;
      }
      return;
    }
    const card = e.target.closest('[data-action="open-detail"]');
    if (card) openDetailModal(card.getAttribute('data-id'));
  });
  contactsContainer.addEventListener('click', (e) => {
    const bulkApplyBtn = e.target.closest('#ct-bulk-action-apply');
    if (!bulkApplyBtn) return;
    const actionSelect = contactsContainer.querySelector('#ct-bulk-action-select');
    const action = actionSelect?.value;
    if (!action) {
      showToast('Choose a bulk action first.', 'error');
      return;
    }
    applyBulkAction(action);
    if (actionSelect) actionSelect.value = '';
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
