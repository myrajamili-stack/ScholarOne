"""Read recorded invoice data, never infer payment from a plan or active flag."""


def payment_report(cursor, period, params):
    cursor.execute("""select currency,coalesce(sum(amount),0) as amount,count(*) as invoice_count
        from subscription_payment where payment_status='paid' and paid_at is not null and """+
        period('paid_at')+' group by currency order by currency',params)
    revenue=cursor.fetchall()
    cursor.execute("select payment_status as label,count(*) as count from subscription_payment where "+
        period('created_at')+' group by payment_status order by payment_status',params)
    statuses=cursor.fetchall()
    cursor.execute("""select to_char(paid_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM') as month,
        currency,sum(amount) as amount from subscription_payment
        where payment_status='paid' and paid_at is not null and """+
        period('paid_at')+' group by month,currency order by month,currency',params)
    trend=cursor.fetchall()
    cursor.execute("""select count(*) as legacy_paid_records,
        count(*) filter(where sub.subscription_status='active') as marked_active_legacy_records
        from subscription sub join subscription_plan p on p.plan_id=sub.plan_id
        where p.price>0 and sub.stripe_subscription_id is null""")
    legacy=cursor.fetchone()
    return {'revenue_by_currency':revenue,'payment_statuses':statuses,'payment_trend':trend,
            'legacy_paid_records':legacy['legacy_paid_records'],
            'marked_active_legacy_records':legacy['marked_active_legacy_records']}
