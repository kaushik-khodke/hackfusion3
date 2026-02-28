// Crypto utilities for encryption/decryption
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeBase64, decodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

export async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return encodeBase64(new Uint8Array(exported));
}

export async function importKey(keyStr: string): Promise<CryptoKey> {
  const keyData = decodeBase64(keyStr);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data: Uint8Array, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    data
  );

  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    iv: encodeBase64(iv),
  };
}

export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: decodeBase64(iv),
    },
    key,
    decodeBase64(ciphertext)
  );

  return new Uint8Array(decrypted);
}

export async function hashSHA256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  return encodeBase64(new Uint8Array(exported));
}

export function generateSalt(): string {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(16)));
}
