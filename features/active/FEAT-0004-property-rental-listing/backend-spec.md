# Backend Engineering Spec: Property Rental Listing

## Technology choices
| Layer         | Choice                | Rationale                                  |
|--------------|-----------------------|--------------------------------------------|
| Language     | TypeScript (Node.js)  | Popular, strong typing, async support      |
| Framework    | Express.js            | Simple, widely used, easy to extend        |
| Database     | PostgreSQL            | Relational, strong enum and indexing       |
| ORM          | Prisma                | Type-safe, good enum support, migrations   |
| Auth         | JWT (Bearer)          | Standard, stateless, frontend-friendly     |
| Caching      | None (v1)             | Not needed for MVP, revisit at scale       |
| Background   | None (v1)             | No async jobs in MVP                       |
| Hosting      | Render/Fly.io/Heroku  | Simple, fast deploy, managed DB options    |

## Data model
### Table: properties
- id: UUID, PK
- owner_id: UUID, FK → users.id, indexed
- title: string, not null
- description: text, nullable
- address: string, not null
- rental_durations: rental_duration[], not null, indexed (Postgres enum array)
- created_at: timestamp, not null
- updated_at: timestamp, not null

### Table: users (reference)
- id: UUID, PK
- role: enum (owner, tenant)

#### Enum: rental_duration
- shortlet
- weekly
- monthly
- annual

## Backend architecture overview
- Requests enter via Express routes, validated with middleware.
- Business logic in service layer (propertyService), data access via Prisma ORM.
- No background jobs required for MVP; all actions are synchronous.

### Directory tree
```
apps/api/src/features/property/
  property.controller.ts
  property.service.ts
  property.repository.ts
  property.types.ts
  property.validators.ts
  property.test.ts
apps/api/src/features/user/
  user.controller.ts
  user.service.ts
  user.repository.ts
  user.types.ts
  user.validators.ts
  user.test.ts
shared/
  middlewares/
    auth.ts
  prisma/
    schema.prisma
  app.ts
  server.ts
```

## Authentication and authorization model
- JWT tokens issued at login, validated via middleware.
- Authorization enforced in route middleware (owner for create, any for search/retrieve).

| Role   | Can create listing | Can search | Can view listing |
|--------|-------------------|------------|-----------------|
| Owner  | Yes               | Yes        | Yes             |
| Tenant | No                | Yes        | Yes             |

## Gherkin scenario coverage
| Scenario tag | Scenario name                                   | Endpoint                | How it's handled                  |
|--------------|-------------------------------------------------|-------------------------|-----------------------------------|
| -            | Owner lists a property for multiple durations    | POST /v1/properties     | Success: 201, error: 400/401      |
| -            | Tenant searches by rental duration               | GET /v1/properties      | Success: 200, error: 400          |
| -            | Owner lists property for only shortlet           | POST /v1/properties     | Success: 201, error: 400/401      |
| -            | Tenant cannot find properties for unavailable    | GET /v1/properties      | Success: 200 (empty array)        |

## Known risks and trade-offs
- No caching: search may be slow at scale.
- No pagination: large result sets could be expensive.
- rental_durations as enum array: harder to index for advanced queries.
- No audit/history fields (can add later).

## Development setup
- Clone repo, run `npm install` in backend/
- Set DATABASE_URL in .env
- Run `npx prisma migrate dev`
- Start server: `npm run dev`
- Seed data: optional script

## TL;DR
Express/Prisma backend, JWT auth, properties table with enum array for durations, endpoints for create/search/retrieve. No caching or background jobs in v1.

## Domain-driven directory structure

The backend follows a domain-driven, feature-based structure. Each feature (domain) has its own folder containing:
- `property.controller.ts`: Handles HTTP requests and responses for the property domain
- `property.service.ts`: Contains business logic for property operations
- `property.repository.ts`: Handles data access and persistence for properties
- Additional files as needed (e.g., types, validators)

Example directory tree for the property feature:
```
apps/api/src/features/property/
  property.controller.ts
  property.service.ts
  property.repository.ts
  property.types.ts
  property.validators.ts
  property.test.ts
```
- Shared modules (e.g., auth, db) live in their own feature folders.
- Each feature is responsible for its own API, logic, and data access, improving maintainability and scalability.
