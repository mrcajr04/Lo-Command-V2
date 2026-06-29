import { getItem, setItem } from '../shared/storage.js';
import { syncToCloud } from '../lib/userDataSync.js';

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
  syncToCloud(CONTACTS_KEY, contacts);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contacts-updated'));
  }
}

export function resetContactsToDefault() {
  saveContacts(DEFAULT_CONTACTS);
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

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped "" quotes, and CRLF/LF.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Parse a CSV exported from Outlook (desktop or Outlook.com) into our contact model.
export function importFromOutlookCSV(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rows = parseCSV(String(e.target.result).replace(/^﻿/, '')); // strip BOM
      if (rows.length < 2) throw new Error('empty');

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const valByName = (row, name) => {
        const i = headers.indexOf(name.toLowerCase());
        return i >= 0 ? String(row[i] || '').trim() : '';
      };
      const firstByNames = (row, names) => {
        for (const n of names) { const v = valByName(row, n); if (v) return v; }
        return '';
      };
      const firstByPredicate = (row, pred) => {
        for (let i = 0; i < headers.length; i++) {
          if (pred(headers[i])) { const v = String(row[i] || '').trim(); if (v) return v; }
        }
        return '';
      };

      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(v => !String(v).trim())) continue;

        const first  = firstByNames(row, ['First Name', 'Given Name']);
        const middle = valByName(row, 'Middle Name');
        const last   = firstByNames(row, ['Last Name', 'Family Name', 'Surname']);
        const email  = firstByNames(row, ['E-mail Address', 'E-mail 1 Address', 'E-mail 2 Address', 'Email Address', 'E-mail'])
          || firstByPredicate(row, h => h.includes('mail') && h.includes('address'))
          || firstByPredicate(row, h => h.includes('mail'));

        let name = [first, middle, last].filter(Boolean).join(' ').trim();
        if (!name) name = firstByNames(row, ['Display Name', 'Name', 'Nickname']) || (email ? email.split('@')[0] : '');

        const phone = firstByNames(row, ['Mobile Phone', 'Business Phone', 'Home Phone', 'Primary Phone', 'Business Phone 2', 'Other Phone'])
          || firstByPredicate(row, h => h.includes('phone'));
        const company = firstByNames(row, ['Company', 'Organization']);
        const role = firstByNames(row, ['Job Title']);
        const notes = firstByNames(row, ['Notes']);
        const categoriesRaw = firstByNames(row, ['Categories']);
        const tags = categoriesRaw ? categoriesRaw.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [];

        let birthday = '';
        const birthdayRaw = firstByNames(row, ['Birthday']);
        if (birthdayRaw) {
          const d = new Date(birthdayRaw);
          if (!isNaN(d.getTime()) && d.getFullYear() > 1900) birthday = d.toISOString().slice(0, 10);
        }

        if (!name && !email && !phone) continue;

        out.push({
          id: `csv-${Date.now()}-${r}`,
          name: name || 'Unnamed Contact',
          phone,
          email,
          birthday,
          company,
          role,
          category: (company || role) ? 'business' : 'personal',
          tags,
          notes,
          favorite: false,
          createdAt: new Date().toISOString(),
          timeline: [],
        });
      }

      if (out.length === 0) throw new Error('no contacts');
      onSuccess(out);
    } catch {
      onError('Import failed: not a recognized Outlook CSV export.');
    }
  };
  reader.readAsText(file);
}

// Parse a CSV exported from Google Contacts (Google CSV format) into our contact
// model. Google uses indexed "<Field> N - Value" columns plus "- Label"/"- Type"
// siblings, and packs multiple values in one cell separated by " ::: ".
export function importFromGoogleCSV(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rows = parseCSV(String(e.target.result).replace(/^﻿/, ''));
      if (rows.length < 2) throw new Error('empty');

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const firstVal = (s) => String(s || '').split(' ::: ')[0].trim();
      const valByName = (row, name) => {
        const i = headers.indexOf(name.toLowerCase());
        return i >= 0 ? firstVal(row[i]) : '';
      };
      const firstByNames = (row, names) => {
        for (const n of names) { const v = valByName(row, n); if (v) return v; }
        return '';
      };
      // Raw accessor (no " ::: " splitting) — used for Labels, which packs multiple
      // values with that same separator.
      const rawFirstByNames = (row, names) => {
        for (const n of names) {
          const i = headers.indexOf(n.toLowerCase());
          if (i >= 0) { const v = String(row[i] || '').trim(); if (v) return v; }
        }
        return '';
      };
      const valueCols = (re) => headers.map((h, i) => ({ h, i })).filter(o => re.test(o.h));
      const emailCols = valueCols(/^e-?mail \d+ - value$/);
      const phoneCols = valueCols(/^phone \d+ - value$/);
      const firstFromCols = (row, cols) => {
        for (const { i } of cols) { const v = firstVal(row[i]); if (v) return v; }
        return '';
      };
      // Prefer a mobile/cell number if the sibling label/type column says so
      const pickPhone = (row) => {
        let fallback = '';
        for (const { h, i } of phoneCols) {
          const v = firstVal(row[i]);
          if (!v) continue;
          if (!fallback) fallback = v;
          const ti = headers.indexOf(h.replace(' - value', ' - type'));
          const li = headers.indexOf(h.replace(' - value', ' - label'));
          const meta = `${ti >= 0 ? row[ti] : ''} ${li >= 0 ? row[li] : ''}`.toLowerCase();
          if (/mobile|cell/.test(meta)) return v;
        }
        return fallback;
      };
      const cleanLabels = (raw) => (raw
        ? raw.split(/\s*:::\s*|;/).map(s => s.replace(/^\*\s*/, '').trim())
            .filter(s => s && !/^my\s*contacts$/i.test(s) && !/^starred/i.test(s))
        : []);

      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(v => !String(v).trim())) continue;

        const first = firstByNames(row, ['First Name', 'Given Name']);
        const middle = firstByNames(row, ['Middle Name', 'Additional Name']);
        const last = firstByNames(row, ['Last Name', 'Family Name']);
        let name = [first, middle, last].filter(Boolean).join(' ').trim();
        if (!name) name = firstByNames(row, ['Name', 'File As', 'Nickname']);

        const email = firstFromCols(row, emailCols) || firstByNames(row, ['E-mail 1 - Value', 'E-mail Address']);
        if (!name) name = email ? email.split('@')[0] : '';

        const phone = pickPhone(row);
        const company = firstByNames(row, ['Organization Name', 'Organization 1 - Name', 'Company']);
        const role = firstByNames(row, ['Organization Title', 'Organization 1 - Title', 'Job Title']);
        const notes = firstByNames(row, ['Notes']);
        const tags = cleanLabels(rawFirstByNames(row, ['Labels', 'Group Membership']));

        let birthday = '';
        const birthdayRaw = firstByNames(row, ['Birthday']);
        if (birthdayRaw) {
          const d = new Date(birthdayRaw);
          if (!isNaN(d.getTime()) && d.getFullYear() > 1900) birthday = d.toISOString().slice(0, 10);
        }

        if (!name && !email && !phone) continue;

        out.push({
          id: `csv-${Date.now()}-${r}`,
          name: name || 'Unnamed Contact',
          phone,
          email,
          birthday,
          company,
          role,
          category: (company || role) ? 'business' : 'personal',
          tags,
          notes,
          favorite: false,
          createdAt: new Date().toISOString(),
          timeline: [],
        });
      }

      if (out.length === 0) throw new Error('no contacts');
      onSuccess(out);
    } catch {
      onError('Import failed: not a recognized Google Contacts CSV export.');
    }
  };
  reader.readAsText(file);
}
