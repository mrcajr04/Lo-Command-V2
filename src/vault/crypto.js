/**
 * Vault Cryptographic Helpers
 * Uses the browser Web Crypto API (SubtleCrypto) for secure local encryption.
 */

// Generate a random 16-byte salt for PBKDF2
export function generateSalt() {
  return window.crypto.getRandomValues(new Uint8Array(16));
}

// Generate a random 12-byte IV (initialization vector) for AES-GCM
export function generateIv() {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Derive an AES-GCM 256-bit key from a user PIN and salt using PBKDF2.
 * @param {string} pin - The 4-digit PIN.
 * @param {Uint8Array} salt - The 16-byte salt.
 * @returns {Promise<CryptoKey>} - The derived key.
 */
export async function deriveKey(pin, salt) {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);

  // Import the raw PIN bytes to serve as the base key material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the AES-GCM key using PBKDF2
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // The key must not be extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary JSON data with a derived AES-GCM key.
 * Generates a unique 12-byte IV on each execution.
 * @param {CryptoKey} key - The AES-GCM key.
 * @param {any} data - The array/object to encrypt.
 * @returns {Promise<{ciphertext: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptData(key, data) {
  const iv = generateIv();
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(data));

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    plaintextBytes
  );

  return { ciphertext, iv };
}

/**
 * Decrypt ciphertext using a derived AES-GCM key and IV.
 * @param {CryptoKey} key - The AES-GCM key.
 * @param {ArrayBuffer} ciphertext - The encrypted data.
 * @param {Uint8Array} iv - The initialization vector.
 * @returns {Promise<any>} - The decrypted JSON data.
 */
export async function decryptData(key, ciphertext, iv) {
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  const plaintext = decoder.decode(decrypted);
  return JSON.parse(plaintext);
}
