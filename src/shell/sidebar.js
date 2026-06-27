/**
 * Shell Sidebar Component
 */
export function createSidebar(activeTab, onTabChange) {
  const aside = document.createElement('aside');
  aside.className = 'w-60 bg-navy border-r border-steel/40 flex flex-col justify-between flex-shrink-0 text-slate-200';
  
  aside.innerHTML = `
    <div>
        <div class="p-4 border-b border-steel/20 select-none">
            <span class="text-[9px] font-bold text-softBlue2 uppercase tracking-widest opacity-60">Workspace Core</span>
        </div>
        
        <!-- Navigation Tabs -->
        <nav class="p-3 space-y-1" id="sidebar-nav">
        </nav>
    </div>

    <!-- Left Panel Base Security Banner -->
    <div class="p-3.5 m-3 bg-steel/15 border border-steel/30 rounded-lg flex flex-col gap-1.5 select-none">
        <div class="flex items-center gap-1.5 text-softBlue2">
            <i class="fa-solid fa-shield-halved text-gold text-[10px]"></i>
            <span class="text-[9px] font-bold uppercase tracking-wider">Authenticated Domain</span>
        </div>
        <p class="text-[10px] text-slate-400 leading-normal">
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
    btn.className = 'w-full flex items-center px-3 py-2.5 rounded-md transition duration-150 text-left focus:outline-none';
    
    const isActive = activeTab === tab.id;
    if (isActive) {
      btn.className += ' bg-steel/30 text-white border-l-4 border-gold pl-2';
    } else {
      btn.className += ' text-slate-300 hover:bg-steel/15 hover:text-white';
    }

    btn.innerHTML = `
      <div class="flex items-center space-x-3">
        <i class="${tab.iconClass} ${isActive ? 'text-gold' : 'text-softBlue2'} text-xs"></i>
        <span class="text-xs font-medium">${tab.label}</span>
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
