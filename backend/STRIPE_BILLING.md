# Stripe Billing demonstration setup

ScholarOne uses Stripe test-mode monthly MYR subscriptions. Checkout collects the billing address and test card details. Stripe Customer Portal manages payment methods, invoices, plan changes, and cancellation at the end of the paid period.

## Backend setup

From the repository root, install backend dependencies and apply the additive migration.

```sh
backend/venv/bin/python -m pip install -r backend/requirements.txt
backend/venv/bin/python backend/scripts/enable_stripe_billing.py
```

Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `FRONTEND_URL` to `backend/.env` using the names in `.env.example`. Use a Stripe sandbox/test secret key starting with `sk_test_`. Set `FRONTEND_URL` to your frontend origin, including its port. The integration rejects live-mode keys and live webhook events.

## Local webhook forwarding

Install the Stripe CLI and sign into your test account.

```sh
stripe login
stripe listen --events checkout.session.completed,invoice.paid,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:5001/api/billing/stripe/webhook
```

Copy the `whsec_` signing secret printed by `stripe listen` into `backend/.env`. Restart Flask after updating environment variables. Keep the CLI running during the demonstration.

For a hosted backend, register its HTTPS `/api/billing/stripe/webhook` URL in the Stripe Dashboard and use that endpoint's signing secret.

Subscribe the endpoint to these events.

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Demonstration

1. Sign in as an administrator-approved Sponsorship Provider.
2. Open Subscriptions and choose a paid plan. Review the monthly charge and continue to Stripe Checkout.
3. Use test card `4242 4242 4242 4242`, a future expiry date, any three-digit CVC, and billing details.
4. Return to ScholarOne. The provider dashboard and Subscriptions page show the plan, Stripe status, next billing date, renewal state, and invoice history. Refresh Billing reconciles the account directly with Stripe if delivery is delayed.
5. Open Manage Billing to change plans, update payment methods, download invoices, or cancel renewal. Plan changes use Stripe proration with immediate invoicing. Cancellation preserves the paid period until its end.
6. In Stripe's test Dashboard, inspect the customer, subscription, invoices, and webhook deliveries. Use Stripe test clocks with a test-clock customer to advance billing cycles for renewal/failure demonstrations. Standard subscriptions renew automatically each month.

Plan prices are read from ScholarOne's existing `subscription_plan` table. Paid plans must have `duration_month=1`. Stripe products and immutable monthly prices are created automatically in test mode. Updating a catalogue price creates a new price for subsequent purchases and portal changes. Existing subscriptions retain their Stripe price until changed through the portal.

Listing quotas activate only when canonical Stripe subscription status is active and its latest invoice is paid. Failed/incomplete/cancelled subscriptions use the free allowance. Database updates and invoice upserts are transactional, serialized per provider, and safe for duplicate or reordered deliveries. Billing periods end at the exact UTC timestamp. Historical manually activated subscriptions are preserved, and their matching plan can be purchased through Checkout to begin recurring billing.

Secret keys, full card numbers, and CVCs are excluded from frontend code and database records. Card details remain with Stripe. The application stores customer/subscription references and invoice/payment metadata.

Official references are [Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhooks](https://docs.stripe.com/webhooks), [Customer Portal](https://docs.stripe.com/customer-management), and [test cards](https://docs.stripe.com/testing).
