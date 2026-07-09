CREATE TABLE companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE screen_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    storage_limit_mb INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE group_user_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    UNIQUE KEY uk_group_user (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE screens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    group_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    public_id VARCHAR(32) NOT NULL UNIQUE,
    player_key VARCHAR(64) NOT NULL,
    orientation ENUM('landscape', 'portrait') NOT NULL DEFAULT 'landscape',
    widgets_json LONGTEXT NULL,
    status_name ENUM('online', 'warning', 'offline') NOT NULL DEFAULT 'offline',
    last_seen_at DATETIME NULL,
    public_ip VARCHAR(100) NULL,
    private_ip VARCHAR(120) NULL,
    browser_name VARCHAR(80) NULL,
    os_name VARCHAR(80) NULL,
    screen_resolution VARCHAR(40) NULL,
    connection_type VARCHAR(40) NULL,
    connection_speed VARCHAR(40) NULL,
    user_agent VARCHAR(255) NULL,
    is_kiosk TINYINT(1) NOT NULL DEFAULT 0,
    kiosk_version VARCHAR(40) NULL,
    current_slide_name VARCHAR(160) NULL,
    current_slide_type VARCHAR(40) NULL,
    current_slide_url TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE CASCADE
);

CREATE TABLE screen_slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    screen_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    content_type ENUM('image', 'video', 'web') NOT NULL DEFAULT 'image',
    source_url TEXT NOT NULL,
    fit_mode ENUM('contain', 'cover', 'fill') NOT NULL DEFAULT 'contain',
    duration_seconds INT NOT NULL DEFAULT 10,
    days_json JSON NOT NULL,
    start_time TIME NOT NULL DEFAULT '00:00:00',
    end_time TIME NOT NULL DEFAULT '23:59:00',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
);

CREATE TABLE assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    group_id INT NULL,
    kind ENUM('media', 'logo') NOT NULL DEFAULT 'media',
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE screen_commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    screen_id INT NOT NULL,
    action_name VARCHAR(60) NOT NULL,
    payload_json LONGTEXT NULL,
    status_name ENUM('pending', 'executed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    created_by INT NULL,
    result_message VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME NULL,
    executed_at DATETIME NULL,
    FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    user_id INT NULL,
    action_name VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60) NULL,
    entity_id INT NULL,
    summary_text VARCHAR(255) NOT NULL,
    payload_json LONGTEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
