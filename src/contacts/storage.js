import { getItem, setItem } from '../shared/storage.js';

const CONTACTS_KEY = 'lo_command_contacts';

const DEFAULT_CONTACTS = [
  {
    id: '1',
    name: 'Sandra Reeves',
    phone: '(305) 847-2210',
    email: 'sreeves@pinnaclefunding.com',
    company: 'Pinnacle Funding Group',
    role: 'Senior Loan Underwriter',
    category: 'business',
    tags: ['Lenders'],
    notes: 'Preferred contact for conventional loans. Fast turnaround, typically 48h.',
    favorite: true,
    createdAt: new Date('2026-01-10').toISOString(),
    timeline: [
      { id: 't1', note: 'Called to confirm file submission for Johnson deal. Clear to close expected Friday.', timestamp: new Date('2026-06-20').toISOString() },
      { id: 't2', note: 'Introduced to the new rate sheet effective Q2. She confirmed pricing is competitive.', timestamp: new Date('2026-05-15').toISOString() }
    ]
  },
  {
    id: '2',
    name: 'Marcus DeLeon',
    phone: '(786) 334-9910',
    email: 'mdeleon@southerncoasttitle.com',
    company: 'Southern Coast Title',
    role: 'Settlement Agent',
    category: 'business',
    tags: ['Title Companies'],
    notes: 'Handles closings in Miami-Dade. Very responsive on weekends.',
    favorite: false,
    createdAt: new Date('2026-02-03').toISOString(),
    timeline: [
      { id: 't3', note: 'Confirmed wire instructions for the Rivera closing — Tuesday 10AM.', timestamp: new Date('2026-06-18').toISOString() }
    ]
  },
  {
    id: '3',
    name: 'Jennifer Castillo',
    phone: '(954) 221-7741',
    email: 'jcastillo@gmail.com',
    company: '',
    role: '',
    category: 'personal',
    tags: ['Clients'],
    notes: 'Pre-approval completed. Looking for a 3/2 in Kendall area, budget $550k.',
    favorite: true,
    createdAt: new Date('2026-03-22').toISOString(),
    timeline: []
  },
  {
    id: '4',
    name: 'Robert Huang',
    phone: '(305) 990-4482',
    email: 'rhuang@apexrealty.com',
    company: 'Apex Realty Group',
    role: 'Real Estate Agent',
    category: 'business',
    tags: ['Referral Partners'],
    notes: 'Sends 2-3 referrals per month. Prefers text for quick updates.',
    favorite: false,
    createdAt: new Date('2026-04-05').toISOString(),
    timeline: [
      { id: 't4', note: 'Met at networking event. Agreed to co-host a first-time buyer seminar in August.', timestamp: new Date('2026-06-12').toISOString() }
    ]
  },
  {
    id: '5',
    name: 'Diane Morales',
    phone: '(561) 778-3356',
    email: 'dmorales@brickellbank.com',
    company: 'Brickell Community Bank',
    role: 'Portfolio Loan Officer',
    category: 'business',
    tags: ['Lenders'],
    notes: 'Specializes in non-QM and bank statement loans. Good for self-employed borrowers.',
    favorite: false,
    createdAt: new Date('2026-05-01').toISOString(),
    timeline: []
  }
];

// One-time migration: converts old `group` string field to a tag, assigns category: 'business'.
// Safe to run on already-migrated data — no-ops if `category` already exists.
export function migrateContacts(contacts) {
  let changed = false;
  const migrated = contacts.map(c => {
    if (!('category' in c)) {
      changed = true;
      const existingTags = Array.isArray(c.tags) ? c.tags : [];
      const groupTag = c.group ? [c.group] : [];
      const newTags = [...new Set([...groupTag, ...existingTags])];
      const { group, ...rest } = c;
      return { ...rest, category: 'business', tags: newTags };
    }
    if (!Array.isArray(c.tags)) {
      changed = true;
      return { ...c, tags: [] };
    }
    return c;
  });
  return { migrated, changed };
}

export function loadContacts() {
  return getItem(CONTACTS_KEY, null);
}

export function saveContacts(contacts) {
  setItem(CONTACTS_KEY, contacts);
}

export function initializeIfEmpty() {
  const contacts = loadContacts();
  if (contacts === null) {
    saveContacts(DEFAULT_CONTACTS);
    return;
  }
  // Migrate existing localStorage data to the new shape
  const { migrated, changed } = migrateContacts(contacts);
  if (changed) saveContacts(migrated);
}

export function exportToJSON(contacts) {
  const payload = JSON.stringify({ contacts }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lo_command_contacts_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromJSON(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.contacts)) throw new Error('Invalid format');
      onSuccess(parsed.contacts);
    } catch {
      onError('Import failed: invalid or unrecognized file format.');
    }
  };
  reader.readAsText(file);
}
