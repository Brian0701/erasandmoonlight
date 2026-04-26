// src/routes/orders.js
const express = require('express');
const db      = require('../db');
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Constants (mirror frontend) ──────────────────────────────
const SHIPPING = {
  'Metro Manila': 120, 'CALABARZON': 150, 'MIMAROPA': 180,
  'Central Luzon': 150, 'Western Visayas': 200,
  'Central Visayas': 200, 'Mindanao': 220, 'Other': 220,
};
const COD_FEE = 50;

function genRef() {
  return 'EM-' + Math.floor(100000 + Math.random() * 900000);
}

// ── Validation helper ─────────────────────────────────────────
function validateOrderBody(body) {
  const { cart, payment, region, delivery } = body;

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return 'Cart is empty.';
  }
  for (const item of cart) {
    if (!item.id || !item.name || !item.price || !item.qty || !item.size || !item.color) {
      return 'Invalid cart item — missing required fields.';
    }
    if (typeof item.price !== 'number' || item.price <= 0) {
      return 'Invalid item price.';
    }
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      return 'Invalid item quantity.';
    }
  }
  if (!['cod', 'bank', 'ew'].includes(payment)) {
    return 'Invalid payment method.';
  }
  if (!region || !SHIPPING[region] && region !== 'Other') {
    return 'Invalid or missing region.';
  }
  if (!delivery || !delivery.name || !delivery.email || !delivery.phone || !delivery.street || !delivery.city) {
    return 'Missing required delivery fields (name, email, phone, street, city).';
  }
  return null; // valid
}

// ── Server-side totals calculation ───────────────────────────
function computeTotals(cart, payment, region) {
  const subtotal    = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shippingFee = SHIPPING[region] ?? 220;
  const codFee      = payment === 'cod' ? COD_FEE : 0;
  const total       = subtotal + shippingFee + codFee;
  return { subtotal, shippingFee, codFee, total };
}

// ─────────────────────────────────────────
//  POST /orders
//  Place a new order (guest or logged-in)
// ─────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cart, payment, region, delivery } = req.body;

    // Validate
    const err = validateOrderBody(req.body);
    if (err) return res.status(400).json({ error: err });

    // Compute totals server-side (never trust client totals)
    const { subtotal, shippingFee, codFee, total } = computeTotals(cart, payment, region);

    // Generate unique order ref
    let ref;
    let attempts = 0;
    do {
      ref = genRef();
      const [check] = await conn.query('SELECT id FROM orders WHERE ref = ? LIMIT 1', [ref]);
      if (check.length === 0) break;
      attempts++;
    } while (attempts < 5);

    await conn.beginTransaction();

    // Insert order
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (ref, user_id, delivery_name, delivery_email, delivery_phone,
          delivery_street, delivery_brgy, delivery_city, delivery_prov,
          delivery_region, delivery_notes, payment_method,
          subtotal, shipping_fee, cod_fee, total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ref,
        req.user?.id ?? null,
        delivery.name,
        delivery.email,
        delivery.phone,
        delivery.street,
        delivery.brgy   || null,
        delivery.city,
        delivery.prov   || null,
        region,
        delivery.notes  || null,
        payment,
        subtotal,
        shippingFee,
        codFee,
        total,
      ]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of cart) {
      const lineTotal = item.price * item.qty;
      await conn.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, color, size, unit_price, qty, line_total)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, item.id, item.name, item.color, item.size, item.price, item.qty, lineTotal]
      );
    }

    await conn.commit();

    return res.status(201).json({
      ref,
      orderId,
      totals: { subtotal, shippingFee, codFee, total },
    });
  } catch (err) {
    await conn.rollback();
    console.error('[POST /orders]', err);
    return res.status(500).json({ error: 'Failed to place order. Please try again.' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────
//  GET /orders/my
//  Logged-in user's own orders
// ─────────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT id, ref, status, payment_method,
              subtotal, shipping_fee, cod_fee, total,
              placed_at, delivery_region
       FROM orders
       WHERE user_id = ?
       ORDER BY placed_at DESC`,
      [req.user.id]
    );

    // Attach items to each order
    const enriched = await Promise.all(
      orders.map(async (o) => {
        const [items] = await db.query(
          `SELECT product_id, product_name AS name, color, size, unit_price AS price, qty, line_total
           FROM order_items WHERE order_id = ?`,
          [o.id]
        );
        return {
          id:        o.id,
          ref:       o.ref,
          status:    o.status,
          payment:   o.payment_method,
          region:    o.delivery_region,
          cart:      items,
          totals: {
            subtotal:    parseFloat(o.subtotal),
            shippingFee: parseFloat(o.shipping_fee),
            codFee:      parseFloat(o.cod_fee),
            total:       parseFloat(o.total),
          },
          placedAt:  o.placed_at,
        };
      })
    );

    return res.json(enriched);
  } catch (err) {
    console.error('[GET /orders/my]', err);
    return res.status(500).json({ error: 'Could not fetch orders.' });
  }
});

// ─────────────────────────────────────────
//  GET /orders/:ref
//  Single order detail (owner or admin)
// ─────────────────────────────────────────
router.get('/:ref', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM orders WHERE ref = ? LIMIT 1',
      [req.params.ref]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found.' });

    const o = rows[0];
    // Only allow the owner or an admin to view
    if (o.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorised to view this order.' });
    }

    const [items] = await db.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [o.id]
    );

    return res.json({ ...o, items });
  } catch (err) {
    console.error('[GET /orders/:ref]', err);
    return res.status(500).json({ error: 'Could not fetch order.' });
  }
});

// ─────────────────────────────────────────
//  GET /orders   (admin only)
//  All orders with optional filters
// ─────────────────────────────────────────
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT o.*, CONCAT(u.first_name,' ',u.last_name) AS account_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
    `;
    const params = [];

    if (status) {
      query += ' WHERE o.status = ?';
      params.push(status);
    }
    query += ' ORDER BY o.placed_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [orders] = await db.query(query, params);

    // Count total for pagination
    const [[{ total_count }]] = await db.query(
      `SELECT COUNT(*) AS total_count FROM orders ${status ? 'WHERE status = ?' : ''}`,
      status ? [status] : []
    );

    return res.json({ orders, total: total_count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[GET /orders]', err);
    return res.status(500).json({ error: 'Could not fetch orders.' });
  }
});

// ─────────────────────────────────────────
//  PATCH /orders/:ref/status  (admin only)
// ─────────────────────────────────────────
router.patch('/:ref/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const [result] = await db.query(
      'UPDATE orders SET status = ? WHERE ref = ?',
      [status, req.params.ref]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    return res.json({ ref: req.params.ref, status });
  } catch (err) {
    console.error('[PATCH /orders/:ref/status]', err);
    return res.status(500).json({ error: 'Could not update order status.' });
  }
});

module.exports = router;