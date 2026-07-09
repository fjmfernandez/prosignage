# Despliegue en Coolify

## Arquitectura

- Aplicacion: PHP 8.2 + Apache usando el `Dockerfile` del repositorio
- Base de datos: MySQL 8
- Ficheros persistentes: `storage/uploads`, `storage/logs`, `storage/cache`

## Repositorio

- URL prevista: `https://github.com/fjmfernandez/prosignage`
- Tipo de despliegue recomendado en Coolify: `Dockerfile`

## Servicio MySQL

Crea un servicio MySQL 8 en Coolify con estos datos base:

- Database: `prosignage`
- Username: `prosignage`
- Password: genera una clave segura

Guarda los valores reales porque despues se usan en la aplicacion.

## Aplicacion en Coolify

Crea una aplicacion desde el repositorio GitHub y usa el `Dockerfile` del proyecto.

Variables recomendadas:

```env
APP_INSTALLED=1
APP_NAME=ProSignage
APP_TIMEZONE=Europe/Madrid
APP_BASE_URL=https://TU-DOMINIO
APP_LOGO_URL=https://www.entelsat.com/wp-content/uploads/2018/11/logo_entelsat_144.png
APP_ADMIN_NAME=Administrador
APP_ADMIN_EMAIL=TU_EMAIL_ADMIN
APP_ADMIN_PASSWORD=TU_PASSWORD_ADMIN
DB_HOST=HOST_MYSQL_DE_COOLIFY
DB_PORT=3306
DB_DATABASE=prosignage
DB_USERNAME=prosignage
DB_PASSWORD=TU_PASSWORD_MYSQL
SESSION_TIMEOUT=0
SESSION_PERSIST_DAYS=180
UPLOAD_MAX_MB=100
AUTO_INIT_DB=1
```

## Almacenamiento persistente

Monta un volumen persistente en:

```text
/var/www/html/storage
```

Sin ese volumen perderias uploads y cache al recrear el contenedor.

## Primer despliegue

En el primer deploy:

1. Despliega primero MySQL.
2. Despliega despues la aplicacion.
3. Manten `AUTO_INIT_DB=1` para que cargue `database/schema.sql` y `database/seed.sql`.
4. Verifica que exista el usuario admin con el email configurado.

Tras el primer despliegue puedes dejar `AUTO_INIT_DB=1` o cambiarlo a `0`. La inicializacion solo se ejecuta si la base esta vacia.

## Verificaciones

Comprueba estas rutas:

- `/login.php`
- `/admin.php`
- `/player.php?screen=PUBLIC_ID&key=PLAYER_KEY`

Comprueba tambien:

- login correcto con el admin
- creacion de grupos y pantallas
- subida de ficheros
- volumen persistente funcionando

## Comandos utiles

Si necesitas revisar el contenedor localmente:

```bash
docker compose up --build
```

## Notas

- Las carpetas antiguas de Firebase siguen en el proyecto solo como referencia historica.
- La version soportada para produccion es la SQL.
