"""Prevent account deletion from cascading into historical or financial records."""
from psycopg2 import sql


def has_linked_records(cursor, table, user_id, ignored_table=None):
    cursor.execute("""select ns.nspname as schema_name, rel.relname as table_name,
        att.attname as column_name, cardinality(c.conkey) as key_count
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = %s::regclass""", (table,))
    for reference in cursor.fetchall():
        if reference['schema_name'] == 'public' and reference['table_name'] == ignored_table:
            continue
        if reference['key_count'] != 1:
            return True  # Do not guess how a composite relationship should be removed.
        query = sql.SQL('select 1 from {}.{} where {} = %s limit 1').format(
            sql.Identifier(reference['schema_name']), sql.Identifier(reference['table_name']),
            sql.Identifier(reference['column_name']))
        cursor.execute(query, (user_id,))
        if cursor.fetchone():
            return True
    return False
