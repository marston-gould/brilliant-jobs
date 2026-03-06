// utils/crypto.js — PII Encryption for chrome.storage.local
// v3.6.0: AES-GCM encryption/decryption using extension install ID as key seed
//
// Encrypts sensitive user data (profile, resume refs, auth tokens) before
// storing in chrome.storage.local. Uses Web Crypto API (available in
// Manifest V3 service workers).
//
// Key derivation: PBKDF2 from extension ID + salt stored alongside data.
// Algorithm: AES-GCM with 256-bit key, random 12-byte IV per encryption.

const BJ_CRYPTO = (() => {
  'use strict';

  const ALGO = 'AES-GCM';
  const KEY_LENGTH = 256;
  const IV_LENGTH = 12; // bytes
  const SALT_LENGTH = 16; // bytes
  const PBKDF2_ITERATIONS = 100000;

  /**
   * Get or create a persistent salt for key derivation.
   * Stored in chrome.storage.local under '_bj_salt'.
   */
  async function getSalt() {
    const data = await chrome.storage.local.get('_bj_salt');
    if (data._bj_salt) {
      return new Uint8Array(data._bj_salt);
    }
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    await chrome.storage.local.set({ _bj_salt: Array.from(salt) });
    return salt;
  }

  /**
   * Derive AES-GCM key from extension ID using PBKDF2.
   * The extension ID is unique per installation and not user-controlled.
   */
  async function deriveKey() {
    const extensionId = chrome.runtime.id;
    const salt = await getSalt();

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(extensionId),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: ALGO, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a JavaScript object to a storable format.
   * Returns { iv: number[], ciphertext: number[], tag: 'bj-encrypted' }
   */
  async function encrypt(data) {
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      key,
      plaintext
    );

    return {
      tag: 'bj-encrypted',
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(encrypted)),
    };
  }

  /**
   * Decrypt a stored encrypted object back to a JavaScript object.
   * Returns the original data or null if decryption fails.
   */
  async function decrypt(envelope) {
    if (!envelope || envelope.tag !== 'bj-encrypted') {
      return envelope; // Not encrypted — return as-is (migration support)
    }

    try {
      const key = await deriveKey();
      const iv = new Uint8Array(envelope.iv);
      const ciphertext = new Uint8Array(envelope.ciphertext);

      const decrypted = await crypto.subtle.decrypt(
        { name: ALGO, iv },
        key,
        ciphertext
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      console.error('[BJ] Crypto decrypt failed:', e.message);
      return null;
    }
  }

  /**
   * Store encrypted data in chrome.storage.local.
   * @param {string} key - Storage key
   * @param {*} data - Data to encrypt and store
   */
  async function secureSet(key, data) {
    const encrypted = await encrypt(data);
    await chrome.storage.local.set({ [key]: encrypted });
  }

  /**
   * Retrieve and decrypt data from chrome.storage.local.
   * @param {string} key - Storage key
   * @returns {*} Decrypted data or null
   */
  async function secureGet(key) {
    const result = await chrome.storage.local.get(key);
    if (!result[key]) return null;
    return decrypt(result[key]);
  }

  /**
   * Remove encrypted data from chrome.storage.local.
   * @param {string} key - Storage key to remove
   */
  async function secureRemove(key) {
    await chrome.storage.local.remove(key);
  }

  return { encrypt, decrypt, secureSet, secureGet, secureRemove };
})();

// ── Encrypted Storage Migration (v5.48 / Item #9) ──
// Migrates plaintext sensitive keys to encrypted storage.
// Safe to run multiple times — skips already-encrypted values.
const BJ_CRYPTO_MIGRATION = (() => {
  'use strict';

  // Keys that should be encrypted (contain PII or tokens)
  const SENSITIVE_KEYS = [
    'bjProfile',        // user profile data
    'bjResumeRef',      // resume file references
    'bjSavedFilters',   // saved search filters
    '_bj_answer_cache', // AI answer cache (may contain profile data)
    'authSession',      // CS-004 (EXT-ES-003): Supabase auth tokens — access_token, refresh_token, user_id
  ];

  /**
   * Migrate plaintext storage values to encrypted format.
   * Runs once on install/update. Idempotent — skips already-encrypted.
   */
  async function migrate() {
    let migrated = 0;
    let skipped = 0;

    for (const key of SENSITIVE_KEYS) {
      try {
        const result = await chrome.storage.local.get(key);
        const value = result[key];

        if (!value) {
          skipped++;
          continue;
        }

        // Already encrypted — skip
        if (value && value.tag === 'bj-encrypted') {
          skipped++;
          continue;
        }

        // Encrypt and re-store
        await BJ_CRYPTO.secureSet(key, value);
        migrated++;
        console.log(`[BJ] Crypto migration: encrypted ${key}`);
      } catch (e) {
        console.warn(`[BJ] Crypto migration failed for ${key}:`, e.message);
      }
    }

    console.log(`[BJ] Crypto migration complete: ${migrated} migrated, ${skipped} skipped`);
    return { migrated, skipped };
  }

  return { migrate, SENSITIVE_KEYS };
})();
