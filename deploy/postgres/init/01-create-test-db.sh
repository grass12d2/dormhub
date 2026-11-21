#!/bin/sh
# Создаёт отдельную базу данных для интеграционных тестов.
# Скрипт выполняется только при первой инициализации пустого тома.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE DATABASE dormhub_test OWNER "$POSTGRES_USER";
EOSQL