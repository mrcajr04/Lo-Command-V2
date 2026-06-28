/**
 * Shell Sidebar Component
 */
export function createSidebar(activeTab, onTabChange, options = {}) {
  const { collapsed = false, onToggleCollapse = null } = options;
  const aside = document.createElement('aside');
  aside.className = `shell-sidebar group/sidebar ${collapsed ? 'w-20' : 'w-60'} bg-[linear-gradient(180deg,#13243f_0%,#0d1c33_100%)] border-r border-[#203756] flex flex-col justify-between flex-shrink-0 text-slate-200 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] transition-[width] duration-300 ease-out overflow-visible`;
  
  aside.innerHTML = `
    <div>
        <div class="${collapsed ? 'px-3 pt-6 pb-4' : 'px-6 pt-10 pb-5'} border-b border-white/6 select-none">
            <div class="flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3">
                <span class="sidebar-copy ${collapsed ? 'hidden' : 'opacity-100'} overflow-hidden whitespace-nowrap text-[0.72rem] font-bold text-softBlue2 uppercase tracking-[0.22em] transition-all duration-200 opacity-70">Workspace Core</span>
                <button id="sidebar-collapse-btn" type="button" class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-softBlue2 hover:text-white hover:border-[#4a698f] hover:bg-white/[0.08] transition-all focus:outline-none" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
                    <i class="fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'} text-sm"></i>
                </button>
            </div>
        </div>
        
        <!-- Navigation Tabs -->
        <nav class="${collapsed ? 'px-3 py-5' : 'px-4 py-6'} space-y-3" id="sidebar-nav">
        </nav>
    </div>
  `;

  const nav = aside.querySelector('#sidebar-nav');
  const tabs = [
    { id: 'tasks', label: 'Tasks', iconClass: 'fa-solid fa-list-check' },
    { id: 'contacts', label: 'Contacts', iconClass: 'fa-solid fa-users' },
    { id: 'vault', label: 'Vault', iconClass: 'fa-solid fa-vault' }
  ];

  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full group relative flex items-center rounded-[1.1rem] transition duration-200 text-left focus:outline-none';
    
    const isActive = activeTab === tab.id;
    if (isActive) {
      btn.className += ' bg-[linear-gradient(180deg,rgba(38,57,89,0.96)_0%,rgba(29,47,77,0.98)_100%)] text-white border border-[#314b71] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(0,0,0,0.14)]';
    } else {
      btn.className += ' text-slate-300 hover:bg-white/[0.035] hover:text-white';
    }

    btn.innerHTML = `
      <span class="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full ${isActive ? 'bg-gold shadow-[0_0_14px_rgba(201,160,44,0.55)]' : 'bg-transparent'}"></span>
      <div class="flex w-full items-center ${collapsed ? 'justify-center px-3 py-4 gap-0' : 'gap-4 px-5 py-4'} transition-all duration-200">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl border ${isActive ? 'border-white/10 bg-white/6 text-white' : 'border-transparent bg-white/[0.03] text-softBlue2 group-hover:text-white'} transition-all">
          <i class="${tab.iconClass} text-base"></i>
        </span>
        <span class="sidebar-copy ${collapsed ? 'hidden' : 'opacity-100'} overflow-hidden whitespace-nowrap text-[1.05rem] font-semibold tracking-[-0.01em] transition-all duration-200">${tab.label}</span>
      </div>
      ${collapsed ? `<span class="sidebar-tooltip pointer-events-none invisible absolute left-[calc(100%+0.75rem)] top-1/2 z-[80] -translate-y-1/2 rounded-lg border border-[#314b71] bg-navy px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition-all duration-200 whitespace-nowrap">${tab.label}</span>` : ''}
    `;

    if (collapsed) {
      const tooltip = btn.querySelector('.sidebar-tooltip');
      const showTooltip = () => {
        tooltip?.classList.remove('invisible', 'opacity-0');
        tooltip?.classList.add('visible', 'opacity-100');
      };
      const hideTooltip = () => {
        tooltip?.classList.add('invisible', 'opacity-0');
        tooltip?.classList.remove('visible', 'opacity-100');
      };
      btn.onmouseenter = showTooltip;
      btn.onmouseover = showTooltip;
      btn.onmousemove = showTooltip;
      btn.onfocus = showTooltip;
      btn.onmouseleave = hideTooltip;
      btn.onmouseout = hideTooltip;
      btn.onblur = hideTooltip;
    }

    btn.addEventListener('click', () => {
      if (onTabChange) {
        onTabChange(tab.id);
      }
    });

    nav.appendChild(btn);
  });

  aside.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => {
    onToggleCollapse?.(!collapsed);
  });

  return aside;
}
