# DevOps Configuration: Property Rental Listing Backend

---

### Infrastructure overview
- **Hosting provider:** Render.com (recommended for simplicity, free tier for small Postgres, easy Node.js deploy)
- **Managed services:**
  - PostgreSQL (Render managed DB)
- **Monthly cost estimate:** $0–$7 at MVP scale (free tier for web service, $7 for starter Postgres)
- **Why Render?**
  - Simple deploy from GitHub, built-in CI/CD, managed Postgres, easy rollback, no vendor lock-in. Alternatives (Fly.io, Heroku) are similar but Render is more cost-predictable and beginner-friendly.

---

### Dockerfile
```Dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
# Non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3000
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

---

### CI/CD pipeline
**.github/workflows/deploy.yml**
```yaml
name: CI/CD Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci --prefix backend
      - name: Lint
        run: npm run lint --prefix backend
      - name: Type check
        run: npm run typecheck --prefix backend
      - name: Run tests
        run: npm test --prefix backend

  build-push:
    needs: test-lint
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: ${{ secrets.DOCKER_IMAGE }}:latest

  deploy-staging:
    needs: build-push
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Render Staging
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK_STAGING }}

  deploy-production:
    needs: build-push
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ secrets.PRODUCTION_URL }}
    steps:
      - name: Wait for approval
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ github.TOKEN }}
      - name: Deploy to Render Production
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK_PROD }}
```

---

### Environment variables
| Name                | Description                        | Example value                        | Secret? |
|---------------------|------------------------------------|--------------------------------------|---------|
| DATABASE_URL        | PostgreSQL connection string        | postgres://user:pass@host:5432/db    | Yes     |
| JWT_SECRET          | JWT signing key                     | supersecretkey                       | Yes     |
| PORT                | App port (default 3000)             | 3000                                 | No      |
| NODE_ENV            | Node environment                    | production                           | No      |
| DOCKER_IMAGE        | Docker image name for CI/CD         | myorg/property-listing-backend       | No      |
| RENDER_DEPLOY_HOOK_STAGING | Render deploy hook (staging)   | https://api.render.com/deploy/...    | Yes     |
| RENDER_DEPLOY_HOOK_PROD    | Render deploy hook (prod)      | https://api.render.com/deploy/...    | Yes     |
| PRODUCTION_URL      | Public URL for production           | https://property-listing.example.com | No      |

---

### Secrets management
- **Where:** GitHub Actions secrets (for CI/CD), Render dashboard (for runtime)
- **How:**
  - Store all secrets (DB URL, JWT secret, deploy hooks) in GitHub repo settings (Settings → Secrets and variables → Actions)
  - Render: set DATABASE_URL and JWT_SECRET in Render dashboard (Environment → Environment Variables)
- **Access:** Only maintainers/admins have access to secrets in GitHub and Render

---

### Deployment runbook
1. **First-time deployment:**
   - Provision PostgreSQL on Render
   - Set DATABASE_URL and JWT_SECRET in Render service settings
   - Push main branch to GitHub
   - CI/CD builds, pushes image, triggers deploy via Render deploy hook
   - Run `npx prisma migrate deploy` on Render shell (or via deploy script)
2. **Rolling update:**
   - Merge PR to main
   - CI/CD pipeline builds, pushes, and deploys automatically
3. **Rollback procedure:**
   - In Render dashboard, redeploy previous successful build (one-click)
   - Or, revert commit in GitHub and redeploy
4. **Database migration deploy:**
   - Schema changes: update `prisma/schema.prisma`, commit, merge to main
   - CI/CD deploys, then run `npx prisma migrate deploy` on Render

---

### Observability
- **Metrics:**
  - HTTP request count, error rate, latency (Render metrics, or add Prometheus if scaling)
- **Logs:**
  - Structured JSON logs (console.log), 30-day retention on Render
- **Alerts:**
  - Set up Render alerts for failed deploys, high error rates, DB downtime
- **Recommended tools:**
  - Render built-in metrics/logs, Sentry (for error tracking), UptimeRobot (external ping)

---

### Backup and disaster recovery
- **What:** PostgreSQL DB (automated by Render)
- **How often:** Daily automatic backups (Render default)
- **Restore:** Via Render dashboard (point-in-time restore)

---

### TL;DR for downstream agents
This backend is a Node.js/Express/Prisma app deployed on Render with managed Postgres. CI/CD via GitHub Actions builds/tests, pushes Docker images, and triggers deploys. Secrets are managed in GitHub and Render. Observability and backups are handled by Render. Rollbacks and restores are one-click in the dashboard.
