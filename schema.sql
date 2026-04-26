-- ============================================================
--  ERAS & MOONLIGHT — MySQL Schema
--  Compatible with XAMPP (MySQL 5.7+ / MariaDB 10.x)
--
--  HOW TO USE:
--  1. Open phpMyAdmin (http://localhost/phpmyadmin)
--  2. Click "New" to create a database named: eras_moonlight
--  3. Click the "SQL" tab and paste this entire file
--  4. Click "Go" to execute
-- ============================================================

CREATE DATABASE IF NOT EXISTS eras_moonlight
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE eras_moonlight;

-- ============================================================
--  USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(80)     NOT NULL,
  last_name     VARCHAR(80)     NOT NULL,
  email         VARCHAR(191)    NOT NULL UNIQUE,
  phone         VARCHAR(30)     DEFAULT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  ref             VARCHAR(20)     NOT NULL UNIQUE,         -- e.g. EM-123456
  user_id         INT UNSIGNED    DEFAULT NULL,            -- NULL = guest order
  status          ENUM('pending','confirmed','dispatched','delivered','cancelled')
                                  NOT NULL DEFAULT 'pending',

  -- Delivery info (captured at checkout time)
  delivery_name   VARCHAR(160)    NOT NULL,
  delivery_email  VARCHAR(191)    NOT NULL,
  delivery_phone  VARCHAR(30)     NOT NULL,
  delivery_street VARCHAR(255)    NOT NULL,
  delivery_brgy   VARCHAR(120)    DEFAULT NULL,
  delivery_city   VARCHAR(120)    NOT NULL,
  delivery_prov   VARCHAR(120)    DEFAULT NULL,
  delivery_region VARCHAR(80)     NOT NULL,
  delivery_notes  TEXT            DEFAULT NULL,

  -- Payment
  payment_method  ENUM('cod','bank','ew') NOT NULL DEFAULT 'cod',

  -- Totals (stored so history never breaks if prices change)
  subtotal        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  shipping_fee    DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  cod_fee         DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total           DECIMAL(10,2)   NOT NULL DEFAULT 0.00,

  placed_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id  (user_id),
  INDEX idx_status   (status),
  INDEX idx_placed   (placed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  ORDER ITEMS  (one row per distinct product/size/color)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED    NOT NULL,
  product_id  INT UNSIGNED    NOT NULL,   -- mirrors frontend products[].id
  product_name VARCHAR(120)   NOT NULL,   -- snapshot at order time
  color       VARCHAR(60)     NOT NULL,
  size        VARCHAR(10)     NOT NULL,
  unit_price  DECIMAL(10,2)   NOT NULL,
  qty         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  line_total  DECIMAL(10,2)   NOT NULL,   -- unit_price * qty

  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  REFRESH TOKENS  (optional — for "remember me" flow)
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED    NOT NULL,
  token_hash  VARCHAR(255)    NOT NULL UNIQUE,
  expires_at  DATETIME        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  SEED: Demo account
--  Password: demo1234  (bcrypt, cost 10)
-- ============================================================
INSERT IGNORE INTO users
  (first_name, last_name, email, password_hash, role)
VALUES
  (
    'Demo', 'Customer',
    'demo@erasandmoonlight.ph',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi',
    'customer'
  );

-- ============================================================
--  VIEWS  (handy for phpMyAdmin quick-look)
-- ============================================================

-- Full order overview
CREATE OR REPLACE VIEW v_orders_overview AS
SELECT
  o.id,
  o.ref,
  o.status,
  CONCAT(o.delivery_name)          AS customer_name,
  o.delivery_email,
  o.payment_method,
  o.subtotal,
  o.shipping_fee,
  o.cod_fee,
  o.total,
  o.placed_at,
  CONCAT(u.first_name,' ',u.last_name) AS account_name,
  COUNT(oi.id)                     AS item_types,
  SUM(oi.qty)                      AS total_qty
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

-- ============================================================
--  END OF SCHEMA
-- ============================================================