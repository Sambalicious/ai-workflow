# Frontend Engineering Spec: Property Rental Listing

---

### Technology choices
| Layer              | Choice                | Rationale |
|--------------------|----------------------|-----------|
| Framework          | Vite (TanStack Start) or Next.js | Fast dev/build, modern features, flexible SSR/SPA |
| Routing            | TanStack Router         | Modern, type-safe, and idiomatic for Vite/TanStack projects |
| State management   | React Context + local state      | Simple, scalable for most needs |
| Data fetching      | React Query           | Powerful caching, async state, devtools |
| Styling            | CSS Modules or Tailwind CSS      | Scoped, maintainable, utility-first option |
| Component library  | BaseUI                | Accessible, customizable primitives |
| Form handling      | React Hook Form       | Accessible, performant forms |
| Testing            | React Testing Library + Vitest   | Modern, fast, supports Vite/Next.js |

Notes:
- If both Vite and Next.js are viable, default to Vite (TanStack Start) unless the project requires SSR or API routes, in which case use Next.js.
- Styling can be either CSS Modules or Tailwind CSS, based on designer preference or project needs.
- All new specs, skeletons, and code examples must reflect these choices unless the user requests otherwise.
- Mobile responsiveness is a requirement, not an afterthought. All components and layouts must be fully responsive and tested on common device sizes.

---

### API contract gaps
| Screen / component         | What's needed                                  | Severity |
|---------------------------|------------------------------------------------|----------|
| Property Card             | Owner name or contact info                     | Nice-to-have |
| Property Listing Form     | Field validation error messages (API returns only generic error) | Nice-to-have |
| Property List (Tenant)    | Pagination or result count                     | Nice-to-have |

None are blockers. All core flows are supported by the API contract.

---

### Screen-to-endpoint mapping
| Screen / component         | HTTP method | Endpoint                | Auth required | Notes |
|---------------------------|-------------|-------------------------|---------------|-------|
| Property Listing Form     | POST        | /v1/properties          | Yes (owner)   | Create new listing |
| Property List (Tenant)    | GET         | /v1/properties          | No            | Filter by rental_duration |
| Property Card (Detail)    | GET         | /v1/properties/{id}     | No            | View property details |

---

### Component architecture
The frontend follows a domain-driven, feature-based structure. Each feature (domain) has its own folder containing:
- `components/`: UI components specific to the feature
- `hooks/`: Custom hooks for data fetching, state, or logic
- `pages/`: Feature entry points or routed pages
- `types/`: TypeScript types and interfaces
- `utils/`: Helpers, API URLs, schema definitions, and utility functions

Example directory tree for the property rental feature:
```
epic-0004-property-rental-listing/
  frontend/
    features/
      property/
        components/
          PropertyListingForm.tsx
          PropertyCard.tsx
          SearchFilter.tsx
          RentalDurationBadge.tsx
        hooks/
          useProperties.ts
          useRentalDurations.ts
        pages/
          OwnerDashboard.tsx
          TenantBrowse.tsx
          PropertyDetail.tsx
        types/
          property.ts
        utils/
          api.ts
          schema.ts
          helpers.ts
    context/
      AuthContext.tsx
    App.tsx
    index.tsx
```

- Shared components or utilities live at the root or in a `shared/` directory.
- State is colocated with the feature unless global (e.g., auth context).
- API calls, schemas, and helpers are organized per feature for maintainability and scalability.

---

### State management plan
- Auth state: context (AuthContext), set on login
- Property listing form: local state (form fields, validation)
- Search filter: local state (selected duration)
- Property list: server state (SWR/React Query)
- Property detail: server state (SWR/React Query)
- Loading/error states: handled by data fetching layer

---

### API integration layer
- HTTP client: fetch or axios, wrapped in api/properties.ts
- Auth tokens: stored in memory (context), attached to requests via Authorization header
- Errors: surfaced via error boundaries or inline error messages (from API)
- Loading/refetch: handled by SWR/React Query, with UI spinners/placeholders

---

### Implementation skeleton

#### frontend/components/PropertyListingForm.tsx
```tsx
import React from 'react';
// TODO: import form libs, types
export function PropertyListingForm() {
  // TODO: Form state, handlers, submit logic
  return (
    <form>{/* ...fields... */}</form>
  );
}
```

#### frontend/components/PropertyCard.tsx
```tsx
import React from 'react';
// TODO: Define props for property data
export function PropertyCard(/* props */) {
  // TODO: Render property info, rental durations
  return <div>{/* ... */}</div>;
}
```

#### frontend/components/SearchFilter.tsx
```tsx
import React from 'react';
// TODO: Filter by rental duration
export function SearchFilter({ value, onChange }) {
  return <div>{/* ... */}</div>;
}
```

#### frontend/pages/OwnerDashboard.tsx
```tsx
import React from 'react';
import { PropertyListingForm } from '../components/PropertyListingForm';
export function OwnerDashboard() {
  return <PropertyListingForm />;
}
```

#### frontend/pages/TenantBrowse.tsx
```tsx
import React from 'react';
import { SearchFilter } from '../components/SearchFilter';
import { PropertyCard } from '../components/PropertyCard';
export function TenantBrowse() {
  // TODO: Fetch property list, filter state
  return <div>{/* ... */}</div>;
}
```

#### frontend/pages/PropertyDetail.tsx
```tsx
import React from 'react';
export function PropertyDetail() {
  // TODO: Fetch property by ID
  return <div>{/* ... */}</div>;
}
```

#### frontend/api/properties.ts
```ts
// TODO: API calls for GET/POST properties
```

#### frontend/context/AuthContext.tsx
```tsx
import React from 'react';
// TODO: Provide auth state, role, token
```

#### frontend/App.tsx
```tsx
import React from 'react';
// TODO: Routing, context providers
```

---

### Gherkin scenario coverage
| Scenario tag | Scenario name                                   | Component(s)                | UI behaviour |
|--------------|--------------------------------------------------|-----------------------------|--------------|
| (none)       | Owner lists a property for multiple durations    | PropertyListingForm, PropertyCard | Owner selects durations, sees all on card |
| (none)       | Tenant searches for properties by rental duration| TenantBrowse, SearchFilter, PropertyCard | Tenant filters, sees matching cards |
| (none)       | Owner lists property for only shortlet           | PropertyListingForm, PropertyCard | Only shortlet shown on card |
| (none)       | Tenant cannot find properties for unavailable    | TenantBrowse, SearchFilter  | No results UI |

All scenarios mapped. No gaps.

---

### API state coverage
- PropertyListingForm
  - [x] Loading state (submit in progress)
  - [x] Success state (listing created)
  - [x] Error state (API error)
- TenantBrowse
  - [x] Loading state (fetching list)
  - [x] Success state (results shown)
  - [x] Empty state (no results)
  - [x] Error state (API error)
- PropertyDetail
  - [x] Loading state
  - [x] Success state
  - [x] Error state

---

### Known risks and trade-offs
- No pagination in property list (could be slow with many results)
- No owner contact info in API (limits tenant-owner interaction)
- Error messages from API are generic (may need UI-side mapping)
- No optimistic UI for listing creation (submit waits for API)
- No offline support or caching beyond SWR/React Query defaults

---

### Development setup
- `cd frontend && npm install`
- `.env` for API base URL, etc.
- `npm start` to run locally
- API must be running or use mock server for dev

---

### TL;DR for downstream agents
This spec covers the property rental listing UI for owners (listing properties with flexible durations) and tenants (searching/filtering by duration). All Gherkin scenarios are mapped to UI components. The API contract supports all flows, with only minor nice-to-have gaps. Main risks are lack of pagination and owner contact info. QA should focus on duration filtering, error/empty states, and accessibility of all controls.
