ALTER TABLE sponsor ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
ALTER TABLE sponsor ADD COLUMN IF NOT EXISTS stripe_checkout_id text;
ALTER TABLE subscription_plan ADD COLUMN IF NOT EXISTS stripe_product_id text;
ALTER TABLE subscription_plan ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS stripe_status text;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS billing_amount numeric(12,2);
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS billing_currency text DEFAULT 'myr';
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE TABLE IF NOT EXISTS subscription_payment (
    payment_id bigserial PRIMARY KEY,
    sponsor_id bigint NOT NULL REFERENCES sponsor(sponsor_id) ON DELETE CASCADE,
    subscription_id bigint REFERENCES subscription(subscription_id) ON DELETE SET NULL,
    stripe_invoice_id text NOT NULL UNIQUE,
    stripe_payment_intent_id text,
    invoice_number text,
    plan_name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text NOT NULL DEFAULT 'myr',
    payment_status text NOT NULL,
    invoice_url text,
    invoice_pdf text,
    created_at timestamptz NOT NULL,
    paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS subscription_payment_provider_date ON subscription_payment(sponsor_id, created_at DESC);
-- Records are accessed by Flask using DATABASE_URL. Browser clients use authenticated API routes.
ALTER TABLE subscription_payment ENABLE ROW LEVEL SECURITY;
