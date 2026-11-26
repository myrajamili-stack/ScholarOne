"""Audit by default; --apply updates only Stripe-linked subscriptions from Stripe.

Legacy paid rows without a Stripe link are reported for review, never treated as
payment evidence and never silently deleted or reassigned.
"""
from pathlib import Path
from contextlib import closing
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from db import get_db_connection
from stripe_billing import stripe_client, sync_subscription


def reconcile(apply=False):
    with closing(get_db_connection()) as connection:
        with connection.cursor() as cursor:
            cursor.execute('''select sub.subscription_id,sub.sponsor_id,sub.stripe_subscription_id,
                sub.subscription_status,sp.price,s.stripe_customer_id
                from subscription sub join subscription_plan sp on sp.plan_id=sub.plan_id
                join sponsor s on s.sponsor_id=sub.sponsor_id where sp.price>0 order by sub.subscription_id''')
            rows=cursor.fetchall()
    print(f"Paid-plan records: {len(rows)}; Stripe-linked: {sum(bool(row['stripe_subscription_id']) for row in rows)}; legacy without Stripe evidence: {sum(not bool(row['stripe_subscription_id']) for row in rows)}.",flush=True)
    print(f"Active legacy records requiring evidence: {sum(row['subscription_status']=='active' and not row['stripe_subscription_id'] for row in rows)}.",flush=True)
    for row in rows:
        if not row['stripe_subscription_id']:
            print(f"Local subscription {row['subscription_id']} (provider {row['sponsor_id']}): {row['subscription_status']}, no Stripe subscription ID; requires payment-evidence review.",flush=True)
    client=stripe_client()
    client.v1.balance.retrieve()  # Read-only API-key verification; never print credentials.
    print('Stripe test API authentication verified.',flush=True)
    for row in rows:
        identity=f"Local subscription {row['subscription_id']} (provider {row['sponsor_id']})"
        if not row['stripe_subscription_id']:
            print(f'{identity}: legacy paid-plan record without Stripe subscription ID; manual evidence review required.',flush=True)
            continue
        try:
            remote=client.v1.subscriptions.retrieve(row['stripe_subscription_id'])
            customer=remote.get('customer')
            if remote.get('livemode') or customer!=row['stripe_customer_id']:
                print(f'{identity}: account/customer mismatch; no changes made.',flush=True); continue
            if apply:
                with closing(get_db_connection()) as connection,connection:
                    with connection.cursor() as cursor: sync_subscription(cursor,client,remote['id'])
            print(f"{identity}: Stripe status {remote['status']}; {'reconciled' if apply else 'audited without changes'}.",flush=True)
        except Exception as error:
            print(f'{identity}: verification failed ({type(error).__name__}); no changes committed.',flush=True)
    print(f'Inspected {len(rows)} paid-plan records.',flush=True)


if __name__=='__main__':
    if sys.argv[1:] not in ([],['--audit'],['--apply']): raise SystemExit('Use --audit or --apply.')
    try: reconcile('--apply' in sys.argv)
    except Exception as error: raise SystemExit(f'Billing verification unavailable ({type(error).__name__}); no unverified records changed.')
