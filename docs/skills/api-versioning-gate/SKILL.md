---
name: api-versioning-gate
description: Apply when a diff changes the contract of an existing public API route. Treat versioning as a merge gate - a contract change must ship as a new versioned or new route while the old one keeps working. Flag an in-place contract change with no new version as CRITICAL, and a new version that drops the old route, or ships without a deprecation signal, as WARNING.
---

# API versioning gate

This skill decides whether a contract change is **allowed to merge**, not only whether it is
breaking. Use it together with a breaking-change check: once a change is known to alter what
existing clients send or receive, this gate asks "was it versioned the right way?".

A contract change is any change to a route's method, path, params, query, request body,
response body, status codes or error shape that an existing client can observe.

## The gate

A contract change passes only if **all** of these hold:

1. **New version or new route.** The new contract lives at a new path — a version prefix
   (`/v2/users/:userId`), a version header the server routes on, or a new route name — and is
   registered **next to** the old one.
2. **Old route unchanged.** The old route keeps its path, params, response fields and status
   codes byte-for-byte. Changing the handler's internals is fine; changing its output is not.
3. **Deprecation signal.** The old route announces the change: a `Deprecation` and/or `Sunset`
   response header, a `Link: <…/v2/…>; rel="successor-version"` header, or a deprecation note
   in the API docs / OpenAPI spec that the diff updates.
4. **Shared code does not leak.** If old and new routes share a mapper or schema, the change to
   the shared piece must not alter the old route's output (look for one serializer edited for
   both).

## What to flag

| Situation | Severity |
|---|---|
| An existing route's contract is changed **in place** (no new version or route) | CRITICAL |
| A new version is added but the old route is removed or redirected in the same diff | WARNING |
| A shared serializer / schema is edited so the old route's output changes too | CRITICAL |
| New version added, old route kept, but no deprecation signal anywhere in the diff | WARNING |
| Version naming inconsistent with the rest of the API (`/v2` here, `/api/2` elsewhere) | SUGGESTION |
| Purely additive change (new optional field, new route) | no finding — the gate does not apply |

Anti-inflation: if you cannot see that the route is public (exposed outside the service, used
by other repos or a published SDK), and every caller is updated in the same diff, the in-place
change is a WARNING, not CRITICAL. Say which callers you checked.

## Example

```ts
// fails the gate (CRITICAL): v1 changed in place
- app.get('/users/:id', async (req) => ({ id: req.params.id, name: u.name }));
+ app.get('/users/:userId', async (req) => ({ id: req.params.userId, fullName: u.name }));

// passes the gate
  app.get('/users/:id', async (req, reply) => {
+   reply.header('Deprecation', 'true').header('Link', '</v2/users/' + req.params.id + '>; rel="successor-version"');
    return { id: req.params.id, name: u.name };
  });
+ app.get('/v2/users/:userId', async (req) => ({ id: req.params.userId, fullName: u.name }));
```

Cite the line where the old route's contract changes (the path string or the returned field),
and in the fix name the concrete new route to add.
