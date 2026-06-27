export function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const paletteList = [
  { bg: 'bg-navy',   text: 'text-white border-gold border-2' },
  { bg: 'bg-steel',  text: 'text-white border-softBlue2 border-2' },
  { bg: 'bg-teal',   text: 'text-white' },
  { bg: 'bg-green',  text: 'text-white' },
  { bg: 'bg-amber',  text: 'text-white' },
];

export function getAvatarPalette(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return paletteList[Math.abs(hash) % paletteList.length];
}

function renderTagChips(tags, maxVisible = 3) {
  const list = tags || [];
  if (list.length === 0) return '<span class="text-[10px] text-steel/50 italic">No tags</span>';
  const visible = list.slice(0, maxVisible);
  const overflow = list.length - maxVisible;
  return visible.map(t =>
    `<span class="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded-md bg-softBlue2 text-steel border border-softBlue2/60 whitespace-nowrap">${escapeHTML(t)}</span>`
  ).join('') + (overflow > 0
    ? `<span class="px-2 py-0.5 text-[10px] text-steel/60 rounded-md whitespace-nowrap">+${overflow}</span>`
    : '');
}

export function renderContactCard(contact) {
  const { bg, text } = getAvatarPalette(contact.name);
  const initials = getInitials(contact.name);
  const logCount = (contact.timeline || []).length;
  const starClass = contact.favorite ? 'text-gold fill-gold' : '';

  return `
  <div class="bg-white rounded-2xl border-2 border-softBlue2 hover:border-steel p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative cursor-pointer" data-action="open-detail" data-id="${contact.id}">
    <div class="absolute top-4 right-4 flex items-center space-x-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10">
      <button data-action="toggle-fav" data-id="${contact.id}" class="p-1.5 rounded-lg bg-lightGray hover:bg-softBlue1 text-steel hover:text-gold transition-colors focus:outline-none" title="Toggle Favorite">
        <i data-lucide="star" class="w-4 h-4 ${starClass}"></i>
      </button>
      <button data-action="edit" data-id="${contact.id}" class="p-1.5 rounded-lg bg-lightGray hover:bg-softBlue1 text-steel hover:text-navy transition-colors focus:outline-none" title="Edit">
        <i data-lucide="edit" class="w-4 h-4"></i>
      </button>
      <button data-action="delete" data-id="${contact.id}" class="p-1.5 rounded-lg bg-lightGray hover:bg-amber/10 text-steel hover:text-amber transition-colors focus:outline-none" title="Delete">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>

    <div class="flex items-center space-x-3.5 pb-4 border-b border-softBlue1">
      <div class="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-base ${bg} ${text} shadow-inner select-none">
        ${initials}
      </div>
      <div class="min-w-0 flex-grow">
        <h4 class="text-sm font-bold text-navy group-hover:text-steel truncate transition-colors">${escapeHTML(contact.name)}</h4>
        <p class="text-xs text-steel truncate mt-0.5 font-medium">${escapeHTML(contact.role || 'No Corporate Role')}</p>
      </div>
    </div>

    <div class="py-4 space-y-2.5 text-xs text-navy">
      <div class="flex items-center space-x-2.5">
        <i data-lucide="phone" class="w-3.5 h-3.5 text-steel flex-shrink-0"></i>
        <span class="truncate font-medium">${escapeHTML(contact.phone)}</span>
      </div>
      <div class="flex items-center space-x-2.5">
        <i data-lucide="mail" class="w-3.5 h-3.5 text-steel flex-shrink-0"></i>
        <span class="truncate ${contact.email ? '' : 'text-steel/55 italic'}">${escapeHTML(contact.email || 'No email specified')}</span>
      </div>
      <div class="flex items-center space-x-2.5">
        <i data-lucide="building" class="w-3.5 h-3.5 text-steel flex-shrink-0"></i>
        <span class="truncate ${contact.company ? '' : 'text-steel/55 italic'}">${escapeHTML(contact.company || 'Personal Contact')}</span>
      </div>
      <div class="flex items-center space-x-2.5 pt-1 text-steel">
        <i data-lucide="clipboard-list" class="w-3.5 h-3.5 text-gold flex-shrink-0"></i>
        <span class="text-[11px] font-bold">${logCount} Timed Activity Memo(s)</span>
      </div>
    </div>

    <div class="pt-3 border-t border-softBlue1 flex items-center justify-between gap-2">
      <div class="flex flex-wrap gap-1 min-w-0 flex-1">
        ${renderTagChips(contact.tags)}
      </div>
      <div class="flex space-x-1.5 flex-shrink-0">
        <a href="tel:${escapeHTML(contact.phone)}" data-action="call" data-id="${contact.id}" class="p-1.5 rounded-lg text-green bg-lightGray hover:bg-softBlue1 transition-all" title="Call">
          <i data-lucide="phone-call" class="w-3.5 h-3.5"></i>
        </a>
        ${contact.email ? `<a href="mailto:${escapeHTML(contact.email)}" data-action="email" data-id="${contact.id}" class="p-1.5 rounded-lg text-steel bg-lightGray hover:bg-softBlue1 transition-all" title="Email"><i data-lucide="send" class="w-3.5 h-3.5"></i></a>` : ''}
      </div>
    </div>
  </div>`;
}

export function renderContactRow(contact, index) {
  const { bg, text } = getAvatarPalette(contact.name);
  const initials = getInitials(contact.name);
  const logCount = (contact.timeline || []).length;
  const starClass = contact.favorite ? 'text-gold fill-gold' : '';
  const altClass = index % 2 === 1 ? 'bg-lightGray/85' : 'bg-white';

  return `
  <div class="grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-xl transition-all border border-transparent hover:border-steel hover:bg-softBlue1 cursor-pointer ${altClass}" data-action="open-detail" data-id="${contact.id}">
    <div class="col-span-4 flex items-center space-x-3">
      <div class="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-xs ${bg} ${text} select-none">
        ${initials}
      </div>
      <div class="min-w-0">
        <h4 class="text-sm font-bold text-navy truncate">${escapeHTML(contact.name)}</h4>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-[10px] text-steel flex items-center gap-1 font-semibold">
            <i data-lucide="clipboard-list" class="w-3 h-3 text-gold"></i>
            <span>${logCount} logs</span>
          </span>
        </div>
      </div>
    </div>
    <div class="col-span-3 text-xs text-navy space-y-0.5">
      <p class="flex items-center gap-1.5 font-medium"><i data-lucide="phone" class="w-3.5 h-3.5 text-steel flex-shrink-0"></i>${escapeHTML(contact.phone)}</p>
      <p class="flex items-center gap-1.5 ${contact.email ? '' : 'text-steel/55 italic'}"><i data-lucide="mail" class="w-3.5 h-3.5 text-steel flex-shrink-0"></i>${escapeHTML(contact.email || 'No email specified')}</p>
    </div>
    <div class="col-span-3 flex flex-wrap gap-1 items-center">
      ${renderTagChips(contact.tags, 2)}
    </div>
    <div class="col-span-2 flex items-center justify-end space-x-1.5">
      <button data-action="toggle-fav" data-id="${contact.id}" class="p-1.5 rounded-lg text-steel hover:text-gold hover:bg-white/80 transition-all focus:outline-none" title="Toggle Favorite">
        <i data-lucide="star" class="w-4 h-4 ${starClass}"></i>
      </button>
      <button data-action="edit" data-id="${contact.id}" class="p-1.5 rounded-lg text-steel hover:text-navy hover:bg-white/80 transition-all focus:outline-none" title="Edit">
        <i data-lucide="edit" class="w-4 h-4"></i>
      </button>
      <button data-action="delete" data-id="${contact.id}" class="p-1.5 rounded-lg text-steel hover:text-amber hover:bg-white/80 transition-all focus:outline-none" title="Delete">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  </div>`;
}

export function renderTimelineEntry(entry) {
  const formatted = new Date(entry.timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  return `
  <div class="relative pb-1 group/note">
    <span class="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-gold border border-white ring-4 ring-white"></span>
    <div class="bg-lightGray p-3 rounded-xl border border-softBlue2 transition-all hover:bg-softBlue1">
      <div class="flex items-center justify-between mb-1.5 text-[10px] text-steel font-bold">
        <span class="flex items-center gap-1">
          <i data-lucide="clock" class="w-3 h-3"></i>
          <span>${formatted}</span>
        </span>
        <button data-action="delete-note" data-note-id="${entry.id}" class="text-steel hover:text-amber opacity-100 sm:opacity-0 group-hover/note:opacity-100 transition-opacity focus:outline-none" title="Delete Note">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <p class="text-xs font-semibold text-navy leading-relaxed break-words whitespace-pre-wrap">${escapeHTML(entry.note)}</p>
    </div>
  </div>`;
}
