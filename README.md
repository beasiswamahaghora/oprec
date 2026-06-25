# Oprec Board

A small internal Kanban board with three states: **Unassigned**, **Assigned**, and **Done**.

The app uses:

- React + Vite for the interface
- Cloudflare Pages Functions for the API
- Cloudflare D1 for the database
- Cloudflare Durable Objects and WebSockets for live cursors and task synchronization
- One server-side shared password and a signed HttpOnly session cookie

## Run locally

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy the local secrets file:

   ```powershell
   Copy-Item .dev.vars.example .dev.vars
   ```

   Set a team password and a long random session secret in `.dev.vars`.

3. Apply the local database migration:

   ```powershell
   npm.cmd run db:migrate:local
   ```

4. Run the full Pages app:

   ```powershell
   npm.cmd run pages:dev
   ```

Wrangler prints the local URL, normally `http://localhost:8788`.

## Deploy to Cloudflare

1. Authenticate Wrangler:

   ```powershell
   npx.cmd wrangler login
   ```

2. Create the D1 database:

   ```powershell
   npx.cmd wrangler d1 create teamboard
   ```

3. Replace the placeholder `database_id` in `wrangler.jsonc` with the ID returned by Cloudflare.

4. Apply the migration:

   ```powershell
   npm.cmd run db:migrate:remote
   ```

5. Create a Pages project and deploy:

   ```powershell
   npm.cmd run deploy
   ```

6. In the Cloudflare dashboard, open the Pages project and add these encrypted secrets under **Settings → Variables and Secrets**:

   - `TEAM_PASSWORD`
   - `SESSION_SECRET`

   Also confirm that the D1 database is bound as `DB`, then redeploy.

## GitHub Actions deployment

Pushes to `main` deploy the realtime Worker and Pages app through
`.github/workflows/deploy.yml`.

The private GitHub repository must contain this Actions secret:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to edit Workers,
  Pages, Durable Objects, and the existing project resources.

`TEAM_PASSWORD` and `SESSION_SECRET` remain encrypted in Cloudflare Pages and are
not stored in GitHub.
