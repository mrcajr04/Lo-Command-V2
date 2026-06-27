/**
 * Vault Storage Wrapper
 * Stores and loads base64-encoded encrypted data and cryptographic parameters.
 */

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
  localStorage.setItem('lo_command_vault_salt', arrayBufferToBase64(salt));
  localStorage.setItem('lo_command_vault_iv', arrayBufferToBase64(iv));
  localStorage.setItem('lo_command_vault_data', arrayBufferToBase64(ciphertext));
}

// Clear vault elements completely
export function clearVaultStorage() {
  localStorage.removeItem('lo_command_vault_salt');
  localStorage.removeItem('lo_command_vault_iv');
  localStorage.removeItem('lo_command_vault_data');
}
