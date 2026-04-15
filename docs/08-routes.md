# 08 — API Routes

## All routes are open (no auth)
Only `/api/bridge/*` is restricted — blocked if request is not from localhost.
`proxy.ts` checks `req.headers['x-forwarded-for']` or `req.socket.remoteAddress` for 127.0.0.1.

## Route table

| Route | Method | Description |
|-------|--------|-------------|
| `/api/bridge/sync` | POST | Receive sync payload from Python bridge. Writes all Object 1 tables. Uses `SUPABASE_SERVICE_ROLE_KEY`. |
| `/api/bridge/status` | GET | Returns `{ connected: bool }` — pings bridge at `BRIDGE_URL`. |
| `/api/design/beam` | POST | Runs beam group design engine. Reads `staad_diagram_points`. Writes `beam_checks` + `beam_reinforcement`. |
| `/api/design/column` | POST | Runs column design engine. Reads `staad_envelope`. Writes `column_checks`. |
| `/api/design/slab` | POST | Runs slab design engine. Writes `slab_checks`. |
| `/api/design/footing` | POST | Runs footing design engine. Reads `staad_reactions`. Writes `footing_checks`. |
| `/api/reports/generate` | POST | Generates PDF via React-PDF. Uploads to Supabase Storage. Writes `design_reports`. |
| `/api/ai/assistant` | POST | Streaming Claude response. System prompt gets project context from Supabase. |

## Design endpoint request shape
```typescript
// POST /api/design/beam
{ project_id: string; beam_design_ids: string[] }
// runs runBeamGroupDesign for the specified group

// POST /api/design/column
{ project_id: string; column_design_id: string }

// POST /api/design/slab
{ project_id: string; slab_design_id: string }

// POST /api/design/footing
{ project_id: string; footing_design_id: string }
```

## Error response shape (all routes)
```typescript
// success
{ ok: true, data: any }

// error
{ ok: false, error: string }
// HTTP 400 = bad request, 404 = not found, 500 = engine error
```

## Bridge sync endpoint
Expects `X-Bridge-Secret` header matching `process.env.BRIDGE_SECRET`.
If missing or wrong → 401.
Uses `SUPABASE_SERVICE_ROLE_KEY` (not anon key) to bypass RLS and bulk-insert Object 1 tables.
Upsert strategy: on conflict (project_id, member_id, combo_number, x_ratio) do update.
