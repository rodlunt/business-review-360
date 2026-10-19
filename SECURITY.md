# Security Policy

Business Review 360 is **no longer maintained**. There is no hosted service, no support and no
commitment to fix reported problems. The code is published so you can clone it, run it and
extend it under the [MIT licence](LICENSE).

## If you find a vulnerability

Do not open a public issue for a security problem. If private vulnerability reporting is
enabled on this repository, use the Security tab. Otherwise, treat the finding as yours to fix
in your own fork. Reports are read when time allows, with no response time promised.

## If you deploy this code

You are responsible for the deployment. Before exposing it to the internet:

- Generate your own `JWT_SECRET`, database passwords and Stripe, Resend and reCAPTCHA keys.
  Nothing in this repository is a working credential, and the values in `.env.example` and
  `backend/.env.test` are placeholders for local development and tests only.
- Run `pnpm audit` and update dependencies. They are not being kept current here.
- Review the known limitations in the [README](README.md#known-limitations).
- Remove or change the seeded demo accounts in `db/seed-data.sql`, which use a published
  password.
- If you hold other people's personal information, you are responsible for the privacy and
  breach-notification obligations that apply in your jurisdiction.
