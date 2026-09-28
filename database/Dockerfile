FROM postgres:16-alpine

# Default environment variables for PostgreSQL container (override via -e flag or docker-compose)
ENV POSTGRES_DB=loveletter
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres

COPY init.sql /docker-entrypoint-initdb.d/
