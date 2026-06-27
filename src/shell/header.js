/**
 * Shell Header Component
 */
export function createHeader() {
  const header = document.createElement('header');
  header.className = 'relative overflow-visible bg-navy text-white h-16 px-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 border-b-4 border-gold shadow-md z-20 flex-shrink-0';
  
  header.innerHTML = `
    <!-- Brand Segment -->
    <div class="flex items-center space-x-3 select-none">
        <div class="h-9 w-9 bg-gold rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
            <span class="text-navy font-black text-xl tracking-tighter">M</span>
        </div>
        <div>
            <h1 class="text-base font-bold tracking-wider text-white leading-none">LO COMMAND</h1>
            <p class="text-[9px] text-softBlue2 uppercase tracking-widest font-semibold opacity-80 mt-1">Mortgage Loan Officer Command Center</p>
        </div>
    </div>

    <!-- Universal Search -->
    <div class="hidden md:flex justify-center min-w-0">
        <div id="global-search-shell" class="relative w-full max-w-2xl">
            <label for="global-search" class="group relative flex w-full items-center rounded-full border border-slate-200 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.18)] transition focus-within:border-[#9fb8d6] focus-within:shadow-[0_18px_40px_rgba(15,23,42,0.24)] hover:border-slate-300">
                <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 text-slate-400 text-sm"></i>
                <input
                    id="global-search"
                    type="text"
                    placeholder="Search contacts, modules, and actions"
                    class="w-full rounded-full bg-transparent py-3 pl-11 pr-28 text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none"
                    autocomplete="off"
                    spellcheck="false"
                />
                <span class="pointer-events-none absolute right-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
                    Ctrl + K
                </span>
            </label>

            <div id="global-search-panel" class="hidden absolute left-0 right-0 top-[calc(100%+0.75rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
                <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                    <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Universal Search</p>
                    <p class="mt-1 text-xs text-slate-500">Jump between modules, quick actions, and contacts.</p>
                </div>
                <div id="global-search-results" class="max-h-[26rem] overflow-y-auto py-2"></div>
                <div id="global-search-empty" class="hidden px-4 py-8 text-center">
                    <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <i class="fa-solid fa-magnifying-glass text-sm"></i>
                    </div>
                    <p class="text-sm font-semibold text-slate-700">No matches found</p>
                    <p class="mt-1 text-xs text-slate-500">Try searching by contact name, module, or action.</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Utility Segment -->
    <div class="flex items-center justify-end space-x-4">
        <button type="button" id="header-settings-btn" class="p-2 rounded-full text-softBlue1 hover:bg-slate-800 transition focus:outline-none" aria-label="Settings">
            <i class="fa-solid fa-gear text-sm"></i>
        </button>

        <!-- Notifications Indicator (Purely Decorative) -->
        <div class="relative p-1.5 rounded-full hover:bg-slate-800 transition cursor-not-allowed">
            <span class="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green"></span>
            <i class="fa-regular fa-bell text-softBlue1 text-sm"></i>
        </div>

        <!-- Active User Info (Purely Decorative) -->
        <div class="flex items-center space-x-2.5 border-l border-steel/60 pl-4 select-none">
            <div class="h-8 w-8 rounded-full bg-steel border border-gold flex items-center justify-center font-bold text-xs text-white">
                AM
            </div>
            <div class="hidden lg:block text-left leading-none">
                <p class="text-xs font-semibold text-white">Arthur M.</p>
                <p class="text-[8px] text-gold mt-1 uppercase tracking-wider font-semibold">Underwriter</p>
            </div>
        </div>
    </div>
  `;
  
  return header;
}
