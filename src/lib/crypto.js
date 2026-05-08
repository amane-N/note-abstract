'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  // Fixed client-side obfuscation key. NOT cryptographic security — purpose
  // is only to avoid exposing raw API keys to anyone who casually inspects
  // chrome.storage on disk. The key never leaves the user's device.
  const OBFUSCATION_KEY = 'note-abstract-v1-obfuscation-pad';

  const encoder = () => new TextEncoder();
  const decoder = () => new TextDecoder('utf-8', { fatal: false });

  const xorBytes = (input, keyStr) => {
    const keyBytes = encoder().encode(keyStr);
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      out[i] = input[i] ^ keyBytes[i % keyBytes.length];
    }
    return out;
  };

  const u8ToBase64 = (bytes) => {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };

  const base64ToU8 = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  };

  const encrypt = (plaintext) => {
    if (typeof plaintext !== 'string') {
      throw new Error('CRYPTO_INPUT_NOT_STRING');
    }
    const bytes = encoder().encode(plaintext);
    return u8ToBase64(xorBytes(bytes, OBFUSCATION_KEY));
  };

  const decrypt = (ciphertext) => {
    if (typeof ciphertext !== 'string') {
      throw new Error('CRYPTO_INPUT_NOT_STRING');
    }
    let bytes;
    try {
      bytes = base64ToU8(ciphertext);
    } catch (_) {
      throw new Error('CRYPTO_DECRYPT_FAILED');
    }
    return decoder().decode(xorBytes(bytes, OBFUSCATION_KEY));
  };

  ns.Crypto = { encrypt, decrypt };
})();
