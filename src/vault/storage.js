/**
 * Vault Storage Wrapper
 * Stores and loads base64-encoded encrypted data and cryptographic parameters.
 */
import { syncToCloud } from '../lib/userDataSync.js';

const VAULT_PREFERENCES_KEY = 'lo_command_vault_preferences';
const DEFAULT_VAULT_PREFERENCES = {
  autoLockMinutes: 5,
  lockOnLogout: true,
};

// Helper to convert an ArrayBuffer to a Base64 string
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert a Base64 string to a Uint8Array
export function base64ToUint8Array(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Check if vault files exist in localStorage
export function hasVaultData() {
  return localStorage.getItem('lo_command_vault_salt') !== null &&
         localStorage.getItem('lo_command_vault_iv') !== null &&
         localStorage.getItem('lo_command_vault_data') !== null;
}

// Load the PBKDF2 salt from localStorage
export function getVaultSalt() {
  const saltBase64 = localStorage.getItem('lo_command_vault_salt');
  return saltBase64 ? base64ToUint8Array(saltBase64) : null;
}

// Load the AES-GCM IV from localStorage
export function getVaultIv() {
  const ivBase64 = localStorage.getItem('lo_command_vault_iv');
  return ivBase64 ? base64ToUint8Array(ivBase64) : null;
}

// Load the AES-GCM encrypted ciphertext from localStorage
export function getVaultCiphertext() {
  const dataBase64 = localStorage.getItem('lo_command_vault_data');
  return dataBase64 ? base64ToUint8Array(dataBase64).buffer : null;
}

// Save all vault elements securely to localStorage
export function saveVaultData(salt, iv, ciphertext) {
  const saltB64 = arrayBufferToBase64(salt);
  const ivB64 = arrayBufferToBase64(iv);
  const dataB64 = arrayBufferToBase64(ciphertext);
  localStorage.setItem('lo_command_vault_salt', saltB64);
  localStorage.setItem('lo_command_vault_iv', ivB64);
  localStorage.setItem('lo_command_vault_data', dataB64);
  syncToCloud('lo_command_vault', { salt: saltB64, iv: ivB64, data: dataB64 });
}

// Clear vault elements completely
export function clearVaultStorage() {
  localStorage.removeItem('lo_command_vault_salt');
  localStorage.removeItem('lo_command_vault_iv');
  localStorage.removeItem('lo_command_vault_data');
}

export function getVaultPreferences() {
  try {
    const raw = localStorage.getItem(VAULT_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_VAULT_PREFERENCES };
    return { ...DEFAULT_VAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VAULT_PREFERENCES };
  }
}

export function saveVaultPreferences(preferences) {
  const merged = { ...DEFAULT_VAULT_PREFERENCES, ...preferences };
  localStorage.setItem(VAULT_PREFERENCES_KEY, JSON.stringify(merged));
  syncToCloud(VAULT_PREFERENCES_KEY, merged);
}
