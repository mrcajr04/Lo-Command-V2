/**
 * Shell Widget Deck Component
 * Self-contained module managing the right utility drawer.
 */

const faviconCache = new Map();

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
  aside.className = 'w-72 bg-navy border-l border-steel/40 flex flex-col relative flex-shrink-0 text-white select-none';
  const LINKS_KEY = 'lo_command_workspace_links';

  // State: active widgets — persisted to localStorage so state survives tab switches and page refreshes
  const DECK_KEY = 'lo_command_widget_active';
  let activeWidgets = (() => {
    try {
      const saved = localStorage.getItem(DECK_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })();
  
  // State: Checklist elements
  let tasksData = [
    { id: 1, text: 'Verify income for Patterson loan', completed: false },
    { id: 2, text: 'Review unit 4B title commitment', completed: false },
    { id: 3, text: 'Approve rate lock extension request', completed: false },
    { id: 4, text: 'Dispatch disclosure packet - #903', completed: false }
  ];

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '#';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function loadBookmarkedLinks() {
    try {
      const saved = localStorage.getItem(LINKS_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(link => link.bookmarked) : [];
    } catch {
      return [];
    }
  }

  function loadAllLinks() {
    try {
      const saved = localStorage.getItem(LINKS_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Configuration and rendering rules for each widget type
  const widgetDefinitions = {
    contacts: {
      id: 'contacts',
      title: 'Favorite Contacts',
      iconClass: 'fa-solid fa-user-group text-gold text-xs mr-1.5',
      render: () => {
        const contacts = [
          { initials: 'SJ', name: 'Sarah Jenkins', phone: '(555) 019-2834', email: 's.jenkins@mlghome.com' },
          { initials: 'MV', name: 'Marcus Vance', phone: '(555) 014-9921', email: 'm.vance@mlghome.com' },
          { initials: 'DP', name: 'Diana Prince', phone: '(555) 017-8833', email: 'diana@princeholdings.co' },
          { initials: 'DM', name: 'David Miller', phone: '(555) 015-4409', email: 'dmiller@fidelitytitle.com' }
        ];

        return `
          <div class="space-y-2 py-1 text-[11px] text-slate-300">
            ${contacts.map(c => `
              <div class="flex items-center justify-between py-1 border-b border-steel/15">
                <div class="flex items-center gap-2">
                  <span class="h-6 w-6 rounded bg-steel/30 text-white font-bold text-[10px] flex items-center justify-center border border-steel/40 flex-shrink-0">
                    ${c.initials}
                  </span>
                  <div class="truncate">
                    <p class="font-semibold text-white truncate leading-tight">${c.name}</p>
                    <p class="text-[9px] text-slate-400 mt-0.5"><i class="fa-solid fa-phone mr-1 opacity-70"></i>${c.phone}</p>
                  </div>
                </div>
                <a href="mailto:${c.email}" class="text-gold hover:text-white transition text-[9px] ml-2">
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
    tasks: {
      id: 'tasks',
      title: 'Due Today (Pending Tasks)',
      iconClass: 'fa-solid fa-square-check text-gold text-xs mr-1.5',
      render: () => {
        return `
          <div class="space-y-1.5 py-1 text-[11px] text-slate-300">
            ${tasksData.map(task => `
              <div data-task-id="${task.id}" class="task-item flex items-start gap-2 py-1.5 border-b border-steel/15 cursor-pointer select-none transition ${task.completed ? 'opacity-40 line-through' : ''}">
                <div class="h-3.5 w-3.5 rounded border mt-0.5 flex items-center justify-center flex-shrink-0 transition ${task.completed ? 'bg-green border-green text-white' : 'bg-navy border-steel hover:border-gold'}">
                  ${task.completed ? '<i class="fa-solid fa-check text-[8px] stroke-[3]"></i>' : ''}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[11px] leading-tight text-slate-200 font-medium ${task.completed ? 'text-slate-500' : ''}">
                    ${task.text}
                  </p>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    },
    rates: {
      id: 'rates',
      title: 'Market Interest Rates',
      iconClass: 'fa-solid fa-chart-line text-gold text-xs mr-1.5',
      render: () => {
        const rates = [
          { label: '30-Yr Fixed Gold Pref', val: '6.125%', change: '-0.05%' },
          { label: '15-Yr Fixed Core Loan', val: '5.375%', change: '0.00%' },
          { label: '5/1 ARM Premium Jumbo', val: '6.500%', change: '+0.12%' }
        ];

        return `
          <div class="space-y-1.5 py-1 text-[11px] text-slate-300">
            ${rates.map(r => `
              <div class="flex items-center justify-between py-1 border-b border-steel/15">
                <span class="font-medium text-slate-300 truncate max-w-[150px]">${r.label}</span>
                <div class="text-right">
                  <span class="font-bold text-white font-mono">${r.val}</span>
                  <span class="text-[9px] font-semibold font-sans ${r.change.startsWith('-') ? 'text-green-400' : r.change.startsWith('+') ? 'text-amber-400' : 'text-slate-400'} ml-1">${r.change}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
  };

  // Base shell structure for the widget deck
  aside.innerHTML = `
    <!-- Right Pane Controls Header -->
    <div class="p-3.5 border-b border-steel/20 flex items-center justify-between bg-navy z-10 select-none flex-shrink-0">
        <div class="flex flex-col">
            <span class="text-[9px] font-bold text-softBlue2 uppercase tracking-widest opacity-70">Workspace Deck</span>
            <span class="text-xs font-semibold text-white">Interactive Utility Deck</span>
        </div>

        <!-- Add Button and Dropdown Anchor -->
        <div class="relative">
            <button id="add-widget-btn" class="p-1.5 rounded bg-steel/30 border border-steel/50 hover:bg-steel/50 hover:border-gold text-white transition flex items-center justify-center focus:outline-none" title="Add Widget">
                <i class="fa-solid fa-plus text-xs"></i>
            </button>

            <!-- Add Widget Dropdown Options (Initially Hidden) -->
            <div id="widget-dropdown" class="hidden absolute right-0 mt-2 w-52 bg-navy border border-steel/60 rounded-lg shadow-xl z-50 overflow-hidden divide-y divide-steel/30">
                <div class="px-3 py-1.5 bg-steel/30 text-[9px] font-bold text-softBlue2 uppercase tracking-wider">
                    Insert Module
                </div>
                <div id="dropdown-options-list">
                    <!-- Populated dynamically by javascript -->
                </div>
            </div>
        </div>
    </div>

    <!-- Widget Area (Handles dynamic proportional scaling and independent scroll) -->
    <div id="widgets-container" class="flex-1 flex flex-col overflow-hidden divide-y divide-steel/20 bg-navy relative">
        <!-- Fallback view when no widgets exist -->
        <div id="empty-state" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none">
            <div class="h-10 w-10 rounded-full border border-dashed border-steel/60 flex items-center justify-center mb-3 opacity-60">
                <i class="fa-solid fa-layer-group text-softBlue2 text-sm"></i>
            </div>
            <h3 class="text-xs font-bold text-white mb-1">Deck is Empty</h3>
            <p class="text-[10px] text-slate-400 max-w-xs leading-relaxed">
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

    // 2. Clear old widget wrappers
    const oldWrappers = widgetsContainer.querySelectorAll('.widget-wrapper');
    oldWrappers.forEach(w => w.remove());

    // 3. Render current active widgets
    activeWidgets.forEach(widgetId => {
      const def = widgetDefinitions[widgetId];
      const element = document.createElement('div');
      element.className = 'widget-wrapper flex-1 min-h-0 flex flex-col p-3.5 bg-navy';
      
      element.innerHTML = `
        <!-- Compact Header -->
        <div class="flex items-center justify-between mb-2 flex-shrink-0 pb-1 border-b border-steel/20 select-none">
            <span class="text-[9px] font-bold uppercase tracking-wider text-softBlue2 flex items-center">
                <i class="${def.iconClass}"></i>
                ${def.title}
            </span>
            
            <button class="remove-widget-btn p-0.5 hover:bg-steel/40 rounded text-slate-400 hover:text-gold transition flex items-center justify-center focus:outline-none" title="Remove Module">
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

      // Bind local task toggle interaction
      if (widgetId === 'tasks') {
        const contentArea = element.querySelector('.widget-content');
        bindTaskListeners(contentArea, def);
      }

      // Apply favicons for link widgets
      element.querySelectorAll('[data-favicon-url]').forEach(img => {
        applyFaviconToImg(img, img.dataset.linkId, img.dataset.faviconUrl, img.dataset.altFaviconDomain || '');
      });

      widgetsContainer.appendChild(element);
    });

    // Helper to bind task check-offs and redraw the list inside tasks widget
    function bindTaskListeners(contentArea, def) {
      const taskItems = contentArea.querySelectorAll('.task-item');
      taskItems.forEach(item => {
        item.addEventListener('click', () => {
          const taskId = parseInt(item.getAttribute('data-task-id'));
          const task = tasksData.find(t => t.id === taskId);
          if (task) {
            task.completed = !task.completed;
          }
          contentArea.innerHTML = def.render();
          bindTaskListeners(contentArea, def);
        });
      });
    }

    // 4. Update Dropdown Option Listings dynamically
    const available = Object.keys(widgetDefinitions).filter(id => !activeWidgets.includes(id));
    if (available.length === 0) {
      addBtn.disabled = true;
      addBtn.className = "p-1.5 rounded bg-steel/10 border border-steel/20 text-slate-500 cursor-not-allowed flex items-center justify-center";
      addBtn.title = "All items active";
    } else {
      addBtn.disabled = false;
      addBtn.className = "p-1.5 rounded bg-steel/30 border border-steel/50 hover:bg-steel/50 hover:border-gold text-white transition flex items-center justify-center focus:outline-none";
      addBtn.title = "Add Module";
    }

    dropdownOptionsList.innerHTML = '';
    available.forEach(id => {
      const def = widgetDefinitions[id];
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-steel/30 transition flex items-center justify-between group focus:outline-none';
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

  // Draw initial state (empty)
  updateDeck();

  return aside;
}
