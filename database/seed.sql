INSERT INTO companies (id, name) VALUES (1, 'ProSignage') ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO users (id, company_id, name, email, password_hash, role, is_active)
VALUES (1, 1, 'Administrador', 'admin@example.com', '$2y$10$rjz4P4mKkqS7v63Yv8Vb8eqvP5kA9mAe7ZgD/4r5V6lbP6H1GuP7S', 'admin', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
