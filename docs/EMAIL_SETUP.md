# Email Configuration Guide

Business Review 360 sends transactional email (password reset, email verification, welcome, sales notifications, idea notifications) via [Resend](https://resend.com). Resend is the sole supported provider; the previous nodemailer / Gmail SMTP fallback was removed in #708.

> **Migration history:** BR360 ran on SendGrid until 2026-04-25, when the free trial expired and a then-recently-shipped signature verifier (#479 / #539) was rejecting webhooks with 401. The full provider swap is documented in commit `c9ff3ff` and follow-up commit `aed4d1e`. The deprecated nodemailer fallback was removed under #708.

---

## Production: Resend

### 1. Create a Resend account

- Sign up at https://resend.com (no credit card required for the free tier).
- GitHub OAuth is supported; the account email defaults to whichever email is primary on your GitHub.

### 2. Verify your sending domain

In Resend's dashboard:

1. **Domains** -> **Add Domain** -> enter your apex domain (e.g. `example.com`).
2. **Region:** pick `ap-northeast-1` (Tokyo) for Australian-facing apps; `us-east-1` for US-facing. The chosen region is sticky on a verified domain.
3. Resend shows three DNS records to add at your registrar:
   - `MX` on `send.<domain>` -> `feedback-smtp.<region>.amazonses.com` priority 10 (bounce-feedback path)
   - `TXT` on `send.<domain>` -> `v=spf1 include:amazonses.com ~all` (SPF for the bounce subdomain)
   - `TXT` on `resend._domainkey` -> `v=DKIM1; k=rsa; p=<long-base64-key>` (DKIM signing)
4. Optionally also add a DMARC record:
   - `TXT` on `_dmarc` -> `v=DMARC1; p=none; rua=mailto:<your-monitoring-mailbox>`

For the BR360 production domain, full step-by-step VentraIP-specific instructions live in `docs/DEPLOYMENT.md`.

### 3. Create an API key

- **API Keys** -> **Create API Key** -> name it (e.g. `BR360-prod`) -> permission **Full Access** or **Sending Access**.
- Copy the key immediately; Resend shows it only once.
- Keys start with `re_`.

### 4. Set production environment variables

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=auth@yourdomain.com
```

`EMAIL_FROM` must be on a domain you've verified in Resend. The value flows through to every transactional send.

### 5. Verify with a smoke test

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "auth@yourdomain.com",
    "to": ["yourself@example.com"],
    "subject": "Resend smoke test",
    "text": "Domain verified."
  }'
```

A 200 response with `{"id":"..."}` confirms key + domain are wired up.

---

## Local development

### Resend test key

- Create a separate API key in Resend, name it `BR360-dev` or similar.
- Set `RESEND_API_KEY` and `EMAIL_FROM` in your local `.env`.
- Test sends count against your free-tier quota (3,000/month).
- For zero-quota dev work, leave `RESEND_API_KEY` unset and rely on test mode (below); the helpers log instead of sending.

### Test mode (no actual sends)

The email helpers detect test recipients automatically and short-circuit to a console log:

- Recipients matching `*@example.com`, `*@test.com`, `test*`, `*testuser*`, `*localhost*`
- `NODE_ENV=test`
- No email provider configured at all

---

## Provider selection logic

`backend/src/emails/utils/sendEmail.js` (single source of truth, called via `sendTemplateEmail` from routes and the `notificationEmailService`) follows this order:

1. **Test mode** -> log only, no send.
2. **Resend** -> if `RESEND_API_KEY` is set, send via Resend SDK.
3. Otherwise, log a warning and skip the send.

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | for prod | - | API key from Resend dashboard, starts with `re_` |
| `EMAIL_FROM` | for prod | `auth@example.com` | Verified sender address |
| `EMAIL_FROM_NAME` | optional | unset (bare address) | Display name on the From header. With it: `Business Review 360 <auth@...>`. Without it: `auth@...`. (#645) |
| `SALES_NOTIFICATION_EMAIL` | optional | falls back to `EMAIL_FROM` | Where new sales-enquiry alerts go |
| `SUPPORT_EMAIL` | optional | falls back to `EMAIL_FROM` | Customer-visible support address shown in transactional templates |
| `ADMIN_RECOVERY_EMAIL` | recommended | - | Admin contact for password reset escalations |
| `FRONTEND_URL` | yes | - | Base URL embedded in reset/verification links |

---

## Webhooks

The Resend event webhook (delivered, opened, clicked, bounced, complained) is **not currently wired up**. The legacy SendGrid webhook handler was deleted as part of the migration; restoration is tracked in #572. Until that ships, the analytics dashboard from #448 shows sent-only data.

---

## Troubleshooting

- **401 Unauthorized from Resend**: API key is wrong or revoked. Generate a fresh one.
- **403 domain_not_verified**: `EMAIL_FROM`'s domain isn't verified in Resend. Check the dashboard's Domains page.
- **Email goes to spam in Gmail**: DKIM/SPF are partially configured. Use https://www.mail-tester.com/ to score your delivery; aim for 9-10/10.
- **DKIM TXT record fails to parse**: your registrar may have wrapped the value mid-base64. Re-paste as a single unbroken string.
- **Local dev uses prod API key by accident**: double-check `.env` priority. Best practice: separate `BR360-dev` key.

---

## Related docs

- [Resend Documentation](https://resend.com/docs), provider docs.
- [React Email](https://react.email/), the template framework BR360 uses.
