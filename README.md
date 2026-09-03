# Booking System

## PostgreSQL development setup

This project is designed to run against a real PostgreSQL instance for development and integration verification. The app does not silently fall back to pg-mem in production.

### Start PostgreSQL

```bash
docker ps -a
# If the container is not running:
docker start booking-postgres
```

### Stop PostgreSQL without deleting data

```bash
docker stop booking-postgres
```

### Required environment

Create a local `.env` file from `.env.example` and set the real connection string:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/booking_system
JWT_SECRET=replace-with-a-secure-secret
NODE_ENV=development
```

### Run migrations

```bash
npm run db:migrate
```

### Seed the development database

```bash
npm run db:seed
```

### Run the backend

```bash
npm run server
```

### Run unit tests

```bash
npm run test:unit
```

### Run integration tests against PostgreSQL

```bash
npm run test:integration
```

### Reset the local development database

```bash
npm run db:reset
```

> Warning: this drops development tables and must only be used in a local development environment.

## Production safety

- `DATABASE_URL` is required in production.
- `ALLOW_PG_MEM` must be set explicitly and is not enabled by default.
- The pg-mem fallback is for isolated unit tests only.
