import pymysql
import pymysql.cursors
from datetime import date, datetime
from config import Config

def get_db_connection(use_db=True):
    """Establish and return a PyMySQL database connection."""
    params = {
        'host': Config.DB_HOST,
        'port': Config.DB_PORT,
        'user': Config.DB_USER,
        'password': Config.DB_PASSWORD,
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor,
        'autocommit': True
    }
    if use_db:
        params['database'] = Config.DB_NAME
    
    return pymysql.connect(**params)

def query_db(query, args=(), one=False):
    """Execute a query and fetch dictionary records."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, args)
            rv = cursor.fetchall()
            return (rv[0] if rv else None) if one else rv
    finally:
        conn.close()

def execute_db(query, args=()):
    """Execute an UPDATE / DELETE / INSERT command and return affected rows."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            affected = cursor.execute(query, args)
            return affected
    finally:
        conn.close()

def insert_db(query, args=()):
    """Execute an INSERT command and return the last insert ID."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, args)
            return cursor.lastrowid
    finally:
        conn.close()

def log_activity(action_type, description, entity_type=None, entity_id=None):
    """Record an audit trail activity log."""
    try:
        query = """
            INSERT INTO activity_logs (action_type, description, entity_type, entity_id, created_at)
            VALUES (%s, %s, %s, %s, NOW())
        """
        execute_db(query, (action_type, description, entity_type, entity_id))
    except Exception as e:
        print(f"[ActivityLog Error]: {e}")

def sync_overdue_loans_and_fines():
    """Automatically identify overdue loans and sync/generate unpaid fines."""
    try:
        today = date.today()
        # 1. Update loans that have passed due date and are still marked 'ISSUED'
        overdue_loans = query_db("""
            SELECT id, member_id, due_date, DATEDIFF(%s, due_date) AS days_late
            FROM loans
            WHERE status IN ('ISSUED', 'OVERDUE') AND due_date < %s AND return_date IS NULL
        """, (today, today))
        
        for loan in overdue_loans:
            loan_id = loan['id']
            member_id = loan['member_id']
            days_late = max(0, loan['days_late'])
            fine_amount = days_late * Config.FINE_PER_DAY
            
            # Update loan status to OVERDUE
            execute_db("UPDATE loans SET status = 'OVERDUE' WHERE id = %s", (loan_id,))
            
            # Check if fine record exists
            existing_fine = query_db("SELECT id, status, amount FROM fines WHERE loan_id = %s", (loan_id,), one=True)
            if existing_fine:
                if existing_fine['status'] == 'UNPAID':
                    execute_db("""
                        UPDATE fines 
                        SET amount = %s, days_overdue = %s, notes = CONCAT(%s, ' days overdue')
                        WHERE id = %s
                    """, (fine_amount, days_late, days_late, existing_fine['id']))
            else:
                if fine_amount > 0:
                    insert_db("""
                        INSERT INTO fines (loan_id, member_id, amount, fine_rate_per_day, days_overdue, status, notes)
                        VALUES (%s, %s, %s, %s, %s, 'UNPAID', %s)
                    """, (loan_id, member_id, fine_amount, Config.FINE_PER_DAY, days_late, f"{days_late} days overdue"))
    except Exception as e:
        print(f"[SyncOverdue Error]: {e}")
