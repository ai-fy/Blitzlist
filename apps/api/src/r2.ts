/**
 * R2 helper — pure wrappers around env.ATTACHMENTS so tool handlers don't
 * need to know the binding name.
 *
 * Key layout:
 *   files/{workspace_id}/{sha256_hex}
 *
 * The sha256 prefix means identical content de-duplicates at the storage
 * layer. Two files uploaded with the same bytes share one R2 object; each
 * gets its own file_versions row for provenance.
 */

import type { Env } from './env.js';

export type R2Key = string;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function r2Key(workspace_id: string, sha256_hex: string): R2Key {
	return `files/${workspace_id}/${sha256_hex}`;
}

/**
 * Put bytes into R2. Idempotent — the same key + same bytes is a no-op.
 * Returns the key.
 */
export async function putObject(
	env: Env,
	key: R2Key,
	body: Uint8Array | ArrayBuffer,
	mime_type: string,
): Promise<R2Key> {
	await env.ATTACHMENTS.put(key, body, {
		httpMetadata: { contentType: mime_type },
	});
	return key;
}

export type GetObjectResult = {
	bytes: Uint8Array;
	base64: string;
	mime_type: string;
	size_bytes: number;
};

/**
 * Fetch an object as a Uint8Array + base64 string. Throws if not found.
 */
export async function getObject(env: Env, key: R2Key): Promise<GetObjectResult> {
	const obj = await env.ATTACHMENTS.get(key);
	if (!obj) throw new Error(`R2 object not found: ${key}`);
	const ab = await obj.arrayBuffer();
	const bytes = new Uint8Array(ab);
	return {
		bytes,
		base64: bytesToBase64(bytes),
		mime_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
		size_bytes: bytes.byteLength,
	};
}

/**
 * Returns just the headers + size, no body. Cheaper than getObject for
 * presence checks.
 */
export async function headObject(env: Env, key: R2Key): Promise<{ size_bytes: number; mime_type: string } | null> {
	const obj = await env.ATTACHMENTS.head(key);
	if (!obj) return null;
	return {
		size_bytes: obj.size,
		mime_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
	};
}

export async function deleteObject(env: Env, key: R2Key): Promise<void> {
	await env.ATTACHMENTS.delete(key);
}

// === base64 helpers ==========================================================
// btoa is available in Workers; the chunked path avoids stack overflow on big
// buffers (String.fromCharCode.apply throws with ~125k+ args).

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
