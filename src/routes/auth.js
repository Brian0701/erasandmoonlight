// src/routes/auth.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────
//  POST /auth/register
// ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check duplicate email
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [
        firstName.trim(),
        lastName.trim(),
        email.toLowerCase().trim(),
        hash,
        phone?.trim() || null,
      ]
    );

    const user = {
      id:        result.insertId,
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email:     email.toLowerCase().trim(),
      role:      'customer',
    };

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('[POST /auth/register]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
//  POST /auth/login
// ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'No account found with that email address.' });
    }

    const row = rows[0];
    const match = await bcrypt.compare(password, row.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const user = {
      id:        row.id,
      firstName: row.first_name,
      lastName:  row.last_name,
      email:     row.email,
      role:      row.role,
    };

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.json({ token, user });
  } catch (err) {
    console.error('[POST /auth/login]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
//  GET /auth/me  — verify token & return user
// ─────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, first_name, last_name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });

    const row = rows[0];
    return res.json({
      id:        row.id,
      firstName: row.first_name,
      lastName:  row.last_name,
      email:     row.email,
      role:      row.role,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[GET /auth/me]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;