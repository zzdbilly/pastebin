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

  return jsonResponse({
    id,
    url: pasteUrl,
    manage_url: manageUrl,
    expires_at: new Date(paste.expires_at).toISOString(),
  });
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
