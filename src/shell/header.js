/**
 * Shell Header Component
 */
export function createHeader() {
  const header = document.createElement('header');
  header.className = 'shell-header relative overflow-visible text-white h-[6.25rem] px-6 md:px-8 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 border-b border-gold/80 shadow-[0_22px_48px_rgba(3,10,24,0.35)] z-20 flex-shrink-0';
  
  header.innerHTML = `
    <!-- Brand Segment -->
    <div class="flex items-center space-x-4 select-none">
        <div class="flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-gold/65 bg-[radial-gradient(circle_at_30%_28%,#f4d777_0%,#cfa52e_42%,#8f6a14_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_28px_rgba(0,0,0,0.28)] flex-shrink-0">
            <span class="text-navy font-black text-[1.75rem] tracking-[-0.08em]">M</span>
        </div>
        <div>
            <h1 class="text-[1.9rem] font-extrabold tracking-[-0.03em] text-white leading-none">LO COMMAND</h1>
            <p class="text-[0.68rem] text-softBlue2 uppercase tracking-[0.24em] font-semibold opacity-90 mt-2">Mortgage Loan Officer Command Center</p>
        </div>
    </div>

    <!-- Universal Search -->
    <div class="hidden md:flex justify-center min-w-0">
        <div id="global-search-shell" class="relative w-full max-w-3xl">
            <label for="global-search" class="group relative flex h-14 w-full items-center rounded-[1.65rem] border border-[#355177] bg-[linear-gradient(180deg,rgba(27,42,69,0.95)_0%,rgba(20,34,58,0.98)_100%)] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_36px_rgba(1,8,20,0.28)] transition focus-within:border-[#5476a2] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(1,8,20,0.34)] hover:border-[#44658f]">
                <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-6 text-softBlue2/85 text-base"></i>
                <input
                    id="global-search"
                    type="text"
                    placeholder="Search contacts, modules, and actions"
                    class="w-full rounded-[1.45rem] bg-transparent py-3 pl-14 pr-28 text-lg font-medium text-white placeholder:text-softBlue2/70 focus:outline-none"
                    autocomplete="off"
                    spellcheck="false"
                />
                <span class="pointer-events-none absolute right-3 inline-flex h-10 items-center rounded-full border border-[#415b81] bg-white/5 px-4 text-xs font-bold tracking-[0.18em] text-softBlue2/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    Ctrl + K
                </span>
            </label>

            <div id="global-search-panel" class="hidden absolute left-0 right-0 top-[calc(100%+0.9rem)] overflow-hidden rounded-[1.6rem] border border-[#dbe7f4] bg-white shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
                <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/90">
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
        <button type="button" id="header-settings-btn" class="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2d466b] bg-[linear-gradient(180deg,rgba(20,34,58,0.96)_0%,rgba(13,25,46,0.98)_100%)] text-softBlue1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#48678f] hover:text-white focus:outline-none" aria-label="Settings">
            <i class="fa-solid fa-gear text-lg"></i>
        </button>

        <!-- Notifications Indicator (Purely Decorative) -->
        <div class="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2d466b] bg-[linear-gradient(180deg,rgba(20,34,58,0.96)_0%,rgba(13,25,46,0.98)_100%)] text-softBlue1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition cursor-not-allowed">
            <span class="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_0_3px_rgba(201,160,44,0.18)]"></span>
            <i class="fa-regular fa-bell text-lg"></i>
        </div>

        <!-- Active User Info (Purely Decorative) -->
        <div class="flex items-center space-x-3 rounded-[1.4rem] border border-[#274162] bg-[linear-gradient(180deg,rgba(26,52,90,0.95)_0%,rgba(18,36,63,0.98)_100%)] py-3 pl-3 pr-4 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(180deg,#395780_0%,#233b60_100%)] border border-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] font-bold text-lg text-white">
                AM
            </div>
            <div class="hidden lg:block text-left leading-none min-w-[8rem]">
                <p class="text-xl font-semibold text-white">Arthur M.</p>
                <p class="text-xs text-softBlue2 mt-1 font-medium">Underwriter</p>
            </div>
            <i class="fa-solid fa-chevron-down hidden lg:block text-softBlue2/70 text-sm"></i>
        </div>
    </div>
  `;
  
  return header;
}
