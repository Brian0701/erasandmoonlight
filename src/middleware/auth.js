// src/middleware/auth.js
const { verifyToken } = require('../utils/jwt');

/**
 * requireAuth — blocks unauthenticated requests (401).
 * Attaches decoded token payload to req.user.
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

/**
 * optionalAuth — populates req.user if a valid token is present,
 * but does NOT block the request if there is none (for guest orders).
 */
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try { req.user = verifyToken(token); } catch {}
  }
  next();
}

/**
 * requireAdmin — must be chained after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };