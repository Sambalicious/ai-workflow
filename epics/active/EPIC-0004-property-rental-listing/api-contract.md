# API Contract: Property Rental Listing

## Base URL
https://api.example.com/v1

## Authentication
- Bearer token (JWT) in `Authorization` header
- Obtain via login endpoint (not in scope here)

## Common response envelope
```
{
  "success": boolean,
  "data": any,
  "error": string | null
}
```

## Error format
```
{
  "success": false,
  "error": "Error message"
}
```

## Endpoints

### POST /v1/properties
- Auth required: owner
- Request body:
  - title: string (required, 1-100 chars)
  - description: string (optional, max 1000 chars)
  - address: string (required, 1-200 chars)
  - rental_durations: array of enum [shortlet, weekly, monthly, annual] (required, 1+)
- Success: 201
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "...",
    "description": "...",
    "address": "...",
    "rental_durations": ["shortlet", ...],
    "owner_id": "uuid",
    "created_at": "timestamp"
  },
  "error": null
}
```
- Errors:
  - 400: validation error (e.g. missing/invalid fields)
  - 401: not authenticated

### GET /v1/properties
- Auth required: no
- Query params:
  - rental_duration: enum (optional, filter by one duration)
- Success: 200
```
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "...",
      "description": "...",
      "address": "...",
      "rental_durations": ["shortlet", ...],
      "owner_id": "uuid",
      "created_at": "timestamp"
    },
    ...
  ],
  "error": null
}
```
- Errors:
  - 400: invalid query param

### GET /v1/properties/{id}
- Auth required: no
- Path param: id (uuid)
- Success: 200
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "...",
    "description": "...",
    "address": "...",
    "rental_durations": ["shortlet", ...],
    "owner_id": "uuid",
    "created_at": "timestamp"
  },
  "error": null
}
```
- Errors:
  - 404: not found

## Changelog
Version | Date | Changes
------- | ---- | -------
v1.0.0  | 2026-04-24 | Initial contract
