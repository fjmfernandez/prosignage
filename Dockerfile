FROM php:8.2-apache

RUN apt-get update && apt-get install -y default-mysql-client zip unzip git && \
    docker-php-ext-install pdo pdo_mysql mysqli && \
    a2enmod rewrite headers && rm -rf /var/lib/apt/lists/*

RUN { \
    echo "upload_max_filesize=128M"; \
    echo "post_max_size=128M"; \
    echo "memory_limit=512M"; \
    echo "max_execution_time=300"; \
    echo "max_input_time=300"; \
  } > /usr/local/etc/php/conf.d/prosignage.ini

WORKDIR /var/www/html
COPY . /var/www/html
COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/entrypoint.sh /usr/local/bin/prosignage-entrypoint
RUN chmod +x /usr/local/bin/prosignage-entrypoint && \
    mkdir -p storage/uploads storage/logs storage/cache && \
    chown -R www-data:www-data /var/www/html

ENTRYPOINT ["prosignage-entrypoint"]
CMD ["apache2-foreground"]
