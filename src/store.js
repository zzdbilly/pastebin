// --- KV 数据操作 (store.js) ---
import { jsonResponse, parseExpiresIn, sha256, generateId, generateToken, generateManageToken } from './lib/utils.js';
import { detectLanguage } from './language.js';

// --- API: POST /api/new ---

export async function createPaste(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const content = body.content;
  if (!content || typeof content !== 'string') {
    return jsonResponse({ error: 'content is required and must be a string' }, 400);
  }

  const MAX_SIZE = 100 * 1024;
  if (content.length > MAX_SIZE) {
    return jsonResponse({ error: 'content must be 100KB or less' }, 400);
  }

  // Parse optional fields (backward compatible)
  const expiresInSeconds = parseExpiresIn(String(body.expires_in || '3600'));
  const burnAfterReading = !!body.burn_after_reading;

  // New optional fields
  const title = (typeof body.title === 'string' && body.title.trim()) ? body.title.trim().slice(0, 200) : '';
  const userLanguage = (typeof body.language === 'string' && body.language.trim()) ? body.language.trim().toLowerCase() : '';
  const password = (typeof body.password === 'string' && body.password.length > 0) ? body.password : '';
  const customSlug = (typeof body.custom_slug === 'string' && body.custom_slug.trim())
    ? body.custom_slug.trim().toLowerCase().slice(0, 32)
    : '';

  // Determine language: user-specified or auto-detect
  let language = userLanguage;
  if (!language || language === 'auto') {
    language = detectLanguage(content);
  }

  // Hash password if provided
  let passwordHash = '';
  if (password) {
    passwordHash = await sha256(password);
  }

  // Generate unique ID (custom slug or random)
  let id;
  if (customSlug) {
    if (!/^[a-z0-9-]+$/.test(customSlug)) {
      return jsonResponse({ error: 'Custom slug can only contain a-z, 0-9, and hyphens' }, 400);
    }
    const existing = await KV.get(customSlug);
    if (existing) {
      return jsonResponse({ error: 'This custom slug is already taken' }, 409);
    }
    id = customSlug;
  } else {
    for (let i = 0; i < 5; i++) {
      id = generateId();
      const existing = await KV.get(id);
      if (!existing) break;
      if (i === 4) {
        return jsonResponse({ error: 'Failed to generate unique ID' }, 500);
      }
    }
  }

  // Generate management token
  const manageToken = generateManageToken();

  // Build paste object
  const paste = {
    content,
    burn_after_reading: burnAfterReading,
    created_at: Date.now(),
    expires_at: Date.now() + expiresInSeconds * 1000,
    title,
    language,
    password_hash: passwordHash,
    manage_token: manageToken,
  };

  await KV.put(id, JSON.stringify(paste), { expirationTtl: expiresInSeconds });

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const pasteUrl = `${baseUrl}/${id}`;
  const manageUrl = `${baseUrl}/manage/${id}?token=${manageToken}`;
  const rawUrl = `${baseUrl}/${id}/raw`;

  return jsonResponse({
    id,
    url: pasteUrl,
    manage_url: manageUrl,
    raw_url: rawUrl,
    expires_at: new Date(paste.expires_at).toISOString(),
  });
}

// --- Views counter ---
//
// Views are stored under a dedicated lightweight KV key `views:{id}` holding a
// plain integer string. We keep it separate from the main paste record so that
// counting a view never requires reading/deserialising the (potentially large)
// content record. KV get/put is eventually consistent, so this is a plain
// read-modify-write — no transactions needed (the task explicitly allows this).
const viewsKey = (id) => `views:${id}`;

// Atomically (best-effort, eventually consistent) increment the view counter.
export async function incrementViews(id) {
  try {
    const key = viewsKey(id);
    const current = parseInt(await KV.get(key) || '0', 10) || 0;
    await KV.put(key, String(current + 1));
    return current + 1;
  } catch (e) {
    // Never fail the view request because of a counter hiccup.
    return (parseInt(await KV.get(viewsKey(id)) || '0', 10) || 0) + 1;
  }
}

// Read the current view counter (0 if never viewed / key absent).
export async function getViews(id) {
  try {
    return parseInt(await KV.get(viewsKey(id)) || '0', 10) || 0;
  } catch (e) {
    return 0;
  }
}

// Delete the view counter when the paste itself is removed/expired.
export async function deleteViews(id) {
  try {
    await KV.delete(viewsKey(id));
  } catch (e) {
    // best-effort cleanup
  }
}

// --- API: POST /api/verify ---

export async function verifyPassword(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const id = body.id;
  const password = body.password;
  if (!id || typeof id !== 'string' || !password || typeof password !== 'string') {
    return jsonResponse({ error: 'id and password are required' }, 400);
  }

  const data = await KV.get(id);
  if (!data) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return jsonResponse({ error: 'Invalid data' }, 500);
  }

  if (Date.now() > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'Expired' }, 404);
  }

  if (!paste.password_hash) {
    return jsonResponse({ error: 'This paste is not password protected' }, 400);
  }

  const inputHash = await sha256(password);
  if (inputHash !== paste.password_hash) {
    return jsonResponse({ error: 'Wrong password' }, 403);
  }

  // Generate a view token and store in KV (1 hour TTL)
  const token = generateToken();
  const tokenKey = `vtok_${id}_${token}`;
  await KV.put(tokenKey, '1', { expirationTtl: 3600 });

  return jsonResponse({ token });
}

// --- View token validation ---

export async function validateViewToken(id, token) {
  if (!token) return false;
  const tokenKey = `vtok_${id}_${token}`;
  const val = await KV.get(tokenKey);
  return val === '1';
}
