/**
 * Shell Sidebar Component
 */
export function createSidebar(activeTab, onTabChange) {
  const aside = document.createElement('aside');
  aside.className = 'shell-sidebar w-72 bg-[linear-gradient(180deg,#13243f_0%,#0d1c33_100%)] border-r border-[#203756] flex flex-col justify-between flex-shrink-0 text-slate-200 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]';
  
  aside.innerHTML = `
    <div>
        <div class="px-6 pt-10 pb-5 border-b border-white/6 select-none">
            <span class="text-[0.72rem] font-bold text-softBlue2 uppercase tracking-[0.22em] opacity-70">Workspace Core</span>
        </div>
        
        <!-- Navigation Tabs -->
        <nav class="px-4 py-6 space-y-3" id="sidebar-nav">
        </nav>
    </div>

    <!-- Left Panel Base Security Banner -->
    <div class="m-5 rounded-[1.6rem] border border-[#233b5e] bg-[linear-gradient(180deg,rgba(20,39,67,0.92)_0%,rgba(13,27,49,0.98)_100%)] px-5 py-6 flex flex-col gap-4 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_32px_rgba(0,0,0,0.18)]">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-softBlue2">
                <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-green/30 bg-green/10 text-green">
                    <i class="fa-solid fa-shield-halved text-sm"></i>
                </span>
                <span class="text-[0.78rem] font-bold uppercase tracking-[0.16em] text-white">Authenticated Domain</span>
            </div>
            <i class="fa-solid fa-chevron-right text-softBlue2/70 text-xs"></i>
        </div>
        <p class="text-sm text-slate-300/85 leading-8">
            Secure local segment active. Core side panel controls are set to globally active status.
        </p>
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
      <div class="flex w-full items-center gap-4 px-5 py-4">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl border ${isActive ? 'border-white/10 bg-white/6 text-white' : 'border-transparent bg-white/[0.03] text-softBlue2 group-hover:text-white'} transition-all">
          <i class="${tab.iconClass} text-base"></i>
        </span>
        <span class="text-[1.05rem] font-semibold tracking-[-0.01em]">${tab.label}</span>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (onTabChange) {
        onTabChange(tab.id);
      }
    });

    nav.appendChild(btn);
  });

  return aside;
}
