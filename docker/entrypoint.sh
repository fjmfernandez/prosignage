#!/bin/sh
set -e

mkdir -p /var/www/html/storage/uploads /var/www/html/storage/logs /var/www/html/storage/cache
chown -R www-data:www-data /var/www/html/storage || true

if [ "${AUTO_INIT_DB}" = "1" ]; then
  echo "Esperando a MySQL en ${DB_HOST}:${DB_PORT}..."
  MYSQL_OPTS="--default-character-set=utf8mb4 --skip-ssl --skip-ssl-verify-server-cert -h${DB_HOST} -P${DB_PORT} -u${DB_USERNAME} -p${DB_PASSWORD}"
  until mysqladmin ping -h"${DB_HOST}" -P"${DB_PORT}" --silent; do
    sleep 2
  done

  echo "Esperando a que la base ${DB_DATABASE} acepte credenciales de aplicacion..."
  until mysql ${MYSQL_OPTS} "${DB_DATABASE}" -e "SELECT 1" >/dev/null 2>&1; do
    sleep 2
  done

  TABLES=$(mysql ${MYSQL_OPTS} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_DATABASE}'" || echo 0)
  if [ "$TABLES" = "0" ]; then
    if [ -z "${APP_ADMIN_EMAIL}" ] || [ -z "${APP_ADMIN_PASSWORD}" ]; then
      echo "ERROR: define APP_ADMIN_EMAIL y APP_ADMIN_PASSWORD antes de inicializar la base."
      exit 1
    fi

    echo "Inicializando base de datos ProSignage..."
    mysql ${MYSQL_OPTS} "${DB_DATABASE}" < /var/www/html/database/schema.sql
    mysql ${MYSQL_OPTS} "${DB_DATABASE}" < /var/www/html/database/seed.sql

    ADMIN_NAME_ESCAPED=$(printf "%s" "${APP_ADMIN_NAME:-Administrador}" | sed "s/'/''/g")
    ADMIN_EMAIL_ESCAPED=$(printf "%s" "${APP_ADMIN_EMAIL}" | sed "s/'/''/g")
    ADMIN_PASSWORD_HASH=$(php -r 'echo password_hash(getenv("APP_ADMIN_PASSWORD"), PASSWORD_DEFAULT);')
    ADMIN_PASSWORD_HASH_ESCAPED=$(printf "%s" "${ADMIN_PASSWORD_HASH}" | sed "s/'/''/g")

    mysql ${MYSQL_OPTS} "${DB_DATABASE}" -e "UPDATE users SET name='${ADMIN_NAME_ESCAPED}', email='${ADMIN_EMAIL_ESCAPED}', password_hash='${ADMIN_PASSWORD_HASH_ESCAPED}' WHERE id=1;"
    echo "Administrador inicial configurado para ${APP_ADMIN_EMAIL}."
  fi
fi

exec "$@"
