// src/utils/jwt.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET  = process.env.JWT_SECRET      || 'eras_moonlight_dev_secret';
const EXPIRES = process.env.JWT_EXPIRES_IN  || '7d';

/**
 * Sign a JWT for an authenticated user.
 * @param {object} payload  — typically { id, email, role }
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

/**
 * Verify a JWT and return its decoded payload.
 * Throws if invalid or expired.
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };