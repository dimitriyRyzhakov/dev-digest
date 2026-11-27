---
name: response-schema
description: Apply when a diff changes the shape of data an API returns - response schemas (Zod, JSON Schema, Fastify `schema.response`, OpenAPI), DTO/contract types, serializers or the objects handlers return. Flag a field removed, renamed or retyped, required→optional, newly nullable, an enum value added or removed, a changed format or unit as CRITICAL; flag a schema that disagrees with what the handler actually returns, or a type that drifts from its runtime schema, as WARNING.
---

# Response schema

Clients parse a response with the shape they were built against: generated SDKs, `z.parse`,
TypeScript types, `switch` on enum values, `field.toUpperCase()`. The rule for responses is the
opposite of requests: the server may **add** fields, but it must not make what it already returns
**less certain** (missing, `null`, a new type, a new enum value) without a new version.

## Breaking response changes - flag as CRITICAL

| Change | Example | Why clients break |
|---|---|---|
| Field removed or renamed | `items` → `data`; `name` dropped | `undefined` where a value was guaranteed |
| Field type changed | `id: number` → `string`; `price: number` → `{ amount, currency }`; `tags: string[]` → `string` | parser / arithmetic / iteration fails |
| Required → optional | `email: z.string()` → `z.string().optional()`; `required: ['email']` removed | `email.toLowerCase()` throws on missing |
| Newly nullable | `z.string()` → `z.string().nullable()` / `.nullish()`; `type: ['string','null']` | null checks were never written |
| Enum value removed or renamed | `status: 'open' \| 'closed'` → `'active' \| 'closed'` | client logic for `open` never runs |
| Format, unit or precision changed | ISO date → epoch ms; cents → units; `uuid` → numeric id; `float` → rounded `int` | silently wrong data |
| Object ↔ array, single ↔ list, envelope added/removed | `{ user }` → `user`; `T` → `{ data: T }` | every read path breaks |
| Error body shape changed | `{ error: { code, message } }` → `{ message }` | error handling falls through |
| Field that was omitted when empty is now sent as `null` (or vice versa) | `"tags": null` instead of no key | `'tags' in res` / strict schemas change result |

## Lower severity

| Change | Severity |
|---|---|
| **Enum value added** to a response field | WARNING - exhaustive `switch` / strict enum parsing in clients rejects it; no finding if the contract documents "unknown values must be ignored" |
| The schema declares a field the handler no longer returns (or returns under another name) | WARNING - with Fastify `schema.response` a missing required field is a 500 at serialization; without one, clients get `undefined` |
| The handler returns a field the response schema does not declare | WARNING - Fastify's serializer silently strips it, so the "new field" never reaches clients |
| The TS type of a response and its runtime schema disagree (`interface Dto` vs `z.object` / JSON Schema), or two copies of one contract drift apart | WARNING - compile-time types lie about the wire |
| Response schema loosened to `z.any()` / `additionalProperties: true` / `unknown` for a known shape | WARNING - clients lose the contract and validation |
| New optional response field, new nullable field, new required field (additive) | no finding |
| The change ships as a new version / new route and the old response stays unchanged | no finding |
| Both old and new field returned during a migration (`name` and `fullName`) | SUGGESTION - plan the removal |
| Response type you can only see one side of (old shape not in the diff) | WARNING at most |

Making a response field **stricter** (optional → required, nullable → non-null, removing an
enum value nobody can receive) is safe for clients; do not flag it.

## How to check

1. Find every response definition in the diff: `schema: { response: { 200: … } }`, Zod objects
   used as response contracts or `.parse` on output, `*.d.ts` / DTO types, OpenAPI `responses`,
   serializers / mappers (`toDto`, `toJSON`), and the object literal each handler `return`s or
   passes to `reply.send`.
2. For each field compare old (`-`) and new (`+`): present?, name, type, optional/required,
   nullable, enum members, format/unit.
3. Compare the schema with what the handler builds: every declared required field is set, every
   returned field is declared, types match (e.g. a `Date` object vs `type: 'string', format:
   'date-time'`).
4. If the repo keeps one contract in several places (shared package copies, server + client
   types), check that the diff updates all of them consistently.

## How to report

- Cite the line of the schema field or the returned property that changed.
- State old → new and the client symptom: "`email` is now `.nullish()`; clients calling
  `user.email.toLowerCase()` crash on users without email".
- One finding per field. If a breaking-change or route skill already reported the same field,
  do not report it again.
- Fix: keep the old field and type (add the new one next to it), keep it required with a safe
  value, or ship the new shape under a new version / route.

## Example

```ts
// before
const UserDto = z.object({ id: z.number(), email: z.string(), role: z.enum(['admin', 'member']) });
app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => toDto(user));

// after (this diff)
const UserDto = z.object({ id: z.string(), email: z.string().nullish(), role: z.enum(['admin', 'member', 'owner']) });
// toDto now returns { id, email, role, avatarUrl }
```

Findings: CRITICAL `id` number → string; CRITICAL `email` became nullish; WARNING new enum value
`owner` in a response; WARNING `avatarUrl` is returned but not in the response schema, so the
serializer drops it.

## Do not flag

- Request-side validation changes (those are request contract, not response shape).
- Internal types never sent over the wire.
- Additive optional fields, documentation-only changes, reordering of keys.
