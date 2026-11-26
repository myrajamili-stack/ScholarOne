"""Shared PostgreSQL predicate for an entitled subscription and its plan."""

ACTIVE_ENTITLEMENT = """lower(sub.subscription_status) = 'active'
    and (
        (sub.stripe_subscription_id is null and sp.price = 0
         and (sub.start_date is null or sub.start_date <= (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date)
         and (sub.end_date is null or sub.end_date >= (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date))
        or
        (sub.stripe_subscription_id is not null and sub.stripe_status = 'active' and sub.payment_status = 'paid'
         and sub.start_date <= (statement_timestamp() at time zone 'UTC')
         and sub.end_date > (statement_timestamp() at time zone 'UTC'))
    )"""
