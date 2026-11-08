# ProSignage SQL

ProSignage SQL is a PHP + MySQL digital signage application prepared for GitHub,
Coolify and a self-hosted SQL backend.

## What changed

This project no longer depends on Firebase for its core operation.

Current architecture:

- PHP 8.2 + Apache
- MySQL 8
- Session auth for admin users
- SQL tables for users, groups, screens, slides, commands and uploads
- Public player backed by secure screen credentials

## Main routes

- `/login.php`: admin access
- `/admin.php`: groups, screens, player URLs and remote commands
- `/users.php`: user and group assignment management
- `/screen-editor.php?id=SCREEN_ID`: screen editor
- `/player.php?screen=PUBLIC_ID&key=PLAYER_KEY`: public player

## Preview and playback

The editor embeds the same player used by a screen. Enter the display's actual
pixel width and height above the preview to compare widget and text sizes at the
correct scale. Unsaved edits appear in the preview; the public player changes
after publishing the screen. Open players in the same browser receive the update
immediately; remote players check for changes every two seconds and keep showing
their last content during a network outage.

The weather widget shows a three-day forecast with SVG icons based on
Open-Meteo's WMO weather codes. The ticker repeats seamlessly and adapts its
scroll duration to the length of the message.

The player keeps its last valid configuration locally and caches its page,
scripts, stylesheet and same-origin uploaded images for offline recovery.
Images are prefetched after a successful sync. External websites, feeds,
weather data and videos that require range requests still need a connection.

Legacy compatibility shortcuts:

- `/admin.html` redirects to `/admin.php`
- `/player.html` redirects to `/player.php` preserving query string

## Environment variables

Minimum variables for first boot:

- `APP_INSTALLED=1`
- `APP_ADMIN_EMAIL=admin@example.com`
- `APP_ADMIN_PASSWORD=change-me`
- `DB_HOST=db`
- `DB_PORT=3306`
- `DB_DATABASE=prosignage`
- `DB_USERNAME=prosignage`
- `DB_PASSWORD=prosignage`

Useful optional variables:

- `APP_BASE_URL=https://your-domain.example`
- `APP_ADMIN_NAME=Administrador`
- `APP_LOGO_URL=https://...`
- `SESSION_PERSIST_DAYS=180`
- `UPLOAD_MAX_MB=100`
- `AUTO_INIT_DB=1`

## Local run with Docker

```bash
docker compose up --build
```

Default local URLs:

- App: `http://localhost:8080`
- MySQL: `localhost:3308`

## Coolify

Recommended setup:

1. Create one application from this repository using the `Dockerfile`.
2. Create one MySQL service in Coolify.
3. Set the application environment variables with the Coolify MySQL host,
   database, username and password.
4. On first deploy, keep `AUTO_INIT_DB=1` and define `APP_ADMIN_EMAIL` and
   `APP_ADMIN_PASSWORD`.
5. Mount persistent storage for `/var/www/html/storage`.

## Notes

- The old Firebase prototype files still exist in some legacy folders for
  reference, but the new SQL application is the supported version.
- Uploaded files are stored under `storage/uploads`.
