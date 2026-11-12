# Architecture & System Design

## Overview
The system will support property owners listing properties for rent with flexible durations (shortlet, weekly, monthly, annual) and tenants searching/filtering by these durations.

## Key Components
- User Service: Handles registration and authentication for owners and tenants.
- Property Service: Manages property listings, including rental durations.
- Search Service: Enables filtering/searching by rental duration.
- Booking Service (future): For shortlet and transactional flows.

## Data Flow
1. Owner creates a listing specifying available rental durations.
2. Listing is stored in the Property Service.
3. Tenants search via Search Service, filtering by duration.
4. Results are returned based on matching durations.

## Hard Decisions
- Rental durations are modeled as an enum (shortlet, weekly, monthly, annual) for extensibility.
- Listings can support multiple durations per property.
- Search indexing must support filtering by multiple durations.

## TL;DR
Flexible property listing and search by rental duration, with modular services for extensibility.