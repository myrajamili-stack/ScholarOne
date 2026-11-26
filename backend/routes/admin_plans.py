from contextlib import closing
from decimal import Decimal,InvalidOperation
import json
from flask import Blueprint,request,jsonify,g
from db import get_db_connection
from security import admin_access_required
from responses import error_response

admin_plans_bp=Blueprint('admin_plans',__name__,url_prefix='/api/admin/subscription-plans')


def validate_plan(data):
    if not isinstance(data,dict): raise ValueError('Send valid plan details.')
    try:
        if isinstance(data.get('price'),bool): raise ValueError
        price=Decimal(str(data.get('price')))
        if not price.is_finite() or not 0<=price<=Decimal('99999999.99') or price.as_tuple().exponent < -2: raise ValueError
    except (ValueError,InvalidOperation,TypeError): raise ValueError('Enter a valid price with at most two decimal places.') from None
    limit,duration=data.get('scholarship_limit'),data.get('duration_month')
    if type(limit) is not int or not 1<=limit<=1000000: raise ValueError('Listing allowance must be a whole number from 1 to 1,000,000.')
    if type(duration) is not int or not 1<=duration<=120: raise ValueError('Plan duration must be a whole number from 1 to 120 months.')
    if price>0 and duration!=1: raise ValueError('Paid Stripe plans must renew every month.')
    benefits=data.get('benefits')
    if not isinstance(benefits,list) or len(benefits)>20 or any(not isinstance(x,str) or not x.strip() or len(x.strip())>200 for x in benefits):
        raise ValueError('Use up to 20 benefits of 1-200 characters each.')
    return price,limit,duration,list(dict.fromkeys(x.strip() for x in benefits))


@admin_plans_bp.route('',methods=['POST'])
@admin_access_required
def create_plan():
    data=request.get_json(silent=True)
    try:
        price,limit,duration,benefits=validate_plan(data)
        name=data.get('plan_name')
        if not isinstance(name,str) or not 1<=len(name.strip())<=100: raise ValueError('Enter a plan name of 1-100 characters.')
        name=name.strip()
        if name.lower()=='free' or price==0: raise ValueError('Use the existing Free plan. New paid plans require a positive price.')
    except ValueError as error: return error_response(str(error),400)
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                cursor.execute('select pg_advisory_xact_lock(hashtext(%s))',('scholarone-plan:'+name.lower(),))
                cursor.execute('select plan_id from subscription_plan where lower(trim(plan_name))=lower(%s)',(name,))
                if cursor.fetchone(): return error_response('A plan with this name already exists.',409)
                cursor.execute('''insert into subscription_plan(plan_name,price,scholarship_limit,duration_month,benefits,is_active)
                    values (%s,%s,%s,%s,%s::jsonb,true) returning *''',(name,price,limit,duration,json.dumps(benefits)))
                plan=cursor.fetchone()
                cursor.execute('insert into audit_log(user_id,action,description) values (%s,%s,%s)',(g.admin_id,'create_subscription_plan',f"Plan {plan['plan_id']}"))
        return jsonify(plan=plan,message='Subscription plan created.'),201
    except Exception: return error_response('Unable to create this plan. No changes were saved.',503)


@admin_plans_bp.route('/<int:plan_id>/availability',methods=['PATCH'])
@admin_access_required
def plan_availability(plan_id):
    data=request.get_json(silent=True)
    if not isinstance(data,dict) or type(data.get('is_active')) is not bool: return error_response('Specify plan availability.',400)
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                cursor.execute('select plan_name from subscription_plan where plan_id=%s for update',(plan_id,))
                plan=cursor.fetchone()
                if not plan: return error_response('Plan not found.',404)
                if plan['plan_name'].lower()=='free' and not data['is_active']: return error_response('The Free fallback plan must remain available.',409)
                cursor.execute('update subscription_plan set is_active=%s where plan_id=%s returning *',(data['is_active'],plan_id))
                updated=cursor.fetchone()
                cursor.execute('insert into audit_log(user_id,action,description) values (%s,%s,%s)',(g.admin_id,'plan_availability',f"Plan {plan_id}; active={data['is_active']}"))
        return jsonify(plan=updated,message='Plan availability updated. Existing subscriptions and invoices are preserved.')
    except Exception: return error_response('Unable to change plan availability. No changes were saved.',503)
