/**
 * Shell Widget Deck Component
 * Self-contained module managing the right utility drawer.
 */
import { loadContacts } from '../contacts/storage.js';

const faviconCache = new Map();
const UNASSIGNED_LINK_CATEGORY = 'unassigned';

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function getFaviconCandidates(url, altFaviconDomain = '') {
  function fromDomain(value) {
    if (!value) return [];
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const { origin, hostname } = new URL(normalized);
      return [
        `${origin}/favicon.ico`,
        `${origin}/apple-touch-icon.png`,
        `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
      ];
    } catch { return []; }
  }
  return [...fromDomain(altFaviconDomain), ...fromDomain(url)];
}

function applyFaviconToImg(imgEl, cacheKey, url, altFaviconDomain = '') {
  if (faviconCache.has(cacheKey)) {
    imgEl.src = faviconCache.get(cacheKey);
    return;
  }
  const candidates = getFaviconCandidates(url, altFaviconDomain);
  if (!candidates.length) { imgEl.style.display = 'none'; return; }
  let i = 0;
  imgEl.onerror = () => {
    i++;
    if (i < candidates.length) { imgEl.src = candidates[i]; return; }
    imgEl.onerror = null;
    imgEl.style.display = 'none';
  };
  imgEl.onload = () => {
    faviconCache.set(cacheKey, imgEl.src);
    imgEl.onload = null;
  };
  imgEl.src = candidates[0];
}

export function createWidgetDeck() {
  const aside = document.createElement('aside');
  aside.className = 'shell-widget-deck w-[23rem] bg-[linear-gradient(180deg,#13243f_0%,#0d1c33_100%)] border-l border-[#203756] flex flex-col relative flex-shrink-0 text-white select-none shadow-[inset_1px_0_0_rgba(255,255,255,0.03)]';
  const LINKS_KEY = 'lo_command_workspace_links';
  const responsiveWidgetSyncers = new Set();

  // State: active widgets — persisted to localStorage so state survives tab switches and page refreshes
  const DECK_KEY = 'lo_command_widget_active';
  let activeWidgets = (() => {
    try {
      const saved = localStorage.getItem(DECK_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })();

  // State: per-widget flex-grow weights so users can resize modules by dragging the
  // handle between two adjacent modules. Persisted so sizing survives refresh.
  const WEIGHTS_KEY = 'lo_command_widget_weights';
  let widgetWeights = (() => {
    try {
      const saved = localStorage.getItem(WEIGHTS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  })();
  function persistWeights() {
    try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(widgetWeights)); } catch {}
  }

  function refreshResponsiveWidgets() {
    responsiveWidgetSyncers.forEach((sync) => sync());
  }

  // Build a draggable divider that resizes the module above and below it. Dragging
  // down grows the module above (and shrinks the one below); dragging up does the
  // reverse. The two modules' combined weight stays constant, so others are untouched.
  function createResizeHandle() {
    const handle = document.createElement('div');
    handle.className = 'widget-resize-handle group flex-shrink-0 h-3 flex items-center justify-center cursor-row-resize touch-none';
    handle.innerHTML = `<div class="h-1 w-10 rounded-full bg-white/10 group-hover:bg-white/30 transition-colors"></div>`;

    handle.addEventListener('pointerdown', (e) => {
      const currentSlot = handle.closest('.widget-stack-item');
      const nextSlot = currentSlot?.nextElementSibling;
      const prev = currentSlot?.querySelector('.widget-wrapper');
      const next = nextSlot?.querySelector('.widget-wrapper');
      if (!currentSlot || !nextSlot || !prev || !next) return;
      e.preventDefault();

      const startY = e.clientY;
      const hA = prev.getBoundingClientRect().height;
      const hB = next.getBoundingClientRect().height;
      const totalH = hA + hB;
      const wA = parseFloat(currentSlot.style.flexGrow) || 1;
      const wB = parseFloat(nextSlot.style.flexGrow) || 1;
      const totalW = wA + wB;
      const idA = currentSlot.dataset.widgetId;
      const idB = nextSlot.dataset.widgetId;
      const MIN = 64; // minimum pixel height per module

      handle.setPointerCapture(e.pointerId);
      handle.querySelector('div').classList.add('bg-gold/60');
      document.body.style.cursor = 'row-resize';

      const onMove = (ev) => {
        let delta = ev.clientY - startY;
        delta = Math.max(-(hA - MIN), Math.min(hB - MIN, delta));
        const newWA = ((hA + delta) / totalH) * totalW;
        const newWB = ((hB - delta) / totalH) * totalW;
        currentSlot.style.flexGrow = newWA;
        nextSlot.style.flexGrow = newWB;
        widgetWeights[idA] = newWA;
        widgetWeights[idB] = newWB;
        refreshResponsiveWidgets();
      };
      const onUp = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.querySelector('div').classList.remove('bg-gold/60');
        document.body.style.cursor = '';
        persistWeights();
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });

    return handle;
  }

  function bindWidgetReorder(slot) {
    const dragHandle = slot.querySelector('[data-widget-drag-handle]');
    if (!dragHandle) return;

    dragHandle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, textarea, select, label, [contenteditable="true"]')) return;

      const startRect = slot.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerOffsetY = e.clientY - startRect.top;
      let dragging = false;
      let placeholder = null;

      const startDrag = () => {
        dragging = true;
        placeholder = document.createElement('div');
        placeholder.className = 'widget-drag-placeholder rounded-[1.35rem] border border-dashed border-gold/40 bg-white/[0.04]';
        placeholder.style.height = `${startRect.height}px`;
        placeholder.style.flexShrink = '0';

        widgetsContainer.insertBefore(placeholder, slot);
        widgetsContainer.appendChild(slot);

        slot.classList.add('z-[70]', 'shadow-[0_20px_40px_rgba(0,0,0,0.28)]');
        slot.style.position = 'fixed';
        slot.style.left = `${startRect.left}px`;
        slot.style.top = `${startRect.top}px`;
        slot.style.width = `${startRect.width}px`;
        slot.style.height = `${startRect.height}px`;
        slot.style.pointerEvents = 'none';
        slot.style.transform = 'scale(1.02)';
        slot.style.opacity = '0.96';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      };

      const movePlaceholder = (clientY) => {
        const siblings = [...widgetsContainer.querySelectorAll('.widget-stack-item')].filter((item) => item !== slot);
        let inserted = false;
        for (const sibling of siblings) {
          const rect = sibling.getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) {
            widgetsContainer.insertBefore(placeholder, sibling);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          widgetsContainer.appendChild(placeholder);
        }
      };

      const onMove = (ev) => {
        if (!dragging) {
          const deltaX = Math.abs(ev.clientX - startX);
          const deltaY = Math.abs(ev.clientY - startY);
          if (Math.max(deltaX, deltaY) < 6) return;
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

        widgetsContainer.insertBefore(slot, placeholder);
        placeholder.remove();

        slot.classList.remove('z-[70]', 'shadow-[0_20px_40px_rgba(0,0,0,0.28)]');
        slot.style.position = '';
        slot.style.left = '';
        slot.style.top = '';
        slot.style.width = '';
        slot.style.height = '';
        slot.style.pointerEvents = '';
        slot.style.transform = '';
        slot.style.opacity = '';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        activeWidgets = [...widgetsContainer.querySelectorAll('.widget-stack-item')].map((item) => item.dataset.widgetId);
        updateDeck();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    });
  }

  function bindQuickActionsLayout(widgetElement) {
    const host = widgetElement.querySelector('[data-quick-actions-host]') || widgetElement;
    const grid = widgetElement.querySelector('[data-quick-actions-grid]');
    const buttons = [...widgetElement.querySelectorAll('[data-quick-action]')];
    if (!grid || buttons.length === 0) return;

    const applyDensity = (density) => {
      grid.style.gap = density === 'compact' ? '0.375rem' : density === 'tight' ? '0.5rem' : '0.625rem';

      buttons.forEach((button) => {
        const iconWrap = button.querySelector('[data-quick-action-icon]');
        const label = button.querySelector('[data-quick-action-label]');
        const meta = button.querySelector('[data-quick-action-meta]');

        if (density === 'compact') {
          button.style.minHeight = '44px';
          button.style.gap = '0.375rem';
          button.style.padding = '0.5rem';
          button.style.borderRadius = '0.75rem';
          iconWrap.style.width = '1.75rem';
          iconWrap.style.height = '1.75rem';
          iconWrap.style.borderRadius = '0.6rem';
          label.style.fontSize = '9px';
          label.style.lineHeight = '1.1';
          label.style.letterSpacing = '0.12em';
          meta.style.fontSize = '9px';
          meta.style.lineHeight = '1.1';
        } else if (density === 'tight') {
          button.style.minHeight = '50px';
          button.style.gap = '0.5rem';
          button.style.padding = '0.625rem';
          button.style.borderRadius = '1rem';
          iconWrap.style.width = '2rem';
          iconWrap.style.height = '2rem';
          iconWrap.style.borderRadius = '0.75rem';
          label.style.fontSize = '10px';
          label.style.lineHeight = '1.15';
          label.style.letterSpacing = '0.13em';
          meta.style.fontSize = '9px';
          meta.style.lineHeight = '1.15';
        } else {
          button.style.minHeight = '56px';
          button.style.gap = '0.5rem';
          button.style.padding = '0.75rem';
          button.style.borderRadius = '1rem';
          iconWrap.style.width = '2.25rem';
          iconWrap.style.height = '2.25rem';
          iconWrap.style.borderRadius = '0.75rem';
          label.style.fontSize = '11px';
          label.style.lineHeight = '1.2';
          label.style.letterSpacing = '0.14em';
          meta.style.fontSize = '10px';
          meta.style.lineHeight = '1.2';
        }
      });
    };

    const syncDensity = () => {
      const { width, height } = host.getBoundingClientRect();
      const density = height < 190 || width < 255 ? 'compact' : height < 240 || width < 290 ? 'tight' : 'full';
      applyDensity(density);
    };

    syncDensity();
    requestAnimationFrame(syncDensity);
    responsiveWidgetSyncers.add(syncDensity);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        syncDensity();
      });
      observer.observe(host);
      widgetElement._quickActionsObserver = observer;
    }

    widgetElement._quickActionsSync = syncDensity;
  }
  
  // State: Checklist elements
  let stickyNoteDraft = '';

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '#';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function loadBookmarkedLinks() {
    try {
      const saved = localStorage.getItem(LINKS_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(link => link.bookmarked && link.category !== UNASSIGNED_LINK_CATEGORY) : [];
    } catch {
      return [];
    }
  }

  function loadAllLinks() {
    try {
      const saved = localStorage.getItem(LINKS_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(link => link.category !== UNASSIGNED_LINK_CATEGORY) : [];
    } catch {
      return [];
    }
  }

  function loadFavoriteContacts() {
    const contacts = loadContacts() || [];
    return Array.isArray(contacts)
      ? contacts.filter((contact) => contact.favorite)
      : [];
  }

  // Configuration and rendering rules for each widget type
  const widgetDefinitions = {
    contacts: {
      id: 'contacts',
      title: 'Favorite Contacts',
      iconClass: 'fa-solid fa-user-group text-gold text-xs mr-1.5',
      render: () => {
        const contacts = loadFavoriteContacts();

        return `
          <div class="space-y-2 py-1 text-[11px] text-slate-300">
            ${contacts.length === 0 ? `<span class="text-[10px] text-slate-400">No favorite contacts yet.</span>` : contacts.map(c => `
              <div class="flex items-center justify-between py-1 border-b border-steel/15">
                <div class="flex items-center gap-2">
                  <span class="h-6 w-6 rounded bg-steel/30 text-white font-bold text-[10px] flex items-center justify-center border border-steel/40 flex-shrink-0">
                    ${getInitials(c.name)}
                  </span>
                  <div class="truncate">
                    <p class="font-semibold text-white truncate leading-tight">${c.name}</p>
                    <p class="text-[9px] text-slate-400 mt-0.5"><i class="fa-solid fa-phone mr-1 opacity-70"></i>${c.phone || 'No phone'}</p>
                  </div>
                </div>
                <a href="${c.email ? `mailto:${c.email}` : `tel:${c.phone || ''}`}" class="text-gold hover:text-white transition text-[9px] ml-2 ${!c.email && !c.phone ? 'pointer-events-none opacity-40' : ''}">
                  <i class="fa-solid fa-envelope text-[11px]"></i>
                </a>
              </div>
            `).join('')}
          </div>
        `;
      }
    },
    links: {
      id: 'links',
      title: 'Favorite Links',
      iconClass: 'fa-solid fa-link text-gold text-xs mr-1.5',
      render: () => {
        const links = loadBookmarkedLinks();

        return `
          <div class="flex flex-wrap gap-1.5 py-1.5">
            ${links.length === 0 ? `<span class="text-[10px] text-slate-400">No bookmarked links yet.</span>` : links.map(l => `
              <a href="${normalizeUrl(l.url)}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-steel/35 hover:bg-steel/60 border border-steel/50 rounded-full text-[10px] text-slate-200 transition duration-150">
                <span class="h-4 w-4 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img data-link-id="${l.id}" data-favicon-url="${l.url}" data-alt-favicon-domain="${l.altFaviconDomain || ''}" alt="" class="h-4 w-4 object-fill">
                </span>
                <span class="font-medium max-w-[110px] truncate">${l.name}</span>
              </a>
            `).join('')}
          </div>
        `;
      }
    },
    allLinks: {
      id: 'allLinks',
      title: 'Links',
      iconClass: 'fa-solid fa-link text-gold text-xs mr-1.5',
      render: () => {
        const links = loadAllLinks();
        if (links.length === 0) {
          return `<div class="py-1.5"><span class="text-[10px] text-slate-400">No links yet.</span></div>`;
        }

        const CATEGORY_LABELS = {
          'communications': { label: 'Communications', icon: 'fa-solid fa-bell' },
          'mlg-platforms':  { label: 'MLG Platforms',  icon: 'fa-solid fa-globe' },
          'mortgage-tech':  { label: 'Mortgage Tech',  icon: 'fa-solid fa-sack-dollar' },
          'productivity':   { label: 'Productivity',   icon: 'fa-solid fa-building' },
          'lender-portals': { label: 'Lender Portals', icon: 'fa-solid fa-building-columns' },
        };

        const groups = new Map();
        links.forEach(l => {
          const key = l.category || 'other';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(l);
        });

        const sections = [...groups.entries()].map(([key, items], idx) => {
          const meta = CATEGORY_LABELS[key] || { label: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: 'fa-solid fa-link' };
          const { label, icon } = meta;
          const pills = items.map(l => `
            <a href="${normalizeUrl(l.url)}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-steel/35 hover:bg-steel/60 border border-steel/50 rounded-full text-[10px] text-slate-200 transition duration-150">
              <span class="h-4 w-4 flex items-center justify-center overflow-hidden flex-shrink-0">
                <img data-link-id="${l.id}" data-favicon-url="${l.url}" data-alt-favicon-domain="${l.altFaviconDomain || ''}" alt="" class="h-4 w-4 object-fill">
              </span>
              <span class="font-medium max-w-[110px] truncate">${l.name}</span>
            </a>
          `).join('');

          return `
            ${idx > 0 ? '<div class="border-t border-steel/20 mt-2.5 mb-2"></div>' : ''}
            <p class="text-[9px] font-bold uppercase tracking-widest text-softBlue2 opacity-70 mb-1.5 flex items-center gap-1.5"><i class="${icon}"></i>${label}</p>
            <div class="flex flex-wrap gap-1.5">${pills}</div>
          `;
        });

        return `<div class="py-1.5">${sections.join('')}</div>`;
      }
    },
    stickyNote: {
      id: 'stickyNote',
      title: 'Quick Sticky Note',
      iconClass: 'fa-solid fa-note-sticky text-gold text-xs mr-1.5',
      render: () => {
        return `
          <div class="flex h-full flex-col gap-3 py-1">
            <p class="text-[10px] leading-4 text-slate-400">
              Temporary notes only. This won’t be saved.
            </p>
            <div class="flex-1 rounded-[1.75rem] border border-[#e0c86d] bg-[linear-gradient(180deg,#fff8bf_0%,#f7e48a_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_14px_28px_rgba(0,0,0,0.12)]">
              <textarea
                data-sticky-note-input
                placeholder="Jot down a quick phone number, task, or reminder..."
                class="h-full min-h-[190px] w-full resize-none rounded-[1.1rem] border border-[#e5cf7d] bg-[#fff7b2]/90 px-4 py-3.5 text-[13px] leading-6 text-[#5b4a16] placeholder:text-[#9b884e] focus:border-[#cba638] focus:outline-none"
              >${stickyNoteDraft}</textarea>
            </div>
          </div>
        `;
      }
    },
    quickActions: {
      id: 'quickActions',
      title: 'Quick Actions',
      iconClass: 'fa-solid fa-bolt text-gold text-xs mr-1.5',
      render: () => {
        const actions = [
          { id: 'add-link', label: 'Add Link', icon: 'fa-solid fa-link', tone: 'active' },
          { id: 'add-contact', label: 'Add Contact', icon: 'fa-solid fa-user-plus', tone: 'active' },
          { id: 'add-task', label: 'Add Task', icon: 'fa-solid fa-square-check', tone: 'placeholder' },
          { id: 'add-loan', label: 'Add Loan', icon: 'fa-solid fa-sack-dollar', tone: 'placeholder' },
        ];

        return `
          <div data-quick-actions-host class="py-1 h-full">
            <div data-quick-actions-grid class="grid h-full grid-cols-2 gap-2.5 auto-rows-fr">
              ${actions.map((action) => `
                <button
                  type="button"
                  data-quick-action="${action.id}"
                  ${action.tone === 'placeholder' ? 'disabled' : ''}
                  class="inline-flex h-full min-h-[56px] items-center gap-2 rounded-2xl border px-3 py-3 text-left transition focus:outline-none ${
                    action.tone === 'active'
                      ? 'border-[#34527c] bg-white/[0.05] text-white hover:border-[#4a698f] hover:bg-white/[0.08]'
                      : 'cursor-not-allowed border-white/8 bg-white/[0.03] text-slate-500'
                  }"
                >
                  <span data-quick-action-icon class="flex h-9 w-9 items-center justify-center rounded-xl ${
                    action.tone === 'active' ? 'bg-gold/12 text-gold' : 'bg-white/[0.04] text-slate-500'
                  }">
                    <i class="${action.icon} text-sm"></i>
                  </span>
                  <span class="min-w-0">
                    <span data-quick-action-label class="block text-[11px] font-bold uppercase tracking-[0.14em]">${action.label}</span>
                    <span data-quick-action-meta class="mt-0.5 block text-[10px] ${action.tone === 'active' ? 'text-slate-400' : 'text-slate-500'}">${action.tone === 'active' ? 'Open now' : 'Placeholder'}</span>
                  </span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
    },
  };

  // Base shell structure for the widget deck
  aside.innerHTML = `
    <!-- Right Pane Controls Header -->
    <div class="px-4 py-3.5 border-b border-white/6 flex items-center justify-between z-10 select-none flex-shrink-0">
        <div class="flex min-w-0 flex-1 justify-start">
            <span class="text-[0.72rem] font-bold text-softBlue2 uppercase tracking-[0.2em] opacity-80">Utility Deck</span>
        </div>

        <!-- Add Button and Dropdown Anchor -->
        <div class="relative flex-shrink-0">
            <button id="add-widget-btn" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#314c72] bg-white/[0.05] px-3 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#4a698f] hover:bg-white/[0.08] focus:outline-none" title="Add Widget">
                <i class="fa-solid fa-plus text-[11px]"></i>
                <span>Add Widget</span>
            </button>

            <!-- Add Widget Dropdown Options (Initially Hidden) -->
            <div id="widget-dropdown" class="hidden absolute right-0 mt-3 w-56 bg-[#122540] border border-[#274264] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.32)] z-50 overflow-hidden divide-y divide-white/8">
                <div class="px-4 py-2.5 bg-white/[0.04] text-[10px] font-bold text-softBlue2 uppercase tracking-[0.16em]">
                    Insert Module
                </div>
                <div id="dropdown-options-list">
                    <!-- Populated dynamically by javascript -->
                </div>
            </div>
        </div>
    </div>

    <!-- Widget Area (Handles dynamic proportional scaling and independent scroll) -->
    <div id="widgets-container" class="flex-1 flex flex-col overflow-hidden px-4 py-4 bg-transparent relative">
        <!-- Fallback view when no widgets exist -->
        <div id="empty-state" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none">
            <div class="h-12 w-12 rounded-full border border-dashed border-steel/60 flex items-center justify-center mb-4 opacity-60">
                <i class="fa-solid fa-layer-group text-softBlue2 text-sm"></i>
            </div>
            <h3 class="text-sm font-bold text-white mb-1">Deck is Empty</h3>
            <p class="text-xs text-slate-400 max-w-xs leading-relaxed">
                Customize your panel layout by selecting active trackers from the menu above.
            </p>
            <div class="absolute top-4 right-10 animate-bounce text-gold">
                <i class="fa-solid fa-arrow-up text-sm"></i>
            </div>
        </div>
    </div>
  `;

  const addBtn = aside.querySelector('#add-widget-btn');
  const dropdown = aside.querySelector('#widget-dropdown');
  const dropdownOptionsList = aside.querySelector('#dropdown-options-list');
  const widgetsContainer = aside.querySelector('#widgets-container');
  const emptyState = aside.querySelector('#empty-state');

  // Toggle dropdown visibility on click
  addBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });

  window.addEventListener('contacts-updated', updateDeck);
  window.addEventListener('workspace-links-updated', updateDeck);

  // Re-render and update widgets container
  function updateDeck() {
    // Persist state so it survives tab switches, HMR, and page refreshes
    try { localStorage.setItem(DECK_KEY, JSON.stringify(activeWidgets)); } catch {}

    // 1. Toggle Empty View State
    if (activeWidgets.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }

    // 2. Clear old widget wrappers and resize handles
    widgetsContainer.querySelectorAll('.widget-wrapper').forEach((widget) => {
      if (widget._quickActionsObserver) {
        widget._quickActionsObserver.disconnect();
      }
      if (widget._quickActionsSync) {
        responsiveWidgetSyncers.delete(widget._quickActionsSync);
      }
    });
    widgetsContainer.querySelectorAll('.widget-stack-item, .widget-drag-placeholder').forEach(w => w.remove());

    // 3. Render current active widgets
    activeWidgets.forEach((widgetId, index) => {
      const def = widgetDefinitions[widgetId];
      const slot = document.createElement('div');
      slot.className = 'widget-stack-item min-h-0 flex flex-col';
      slot.dataset.widgetId = widgetId;
      slot.style.flexGrow = widgetWeights[widgetId] || 1;
      slot.style.flexShrink = '1';
      slot.style.flexBasis = '0%';

      const element = document.createElement('div');
      element.className = 'widget-wrapper min-h-0 flex flex-1 flex-col rounded-[1.35rem] border border-[#284262] bg-[linear-gradient(180deg,rgba(20,39,67,0.95)_0%,rgba(14,29,51,0.98)_100%)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_28px_rgba(0,0,0,0.16)]';
      element.dataset.widgetId = widgetId;

      element.innerHTML = `
        <!-- Compact Header -->
        <div data-widget-drag-handle class="flex items-center justify-between mb-3 flex-shrink-0 pb-2 border-b border-white/8 select-none cursor-grab active:cursor-grabbing">
            <span class="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white/95 flex items-center">
                <i class="${def.iconClass}"></i>
                ${def.title}
            </span>
            
            <button class="remove-widget-btn h-7 w-7 hover:bg-white/[0.06] rounded-lg text-slate-400 hover:text-gold transition flex items-center justify-center focus:outline-none" title="Remove Module">
                <i class="fa-solid fa-xmark text-[11px] font-bold"></i>
            </button>
        </div>

        <!-- Scrollable Section -->
        <div class="widget-content flex-1 overflow-y-auto custom-scrollbar pr-1">
            ${def.render()}
        </div>
      `;

      // Wire up remove button
      const removeBtn = element.querySelector('.remove-widget-btn');
      removeBtn.addEventListener('click', () => {
        activeWidgets = activeWidgets.filter(id => id !== widgetId);
        updateDeck();
      });

      if (widgetId === 'stickyNote') {
        const noteInput = element.querySelector('[data-sticky-note-input]');
        noteInput?.addEventListener('input', (event) => {
          stickyNoteDraft = event.target.value;
        });
      }

      if (widgetId === 'quickActions') {
        element.querySelectorAll('[data-quick-action]').forEach((button) => {
          button.addEventListener('click', () => {
            const action = button.getAttribute('data-quick-action');
            window.dispatchEvent(new CustomEvent('deck-quick-action', { detail: { action } }));
          });
        });
        bindQuickActionsLayout(element);
      }

      // Apply favicons for link widgets
      element.querySelectorAll('[data-favicon-url]').forEach(img => {
        applyFaviconToImg(img, img.dataset.linkId, img.dataset.faviconUrl, img.dataset.altFaviconDomain || '');
      });

      slot.appendChild(element);

      // Insert a drag handle between this module and the next one
      if (index < activeWidgets.length - 1) {
        slot.appendChild(createResizeHandle());
      }

      bindWidgetReorder(slot);
      widgetsContainer.appendChild(slot);
    });

    refreshResponsiveWidgets();

    // 4. Update Dropdown Option Listings dynamically
    const available = Object.keys(widgetDefinitions).filter(id => !activeWidgets.includes(id));
    if (available.length === 0) {
      addBtn.disabled = true;
      addBtn.className = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/6 bg-white/[0.03] px-3 text-xs font-semibold text-slate-500 cursor-not-allowed";
      addBtn.title = "All items active";
    } else {
      addBtn.disabled = false;
      addBtn.className = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#314c72] bg-white/[0.05] px-3 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#4a698f] hover:bg-white/[0.08] focus:outline-none";
      addBtn.title = "Add Module";
    }

    dropdownOptionsList.innerHTML = '';
    available.forEach(id => {
      const def = widgetDefinitions[id];
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'w-full text-left px-4 py-3 text-xs text-slate-200 hover:bg-white/[0.05] transition flex items-center justify-between group focus:outline-none';
      optBtn.innerHTML = `
        <span class="flex items-center text-[11px]">
            <i class="${def.iconClass}"></i>
            ${def.title}
        </span>
        <i class="fa-solid fa-plus opacity-0 group-hover:opacity-100 text-gold text-[10px] transition-all"></i>
      `;
      optBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (activeWidgets.length < 4) {
          activeWidgets.push(id);
          updateDeck();
        }
        dropdown.classList.add('hidden');
      });
      dropdownOptionsList.appendChild(optBtn);
    });
  }

  // ── Horizontal pane resize ────────────────────────────────────────────────
  // Let users shrink the right pane. The current width (23rem) is the hard upper
  // limit — it can't be stretched wider. The lower limit keeps content legible so
  // users never need to resize the widgets themselves just to read them.
  const DECK_WIDTH_KEY = 'lo_command_deck_width';
  const DECK_MAX_W = 368; // 23rem — current size, the maximum
  const DECK_MIN_W = 288; // 18rem — narrowest width that still shows info clearly
  const clampDeckW = (w) => Math.max(DECK_MIN_W, Math.min(DECK_MAX_W, w));
  let deckWidth = (() => {
    try {
      const v = parseFloat(localStorage.getItem(DECK_WIDTH_KEY));
      return Number.isFinite(v) ? clampDeckW(v) : DECK_MAX_W;
    } catch { return DECK_MAX_W; }
  })();
  aside.style.width = `${deckWidth}px`;

  const widthHandle = document.createElement('div');
  widthHandle.className = 'group absolute left-0 top-0 h-full w-1.5 -ml-0.5 z-20 cursor-col-resize flex items-center justify-center touch-none';
  widthHandle.innerHTML = `<div class="h-10 w-1 rounded-full bg-white/10 group-hover:bg-gold/60 transition-colors"></div>`;
  widthHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = aside.getBoundingClientRect().width;
    widthHandle.setPointerCapture(e.pointerId);
    widthHandle.querySelector('div').classList.add('bg-gold/60');
    document.body.style.cursor = 'col-resize';

    const onMove = (ev) => {
      // Pane is on the right, so dragging the left edge right shrinks it
      deckWidth = clampDeckW(startW - (ev.clientX - startX));
      aside.style.width = `${deckWidth}px`;
    };
    const onUp = () => {
      widthHandle.releasePointerCapture(e.pointerId);
      widthHandle.removeEventListener('pointermove', onMove);
      widthHandle.removeEventListener('pointerup', onUp);
      widthHandle.querySelector('div').classList.remove('bg-gold/60');
      document.body.style.cursor = '';
      try { localStorage.setItem(DECK_WIDTH_KEY, String(deckWidth)); } catch {}
    };
    widthHandle.addEventListener('pointermove', onMove);
    widthHandle.addEventListener('pointerup', onUp);
  });
  aside.appendChild(widthHandle);

  // Draw initial state (empty)
  updateDeck();

  return aside;
}
