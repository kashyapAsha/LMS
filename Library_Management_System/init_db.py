import os
import pymysql
from config import Config

def initialize_database():
    """Reads schema.sql and runs it against the local MySQL instance."""
    print("=" * 60)
    print("Initializing Library Management System (Library_Management_System)")
    print(f"Connecting to MySQL Host: {Config.DB_HOST}:{Config.DB_PORT} as User: {Config.DB_USER}")
    print("=" * 60)
    
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    if not os.path.exists(schema_path):
        print(f"Error: Schema file not found at {schema_path}")
        return False
    
    with open(schema_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    # Connect to MySQL Server without specifying DB first (to create DB if needed)
    try:
        conn = pymysql.connect(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            charset='utf8mb4',
            client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS,
            autocommit=True
        )
        print("Connected to MySQL Server successfully.")
        
        with conn.cursor() as cursor:
            # Execute SQL script statements
            for statement in sql_content.split(';'):
                stmt = statement.strip()
                if stmt:
                    try:
                        cursor.execute(stmt)
                    except Exception as stmt_err:
                        # Continue if warning or duplicate
                        print(f"Notice on statement: {stmt[:40]}... -> {stmt_err}")
                        
        conn.close()
        print("\nDatabase 'library_management_system' initialized and seeded successfully!")
        print("=" * 60)
        return True
    except Exception as e:
        print(f"\nFailed to initialize MySQL database: {e}")
        print("Please check your MySQL server status and credentials in config.py")
        print("=" * 60)
        return False

if __name__ == '__main__':
    initialize_database()
