# `backend/src/services/`

Domain services for BR360. Issue [#485](https://github.com/rodlunt/business-review-360/issues/485). Spec: `docs/superpowers/specs/2026-04-29-485-domain-service-layer-design.md`.

## Why this folder exists

Route handlers in `backend/src/routes/` are thin HTTP adapters. The actual work (Sequelize queries, business invariants, side-effect emails, response shaping) lives in this folder so it can be:

1. Imported by `node-cron` jobs without standing up Express.
2. Imported by future Azure Container Apps scheduled jobs or Functions (portability principle #6 in `CLAUDE.md`).
3. Unit-tested without `supertest` or HTTP scaffolding.
4. Reused by other services (eg digest scheduler consuming analytics helpers).

## Conventions

### Service files

- One file per domain (`ideaService.js`, `userService.js`, `analyticsService.js`, `commentService.js`).
- Plain async functions, **named exports** (no classes, no default object of methods).
- JSDoc each exported function: `ctx` keys read, payload shape, return shape, typed errors thrown.
- Match the existing pattern in `statsService.js`, `digestEmailService.js`, `emailQueueService.js`.

### The `ctx` object

Every service function takes `ctx` as its first argument:

```
{
  user,            // mirrors req.user, optional for unauthed callers (cron)
  tenant,          // mirrors req.tenant
  organizationId,  // hoisted out of tenant for ergonomics; most callers need it
  tx,              // Sequelize transaction or null
}
```

When `ctx.tx` is `null` and CLS is active (the request-scoped wrapper from #561), Sequelize model calls auto-bind to the ambient transaction, so this works. Cron jobs pass `tx: null` and rely on per-call autocommit unless they wrap their own `sequelize.transaction(...)`.

When `ctx.tx` is set, services forward it to **raw** `sequelize.query(..., { transaction: ctx.tx })` calls explicitly. ORM calls keep working through CLS.

### What services must not do

- Import from `express` (no `req`, `res`, `next` parameters).
- Throw HTTP-shaped errors. Use the typed errors in `errors.js` instead.
- Hold module-level mutable state (caches, counters, singletons).
- Open their own transactions. Transaction lifecycle belongs to the request (or to the cron job's own wrapper).
- Read configuration at module load. Read `process.env.X` at call time so the secrets-adapter swap is one module, not a sweep.

### Typed errors

`errors.js` exports `ServiceError`, `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `PlanLimitError`. Throw the specific subclass; the route adapter maps it to the right HTTP status.

```js
import { NotFoundError } from "../services/errors.js";

export async function getIdeaByIdentifier(ctx, identifier) {
  const idea = await Idea.findOne({/* ... */});
  if (!idea) {
    throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });
  }
  return idea;
}
```

The `code` string is the stable contract for non-HTTP callers (cron jobs log it; tests assert on it; future frontend may branch on it, follow-up F5).

### Route adapter shape

```js
import { respondToServiceError } from "../services/errors.js";
import { createIdea } from "../services/ideaService.js";

router.post("/", async (req, res) => {
  try {
    const ctx = {
      user: req.user,
      tenant: req.tenant,
      organizationId: req.tenant?.organizationId,
      tx: req.transaction ?? null,
    };
    const idea = await createIdea(ctx, req.body);
    res.status(201).json(idea);
  } catch (err) {
    respondToServiceError(res, err, {
      fallbackMessage: "Failed to create idea",
      logContext: "[Ideas:create]",
    });
  }
});
```

Target: every handler under 50 lines. If a handler grows past that, the work belongs in the service.

### Tests

Service-level tests at `testing/backend-tests/services/<name>Service.test.js`. Direct service import, ctx assembled in the test, no `supertest`.

Route tests stay at `testing/backend-tests/<route>.test.js` and assert HTTP-shape correctness only (status codes, body envelope, middleware ordering). Business-logic assertions move down to the service tests.

The `errors.js` module has its own suite at `testing/backend-tests/serviceErrors.test.js`.

## Sending transactional email

**Always use `enqueueTemplateEmail` from `emailQueueService.js`.** Never call `sendTemplateEmail` directly from a route, service, or job for transactional sends. Issue [#738](https://github.com/rodlunt/business-review-360/issues/738) routed every transactional email through the queue because direct sends were silently swallowing Resend failures (#735 hid for an unknown number of weeks before a customer noticed).

```js
import { enqueueTemplateEmail, EmailPriority } from "./emailQueueService.js";

const result = await enqueueTemplateEmail({
  to: "user@example.com",
  subject: "Action required",
  template: await loadTemplate("auth", "PasswordReset"),
  templateProps: { resetUrl, organizationName },
  categories: ["password-reset", organizationId], // forwarded to Resend tags
  type: "password-reset", // discriminator on EmailQueue
  priority: EmailPriority.CRITICAL, // see EmailPriority enum
  organizationId, // required for per-tenant stats
});

if (!result.success) {
  logger.warn("[X] Could not enqueue email:", result.error);
}
```

Why the queue and not direct send:

- **Durable.** A transient Resend outage retries automatically (default 3 attempts, exponential backoff).
- **Observable failures.** After the retry budget exhausts, the row is marked `status='failed'` with the error string. The alert query is `SELECT count(*) FROM "EmailQueues" WHERE status = 'failed' AND "createdAt" > now() - interval '1 hour'`.
- **Off the request path.** Rendering still happens at enqueue time (synchronous), but Resend's HTTP call moves to the queue worker (`processQueue`, drained every 60s by `emailQueueWorker.js`).

Priority guide (`EmailPriority` enum):

| Level      | Use case                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `CRITICAL` | Password reset, security alerts. Bypasses user-opt-out check inside processQueue. |
| `HIGH`     | Email verification, password-changed, billing events, admin pending-approval.     |
| `NORMAL`   | Comment notifications, status changes, idea-implemented, sales enquiries.         |
| `LOW`      | Stale-ideas digests, daily idea digests.                                          |
| `BATCH`    | Internal: created by `batchDigestEmails` for digest aggregation.                  |

## Phase rollout

1. **Phase 1 (this PR):** `errors.js` foundation + this README.
2. **Phase 2:** `ideaService.js` extraction from `routes/ideas.js`.
3. **Phase 3:** `analyticsService.js` extraction from `routes/analytics.js`, plus reconciliation with `statsService.js`.
4. **Phase 4:** `userService.js` extraction from `routes/users.js`.
5. **Phase 5:** `commentService.js` extraction from `routes/comments.js`.

See the spec for ordering rationale and follow-up tickets (F1 through F6).
