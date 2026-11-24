---
name: api-route-breaking-change
description: Apply when a diff changes an HTTP route or its request/response contract (path, params, query, body or response schema, status codes). Flag every change that breaks existing clients - renamed or removed path segments or query params, a new required request field, a removed or renamed response field, a changed field type, or a changed success/error status code - as CRITICAL unless the old contract is kept (versioned route or a new route alongside the old one).
---

# API route breaking change

An existing client was built against the contract as it was **before** this diff. A change is
breaking when such a client, unchanged, now gets an error, a different status, or data it
cannot read. Compare the old and new side of every route the diff touches.

## Breaking changes — flag as CRITICAL

| Change | Example |
|---|---|
| Path changed: segment renamed, removed, reordered, or method changed | `GET /users/:id` → `GET /accounts/:id`; `PUT` → `PATCH` |
| Query param renamed, or any path/query param's type or format narrowed | `?page` → `?cursor`; numeric `:id` now must be a UUID |
| New **required** request field (body, query or header) | body schema gains `currency: z.string()` without `.optional()` / default |
| Request field removed while clients still send it **and** the schema is strict | `.strict()` object now rejects `legacyFlag` |
| Response field removed or renamed | `name` → `fullName`; `items` → `data` |
| Response field type changed | `id: number` → `id: string`; `price` from number to `{ amount, currency }`; `tags: string[]` → `string` |
| Response field made nullable or optional where it was always present | `email: string` → `email: string \| null` |
| Enum value removed or renamed (request or response) | `status: 'open' \| 'closed'` → `'active' \| 'closed'` |
| Status code changed for an existing outcome | `201` → `200` on create; not-found `404` → `200` with `null`; `400` → `422` |
| Error body shape changed | `{ error: { code, message } }` → `{ message }` |
| Pagination, sorting or default limit semantics changed | default page size 50 → 20; results no longer sorted by `created_at` |

Severity is **CRITICAL** because existing clients fail at run time with no compile-time signal.

## When it is not CRITICAL

| Situation | Severity |
|---|---|
| The change ships as a **new version** (`/v2/users/:userId`) and the old route keeps its old contract | no finding (SUGGESTION at most, e.g. add a deprecation header to v1) |
| A **new route** is added alongside the unchanged old one | no finding |
| The old field is kept next to the new one (`name` and `fullName` both returned) | SUGGESTION: plan the removal |
| The route is clearly internal-only (not exposed, no external clients) and all callers are updated in the same diff | WARNING — still say which callers you checked |
| You can't see the old contract in the diff and only suspect a change | WARNING at most |
| Only the **name** of a path param changes (`/users/:id` → `/users/:userId`, same position and format) | WARNING: the URL on the wire is unchanged, but the published contract (OpenAPI, generated SDKs, docs) changes |

## Non-breaking — do not flag

- New optional request fields, or new fields with a server-side default.
- New response fields (additive).
- New routes, new enum values in a **response** that clients are told to ignore when unknown.
- Loosening validation (a required field becomes optional, a max length grows).
- Refactors that keep the wire contract byte-identical (moving the handler, renaming internals).

## How to report

- Cite the line where the contract changes: the route path string, the schema field, the
  `reply.code(...)` call, or the property in the returned object.
- State the old and new contract and who breaks: "clients calling `GET /users/42` with the
  `id` param now get a 400 because the schema requires `userId`".
- One finding per broken contract element. A rename that touches the param schema, the
  handler and the type is one finding, not three.
- Fix: keep the old contract and add a versioned or new route, or return both fields during a
  deprecation window.

## Example

```ts
// before
app.get('/users/:id', { schema: { params: z.object({ id: z.string() }) } },
  async (req) => ({ id: req.params.id, name: user.name }));

// after (this diff)
app.get('/users/:userId', { schema: { params: z.object({ userId: z.string() }) } },
  async (req) => ({ id: req.params.userId, fullName: user.name }));
```

One CRITICAL finding: the response field `name` → `fullName` — every client reading `name` now
gets `undefined`. One WARNING: the path param `:id` → `:userId` keeps the URL shape but changes
the published contract. Fix: keep `GET /users/:id` returning `name`; add `GET /v2/users/:userId`
with `fullName`, or return both `name` and `fullName` until clients migrate.
