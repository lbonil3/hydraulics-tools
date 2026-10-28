/* PM vault crypto: PBKDF2-SHA-256 -> AES-GCM-256. Works in browsers and Node (globalThis.crypto / require('crypto').webcrypto).
   The passphrase is never stored, logged or sent anywhere; only the derived non-extractable key lives in memory while unlocked. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMCrypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ITER = 600000;
  const MIN_PASS = 10;
  function wc() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
    return require('crypto').webcrypto;
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function randomBytes(n) { return wc().getRandomValues(new Uint8Array(n)); }

  async function deriveKey(pass, salt, iter) {
    const c = wc();
    const base = await c.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter || ITER },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /* kind is bound into the ciphertext as AES-GCM additional data so a vault and a backup can't be swapped silently. */
  async function sealWithKey(key, salt, iter, obj, kind) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await wc().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('pm:' + kind + ':v1') },
      key, enc.encode(JSON.stringify(obj))));
    return { fmt: 'pm-' + kind, v: 1, kdf: 'PBKDF2-SHA-256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function openWithKey(key, env, kind) {
    if (!env || env.fmt !== 'pm-' + kind || env.v !== 1) throw new Error('Not a recognized ' + kind + ' file');
    let pt;
    try {
      pt = await wc().subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: enc.encode('pm:' + kind + ':v1') }, key, unb64(env.ct));
    } catch (e) {
      const err = new Error('Wrong passphrase or the data was modified');
      err.code = 'DECRYPT';
      throw err;
    }
    return JSON.parse(dec.decode(pt));
  }
  async function seal(pass, obj, kind, iter) {
    const salt = randomBytes(16);
    const it = iter || ITER;
    const key = await deriveKey(pass, salt, it);
    return { env: await sealWithKey(key, salt, it, obj, kind), key, salt, iter: it };
  }
  async function open(pass, env, kind) {
    if (!env || typeof env.salt !== 'string') throw new Error('Not a recognized ' + kind + ' file');
    const salt = unb64(env.salt);
    const key = await deriveKey(pass, salt, env.iter);
    return { data: await openWithKey(key, env, kind), key, salt, iter: env.iter };
  }
  function passIssues(p, confirm) {
    const out = [];
    if (!p || p.length < MIN_PASS) out.push('Use at least ' + MIN_PASS + ' characters (a short sentence works well).');
    if (confirm !== undefined && p !== confirm) out.push('The two passphrases do not match.');
    return out;
  }
  return { ITER, MIN_PASS, deriveKey, seal, open, sealWithKey, openWithKey, passIssues, b64, unb64 };
});
