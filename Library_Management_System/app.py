import os
import csv
import io
import datetime
from datetime import date, timedelta
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from config import Config
from database import (
    get_db_connection, query_db, execute_db, insert_db, 
    log_activity, sync_overdue_loans_and_fines
)

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config.from_object(Config)
CORS(app)

# Helper to serialize date/datetime in dicts
def serialize_row(row):
    if not row:
        return row
    result = dict(row)
    for k, v in result.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            result[k] = v.isoformat()
        elif hasattr(v, '__float__') and not isinstance(v, (int, float)):
            result[k] = float(v)
    return result

def serialize_rows(rows):
    return [serialize_row(r) for r in rows] if rows else []

# Request hook to sync overdues on access
@app.before_request
def before_request():
    if request.path.startswith('/api/'):
        # Periodically keep overdue status and fine ledger in sync
        sync_overdue_loans_and_fines()

# -------------------------------------------------------------
# Web Page Routes (Landing Page & SPA)
# -------------------------------------------------------------
@app.route('/')
@app.route('/login')
def landing():
    return render_template('login.html')

@app.route('/dashboard')
@app.route('/app')
def dashboard():
    return render_template('index.html')

# -------------------------------------------------------------
# Authentication API
# -------------------------------------------------------------
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json() or {}
        username = str(data.get('username', '')).strip()
        password = str(data.get('password', ''))
        
        # Validate against demo credentials
        if username == 'test_1' and password == '123456':
            log_activity('USER_LOGIN', f"User '{username}' logged in successfully", 'AUTH', None)
            return jsonify({
                'success': True,
                'message': 'Authentication successful',
                'user': {
                    'username': 'test_1',
                    'role': 'Administrator',
                    'name': 'IRIEEN Library Admin'
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid username or password.'
            }), 401
    except Exception as e:
        return jsonify({'success': False, 'error': 'Invalid username or password.'}), 400

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    try:
        return jsonify({'success': True, 'message': 'Logged out successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 1. Dashboard & Analytics APIs
# -------------------------------------------------------------
@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    try:
        # Books metrics
        book_stats = query_db("""
            SELECT 
                COUNT(*) AS total_unique_books,
                COALESCE(SUM(total_copies), 0) AS total_copies,
                COALESCE(SUM(available_copies), 0) AS available_copies,
                (COALESCE(SUM(total_copies), 0) - COALESCE(SUM(available_copies), 0)) AS issued_copies
            FROM books
        """, one=True)
        
        # Members metrics
        member_stats = query_db("""
            SELECT 
                COUNT(*) AS total_members,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_members
            FROM members
        """, one=True)
        
        # Loans metrics
        loan_stats = query_db("""
            SELECT 
                COUNT(*) AS total_loans,
                SUM(CASE WHEN status IN ('ISSUED', 'OVERDUE') THEN 1 ELSE 0 END) AS active_loans,
                SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) AS overdue_loans,
                SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) AS returned_loans
            FROM loans
        """, one=True)
        
        # Fines metrics
        fine_stats = query_db("""
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'UNPAID' THEN amount ELSE 0 END), 0) AS total_unpaid_fines,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN paid_amount ELSE 0 END), 0) AS total_collected_fines
            FROM fines
        """, one=True)
        
        # Recent activities
        activities = query_db("""
            SELECT id, action_type, description, entity_type, entity_id, created_at 
            FROM activity_logs 
            ORDER BY created_at DESC 
            LIMIT 10
        """)
        
        # Overdue alerts
        overdue_list = query_db("""
            SELECT l.id, l.loan_code, l.due_date, l.status,
                   b.title AS book_title, b.cover_color,
                   m.full_name AS member_name, m.email AS member_email, m.phone AS member_phone,
                   DATEDIFF(CURDATE(), l.due_date) AS days_overdue,
                   COALESCE(f.amount, DATEDIFF(CURDATE(), l.due_date) * 1.0) AS fine_amount
            FROM loans l
            JOIN books b ON l.book_id = b.id
            JOIN members m ON l.member_id = m.id
            LEFT JOIN fines f ON f.loan_id = l.id
            WHERE l.status = 'OVERDUE'
            ORDER BY l.due_date ASC
            LIMIT 5
        """)

        return jsonify({
            'success': True,
            'data': {
                'books': serialize_row(book_stats),
                'members': serialize_row(member_stats),
                'loans': serialize_row(loan_stats),
                'fines': serialize_row(fine_stats),
                'recent_activities': serialize_rows(activities),
                'critical_overdue': serialize_rows(overdue_list)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/dashboard/charts', methods=['GET'])
def get_dashboard_charts():
    try:
        # Category breakdown with book & loan counts
        category_data = query_db("""
            SELECT c.id, c.name, c.color, c.icon,
                   COUNT(b.id) AS book_count,
                   COALESCE(SUM(b.total_copies), 0) AS total_copies,
                   COALESCE(SUM(b.total_copies - b.available_copies), 0) AS borrowed_copies
            FROM categories c
            LEFT JOIN books b ON b.category_id = c.id
            GROUP BY c.id, c.name, c.color, c.icon
            ORDER BY book_count DESC
        """)
        
        # Monthly circulation trends (last 6 months)
        trends = query_db("""
            SELECT 
                DATE_FORMAT(issue_date, '%%b %%Y') AS month_label,
                DATE_FORMAT(issue_date, '%%Y-%%m') AS month_key,
                COUNT(*) AS total_issued,
                SUM(CASE WHEN return_date IS NOT NULL THEN 1 ELSE 0 END) AS total_returned
            FROM loans
            WHERE issue_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY month_key, month_label
            ORDER BY month_key ASC
        """)
        
        return jsonify({
            'success': True,
            'categories': serialize_rows(category_data),
            'monthly_trends': serialize_rows(trends)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 2. Books APIs
# -------------------------------------------------------------
@app.route('/api/books', methods=['GET'])
def get_books():
    try:
        search = request.args.get('search', '').strip()
        category_id = request.args.get('category_id', '')
        availability = request.args.get('availability', 'all')
        sort_by = request.args.get('sort_by', 'newest')
        
        query = """
            SELECT b.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   (b.total_copies - b.available_copies) AS borrowed_copies
            FROM books b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        """
        params = []
        
        if search:
            query += " AND (b.title LIKE %s OR b.author LIKE %s OR b.isbn LIKE %s OR b.publisher LIKE %s)"
            pattern = f"%{search}%"
            params.extend([pattern, pattern, pattern, pattern])
            
        if category_id and category_id.isdigit():
            query += " AND b.category_id = %s"
            params.append(int(category_id))
            
        if availability == 'available':
            query += " AND b.available_copies > 0"
        elif availability == 'unavailable':
            query += " AND b.available_copies = 0"
            
        if sort_by == 'title_asc':
            query += " ORDER BY b.title ASC"
        elif sort_by == 'author_asc':
            query += " ORDER BY b.author ASC"
        elif sort_by == 'copies_desc':
            query += " ORDER BY b.total_copies DESC"
        elif sort_by == 'available_desc':
            query += " ORDER BY b.available_copies DESC"
        else:
            query += " ORDER BY b.id DESC"
            
        books = query_db(query, params)
        return jsonify({'success': True, 'count': len(books), 'data': serialize_rows(books)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['GET'])
def get_book_details(book_id):
    try:
        book = query_db("""
            SELECT b.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
            FROM books b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.id = %s
        """, (book_id,), one=True)
        
        if not book:
            return jsonify({'success': False, 'error': 'Book not found'}), 404
            
        # Recent borrowing history of this book
        history = query_db("""
            SELECT l.*, m.full_name AS member_name, m.member_code, m.email
            FROM loans l
            JOIN members m ON l.member_id = m.id
            WHERE l.book_id = %s
            ORDER BY l.issue_date DESC
            LIMIT 10
        """, (book_id,))
        
        return jsonify({
            'success': True,
            'data': serialize_row(book),
            'history': serialize_rows(history)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/books', methods=['POST'])
def add_book():
    try:
        data = request.json or {}
        isbn = data.get('isbn', '').strip()
        title = data.get('title', '').strip()
        author = data.get('author', '').strip()
        category_id = data.get('category_id') or None
        publisher = data.get('publisher', '').strip() or None
        publication_year = data.get('publication_year') or None
        total_copies = int(data.get('total_copies', 1))
        shelf_location = data.get('shelf_location', 'Section A').strip()
        description = data.get('description', '').strip() or None
        cover_color = data.get('cover_color', '#6366f1')
        
        if not isbn or not title or not author:
            return jsonify({'success': False, 'error': 'ISBN, Title, and Author are required fields.'}), 400
            
        # Check duplicate ISBN
        existing = query_db("SELECT id FROM books WHERE isbn = %s", (isbn,), one=True)
        if existing:
            return jsonify({'success': False, 'error': f'A book with ISBN {isbn} already exists.'}), 400
            
        new_id = insert_db("""
            INSERT INTO books (isbn, title, author, category_id, publisher, publication_year, 
                               total_copies, available_copies, shelf_location, description, cover_color)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (isbn, title, author, category_id, publisher, publication_year, 
              total_copies, total_copies, shelf_location, description, cover_color))
              
        log_activity('BOOK_ADDED', f'Added new book "{title}" by {author} (ISBN: {isbn})', 'BOOK', new_id)
        
        return jsonify({'success': True, 'message': 'Book added successfully!', 'book_id': new_id}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['PUT'])
def update_book(book_id):
    try:
        data = request.json or {}
        existing = query_db("SELECT * FROM books WHERE id = %s", (book_id,), one=True)
        if not existing:
            return jsonify({'success': False, 'error': 'Book not found'}), 404
            
        isbn = data.get('isbn', existing['isbn']).strip()
        title = data.get('title', existing['title']).strip()
        author = data.get('author', existing['author']).strip()
        category_id = data.get('category_id', existing['category_id']) or None
        publisher = data.get('publisher', existing['publisher'])
        publication_year = data.get('publication_year', existing['publication_year']) or None
        new_total_copies = int(data.get('total_copies', existing['total_copies']))
        shelf_location = data.get('shelf_location', existing['shelf_location']).strip()
        description = data.get('description', existing['description'])
        cover_color = data.get('cover_color', existing['cover_color'])
        
        # Active loans count for this book
        active_loans = query_db("""
            SELECT COUNT(*) AS count FROM loans WHERE book_id = %s AND status IN ('ISSUED', 'OVERDUE')
        """, (book_id,), one=True)['count']
        
        if new_total_copies < active_loans:
            return jsonify({
                'success': False, 
                'error': f'Cannot reduce total copies to {new_total_copies} because {active_loans} copies are currently borrowed.'
            }), 400
            
        new_available_copies = new_total_copies - active_loans
        
        execute_db("""
            UPDATE books SET 
                isbn = %s, title = %s, author = %s, category_id = %s, publisher = %s,
                publication_year = %s, total_copies = %s, available_copies = %s,
                shelf_location = %s, description = %s, cover_color = %s
            WHERE id = %s
        """, (isbn, title, author, category_id, publisher, publication_year,
              new_total_copies, new_available_copies, shelf_location, description, cover_color, book_id))
              
        log_activity('BOOK_UPDATED', f'Updated book details for "{title}"', 'BOOK', book_id)
        
        return jsonify({'success': True, 'message': 'Book details updated successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    try:
        existing = query_db("SELECT title FROM books WHERE id = %s", (book_id,), one=True)
        if not existing:
            return jsonify({'success': False, 'error': 'Book not found'}), 404
            
        active_loans = query_db("""
            SELECT COUNT(*) AS count FROM loans WHERE book_id = %s AND status IN ('ISSUED', 'OVERDUE')
        """, (book_id,), one=True)['count']
        
        if active_loans > 0:
            return jsonify({
                'success': False, 
                'error': f'Cannot delete book. There are currently {active_loans} active borrowings.'
            }), 400
            
        execute_db("DELETE FROM fines WHERE loan_id IN (SELECT id FROM loans WHERE book_id = %s)", (book_id,))
        execute_db("DELETE FROM loans WHERE book_id = %s", (book_id,))
        execute_db("DELETE FROM books WHERE id = %s", (book_id,))
        log_activity('BOOK_DELETED', f'Deleted book: {existing["title"]}', 'BOOK', book_id)
        return jsonify({'success': True, 'message': 'Book deleted successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/categories', methods=['GET', 'POST'])
def manage_categories():
    if request.method == 'GET':
        try:
            cats = query_db("""
                SELECT c.*, COUNT(b.id) AS book_count, COALESCE(SUM(b.total_copies), 0) AS total_copies
                FROM categories c
                LEFT JOIN books b ON b.category_id = c.id
                GROUP BY c.id, c.name, c.description, c.icon, c.color
                ORDER BY c.name ASC
            """)
            return jsonify({'success': True, 'data': serialize_rows(cats)})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    else:
        try:
            data = request.json or {}
            name = data.get('name', '').strip()
            description = data.get('description', '').strip()
            icon = data.get('icon', 'book').strip()
            color = data.get('color', '#6366f1').strip()
            
            if not name:
                return jsonify({'success': False, 'error': 'Category name is required'}), 400
                
            new_id = insert_db("""
                INSERT INTO categories (name, description, icon, color)
                VALUES (%s, %s, %s, %s)
            """, (name, description, icon, color))
            
            log_activity('CATEGORY_CREATED', f'Created category "{name}"', 'CATEGORY', new_id)
            return jsonify({'success': True, 'message': 'Category created', 'id': new_id}), 201
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 3. Members APIs
# -------------------------------------------------------------
@app.route('/api/members', methods=['GET'])
def get_members():
    try:
        search = request.args.get('search', '').strip()
        membership_type = request.args.get('membership_type', '')
        status = request.args.get('status', '')
        
        query = """
            SELECT m.*,
                   COUNT(CASE WHEN l.status IN ('ISSUED', 'OVERDUE') THEN 1 END) AS active_loans_count,
                   COUNT(CASE WHEN l.status = 'OVERDUE' THEN 1 END) AS overdue_loans_count,
                   COALESCE(SUM(CASE WHEN f.status = 'UNPAID' THEN f.amount ELSE 0 END), 0) AS unpaid_fines_total
            FROM members m
            LEFT JOIN loans l ON l.member_id = m.id
            LEFT JOIN fines f ON f.member_id = m.id
            WHERE 1=1
        """
        params = []
        
        if search:
            query += " AND (m.full_name LIKE %s OR m.member_code LIKE %s OR m.email LIKE %s OR m.phone LIKE %s)"
            pattern = f"%{search}%"
            params.extend([pattern, pattern, pattern, pattern])
            
        if membership_type:
            query += " AND m.membership_type = %s"
            params.append(membership_type)
            
        if status:
            query += " AND m.status = %s"
            params.append(status)
            
        query += " GROUP BY m.id ORDER BY m.id DESC"
        members = query_db(query, params)
        return jsonify({'success': True, 'count': len(members), 'data': serialize_rows(members)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/members/<int:member_id>', methods=['GET'])
def get_member_profile(member_id):
    try:
        member = query_db("SELECT * FROM members WHERE id = %s", (member_id,), one=True)
        if not member:
            return jsonify({'success': False, 'error': 'Member not found'}), 404
            
        # Active & recent borrowings
        loans = query_db("""
            SELECT l.*, b.title AS book_title, b.isbn, b.cover_color, b.author
            FROM loans l
            JOIN books b ON l.book_id = b.id
            WHERE l.member_id = %s
            ORDER BY l.issue_date DESC
        """, (member_id,))
        
        # Fines ledger
        fines = query_db("""
            SELECT f.*, b.title AS book_title, l.loan_code
            FROM fines f
            JOIN loans l ON f.loan_id = l.id
            JOIN books b ON l.book_id = b.id
            WHERE f.member_id = %s
            ORDER BY f.created_at DESC
        """, (member_id,))
        
        return jsonify({
            'success': True,
            'data': serialize_row(member),
            'loans': serialize_rows(loans),
            'fines': serialize_rows(fines)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/members', methods=['POST'])
def register_member():
    try:
        data = request.json or {}
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip()
        phone = data.get('phone', '').strip()
        address = data.get('address', '').strip() or None
        membership_type = data.get('membership_type', 'Student')
        
        type_limits = {'Student': 5, 'Faculty': 10, 'Premium': 8, 'Standard': 3}
        max_books = int(data.get('max_books_allowed', type_limits.get(membership_type, 3)))
        status = data.get('status', 'Active')
        
        if not full_name or not email or not phone:
            return jsonify({'success': False, 'error': 'Name, email, and phone are required fields.'}), 400
            
        # Check duplicate email
        if query_db("SELECT id FROM members WHERE email = %s", (email,), one=True):
            return jsonify({'success': False, 'error': f'Member with email {email} already exists.'}), 400
            
        # Generate member code
        last_id = query_db("SELECT COALESCE(MAX(id), 0) + 1001 AS next_seq FROM members", one=True)['next_seq']
        member_code = f"LIB-M{last_id}"
        
        today = date.today()
        expiry = today + timedelta(days=365) # 1 year validity default
        
        new_id = insert_db("""
            INSERT INTO members (member_code, full_name, email, phone, address, membership_type, 
                                 max_books_allowed, status, joined_date, expiry_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (member_code, full_name, email, phone, address, membership_type,
              max_books, status, today, expiry))
              
        log_activity('MEMBER_REGISTERED', f'Registered {membership_type} member: {full_name} ({member_code})', 'MEMBER', new_id)
        
        return jsonify({
            'success': True, 
            'message': 'Member registered successfully!', 
            'member_id': new_id, 
            'member_code': member_code
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/members/<int:member_id>', methods=['PUT'])
def update_member(member_id):
    try:
        data = request.json or {}
        existing = query_db("SELECT * FROM members WHERE id = %s", (member_id,), one=True)
        if not existing:
            return jsonify({'success': False, 'error': 'Member not found'}), 404
            
        full_name = data.get('full_name', existing['full_name']).strip()
        email = data.get('email', existing['email']).strip()
        phone = data.get('phone', existing['phone']).strip()
        address = data.get('address', existing['address'])
        membership_type = data.get('membership_type', existing['membership_type'])
        max_books_allowed = int(data.get('max_books_allowed', existing['max_books_allowed']))
        status = data.get('status', existing['status'])
        
        execute_db("""
            UPDATE members SET 
                full_name = %s, email = %s, phone = %s, address = %s,
                membership_type = %s, max_books_allowed = %s, status = %s
            WHERE id = %s
        """, (full_name, email, phone, address, membership_type, max_books_allowed, status, member_id))
        
        log_activity('MEMBER_UPDATED', f'Updated profile for {full_name} ({existing["member_code"]})', 'MEMBER', member_id)
        return jsonify({'success': True, 'message': 'Member updated successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/members/<int:member_id>', methods=['DELETE'])
def delete_member(member_id):
    try:
        existing = query_db("SELECT full_name, member_code FROM members WHERE id = %s", (member_id,), one=True)
        if not existing:
            return jsonify({'success': False, 'error': 'Member not found'}), 404
            
        active_loans = query_db("""
            SELECT COUNT(*) AS count FROM loans WHERE member_id = %s AND status IN ('ISSUED', 'OVERDUE')
        """, (member_id,), one=True)['count']
        
        if active_loans > 0:
            return jsonify({
                'success': False,
                'error': f'Cannot delete member. Member currently has {active_loans} unreturned books.'
            }), 400
            
        unpaid_fines = query_db("""
            SELECT COUNT(*) AS count FROM fines WHERE member_id = %s AND status = 'UNPAID'
        """, (member_id,), one=True)['count']
        
        if unpaid_fines > 0:
            return jsonify({
                'success': False,
                'error': f'Cannot delete member. Member has {unpaid_fines} unpaid fine records.'
            }), 400
            
        execute_db("DELETE FROM fines WHERE member_id = %s", (member_id,))
        execute_db("DELETE FROM loans WHERE member_id = %s", (member_id,))
        execute_db("DELETE FROM members WHERE id = %s", (member_id,))
        log_activity('MEMBER_DELETED', f'Deleted member: {existing["full_name"]} ({existing["member_code"]})', 'MEMBER', member_id)
        return jsonify({'success': True, 'message': 'Member removed successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 4. Loans (Circulation) APIs
# -------------------------------------------------------------
@app.route('/api/loans', methods=['GET'])
def get_loans():
    try:
        status_filter = request.args.get('status', 'ALL').upper()
        search = request.args.get('search', '').strip()
        
        query = """
            SELECT l.*, 
                   b.title AS book_title, b.isbn, b.author, b.cover_color,
                   m.full_name AS member_name, m.member_code, m.email AS member_email, m.phone AS member_phone,
                   DATEDIFF(COALESCE(l.return_date, CURDATE()), l.due_date) AS days_difference,
                   f.id AS fine_id, f.amount AS fine_amount, f.status AS fine_status
            FROM loans l
            JOIN books b ON l.book_id = b.id
            JOIN members m ON l.member_id = m.id
            LEFT JOIN fines f ON f.loan_id = l.id
            WHERE 1=1
        """
        params = []
        
        if status_filter in ('ISSUED', 'OVERDUE', 'RETURNED', 'LOST'):
            query += " AND l.status = %s"
            params.append(status_filter)
        elif status_filter == 'ACTIVE':
            query += " AND l.status IN ('ISSUED', 'OVERDUE')"
            
        if search:
            query += " AND (b.title LIKE %s OR b.isbn LIKE %s OR m.full_name LIKE %s OR m.member_code LIKE %s OR l.loan_code LIKE %s)"
            pattern = f"%{search}%"
            params.extend([pattern, pattern, pattern, pattern, pattern])
            
        query += " ORDER BY l.id DESC"
        loans = query_db(query, params)
        return jsonify({'success': True, 'count': len(loans), 'data': serialize_rows(loans)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/loans/issue', methods=['POST'])
def issue_book():
    try:
        data = request.json or {}
        book_id = int(data.get('book_id', 0))
        member_id = int(data.get('member_id', 0))
        loan_days = int(data.get('loan_days', Config.DEFAULT_LOAN_DAYS))
        notes = data.get('notes', '').strip() or None
        
        if not book_id or not member_id:
            return jsonify({'success': False, 'error': 'Book and Member selection are required.'}), 400
            
        # 1. Validate Book
        book = query_db("SELECT * FROM books WHERE id = %s", (book_id,), one=True)
        if not book:
            return jsonify({'success': False, 'error': 'Selected book does not exist.'}), 404
        if book['available_copies'] <= 0:
            return jsonify({'success': False, 'error': f'No copies of "{book["title"]}" are currently available for issue.'}), 400
            
        # 2. Validate Member
        member = query_db("SELECT * FROM members WHERE id = %s", (member_id,), one=True)
        if not member:
            return jsonify({'success': False, 'error': 'Selected member does not exist.'}), 404
        if member['status'] != 'Active':
            return jsonify({'success': False, 'error': f'Member account is {member["status"]}. Cannot issue books.'}), 400
            
        # 3. Check loan limit
        active_loans_count = query_db("""
            SELECT COUNT(*) AS count FROM loans WHERE member_id = %s AND status IN ('ISSUED', 'OVERDUE')
        """, (member_id,), one=True)['count']
        
        if active_loans_count >= member['max_books_allowed']:
            return jsonify({
                'success': False, 
                'error': f'Member has reached their limit of {member["max_books_allowed"]} active loans.'
            }), 400
            
        # 4. Check if member already has an active copy of this exact book
        already_has = query_db("""
            SELECT id FROM loans WHERE member_id = %s AND book_id = %s AND status IN ('ISSUED', 'OVERDUE')
        """, (member_id, book_id), one=True)
        if already_has:
            return jsonify({'success': False, 'error': f'Member currently already has an active copy of "{book["title"]}".'}), 400
            
        # Issue Book
        issue_date = date.today()
        due_date = issue_date + timedelta(days=loan_days)
        next_seq_row = query_db("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM loans", one=True)
        next_seq = next_seq_row['next_id'] if next_seq_row else 1
        loan_code = f"LN-{datetime.datetime.now().strftime('%Y%m%d')}-{next_seq:04d}"
        
        loan_id = insert_db("""
            INSERT INTO loans (loan_code, book_id, member_id, issue_date, due_date, status, renew_count, notes)
            VALUES (%s, %s, %s, %s, %s, 'ISSUED', 0, %s)
        """, (loan_code, book_id, member_id, issue_date, due_date, notes))
        
        # Decrement available copies
        execute_db("UPDATE books SET available_copies = available_copies - 1 WHERE id = %s", (book_id,))
        
        log_activity('BOOK_ISSUED', f'Issued "{book["title"]}" to {member["full_name"]} (Due: {due_date.strftime("%b %d, %Y")})', 'LOAN', loan_id)
        
        return jsonify({
            'success': True,
            'message': f'Book successfully issued! Due date is {due_date.strftime("%b %d, %Y")}.',
            'loan_id': loan_id,
            'loan_code': loan_code
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/loans/<int:loan_id>/return', methods=['POST'])
def return_book(loan_id):
    try:
        data = request.json or {}
        return_notes = data.get('notes', '').strip()
        
        loan = query_db("""
            SELECT l.*, b.title AS book_title, m.full_name AS member_name
            FROM loans l
            JOIN books b ON l.book_id = b.id
            JOIN members m ON l.member_id = m.id
            WHERE l.id = %s
        """, (loan_id,), one=True)
        
        if not loan:
            return jsonify({'success': False, 'error': 'Loan record not found'}), 404
        if loan['status'] == 'RETURNED':
            return jsonify({'success': False, 'error': 'This book has already been marked as returned.'}), 400
            
        today = date.today()
        due_date = loan['due_date']
        
        # Overdue calculation
        days_late = max(0, (today - due_date).days)
        fine_amount = days_late * Config.FINE_PER_DAY
        
        # Mark loan returned
        execute_db("""
            UPDATE loans 
            SET status = 'RETURNED', return_date = %s, notes = CONCAT(COALESCE(notes, ''), ' | Returned on ', %s)
            WHERE id = %s
        """, (today, today.isoformat(), loan_id))
        
        # Increment available copies
        execute_db("UPDATE books SET available_copies = available_copies + 1 WHERE id = %s", (loan['book_id'],))
        
        fine_message = ""
        if days_late > 0 and fine_amount > 0:
            # Check or create fine
            existing_fine = query_db("SELECT id FROM fines WHERE loan_id = %s", (loan_id,), one=True)
            if existing_fine:
                execute_db("""
                    UPDATE fines SET amount = %s, days_overdue = %s, notes = %s WHERE id = %s
                """, (fine_amount, days_late, f"{days_late} days overdue at return", existing_fine['id']))
            else:
                insert_db("""
                    INSERT INTO fines (loan_id, member_id, amount, fine_rate_per_day, days_overdue, status, notes)
                    VALUES (%s, %s, %s, %s, %s, 'UNPAID', %s)
                """, (loan_id, loan['member_id'], fine_amount, Config.FINE_PER_DAY, days_late, f"{days_late} days overdue at return"))
                
            fine_message = f" (Overdue by {days_late} days. Fine of ${fine_amount:.2f} recorded)"
            
        log_activity('BOOK_RETURNED', f'Returned "{loan["book_title"]}" by {loan["member_name"]}{fine_message}', 'LOAN', loan_id)
        
        return jsonify({
            'success': True,
            'message': f'Book "{loan["book_title"]}" successfully returned!{fine_message}',
            'days_overdue': days_late,
            'fine_amount': fine_amount
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/loans/<int:loan_id>/renew', methods=['POST'])
def renew_loan(loan_id):
    try:
        loan = query_db("""
            SELECT l.*, b.title AS book_title, m.full_name AS member_name
            FROM loans l
            JOIN books b ON l.book_id = b.id
            JOIN members m ON l.member_id = m.id
            WHERE l.id = %s
        """, (loan_id,), one=True)
        
        if not loan:
            return jsonify({'success': False, 'error': 'Loan record not found'}), 404
        if loan['status'] == 'RETURNED':
            return jsonify({'success': False, 'error': 'Cannot renew a returned loan.'}), 400
        if loan['renew_count'] >= Config.MAX_RENEWALS:
            return jsonify({'success': False, 'error': f'Maximum renewals ({Config.MAX_RENEWALS}) reached for this loan.'}), 400
            
        # Extend due date by standard duration
        new_due_date = loan['due_date'] + timedelta(days=Config.DEFAULT_LOAN_DAYS)
        new_status = 'ISSUED' if new_due_date >= date.today() else 'OVERDUE'
        
        execute_db("""
            UPDATE loans 
            SET due_date = %s, renew_count = renew_count + 1, status = %s
            WHERE id = %s
        """, (new_due_date, new_status, loan_id))
        
        log_activity('LOAN_RENEWED', f'Renewed loan for "{loan["book_title"]}" to {new_due_date.strftime("%b %d, %Y")}', 'LOAN', loan_id)
        
        return jsonify({
            'success': True,
            'message': f'Loan renewed successfully! New due date: {new_due_date.strftime("%b %d, %Y")}',
            'new_due_date': new_due_date.isoformat(),
            'renew_count': loan['renew_count'] + 1
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 5. Fines APIs
# -------------------------------------------------------------
@app.route('/api/fines', methods=['GET'])
def get_fines():
    try:
        status = request.args.get('status', 'ALL').upper()
        search = request.args.get('search', '').strip()
        
        query = """
            SELECT f.*, 
                   m.full_name AS member_name, m.member_code, m.email AS member_email, m.phone AS member_phone,
                   b.title AS book_title, b.isbn,
                   l.loan_code, l.issue_date, l.due_date, l.return_date
            FROM fines f
            JOIN members m ON f.member_id = m.id
            JOIN loans l ON f.loan_id = l.id
            JOIN books b ON l.book_id = b.id
            WHERE 1=1
        """
        params = []
        if status in ('UNPAID', 'PAID', 'WAIVED'):
            query += " AND f.status = %s"
            params.append(status)
            
        if search:
            query += " AND (m.full_name LIKE %s OR m.member_code LIKE %s OR b.title LIKE %s OR l.loan_code LIKE %s)"
            pattern = f"%{search}%"
            params.extend([pattern, pattern, pattern, pattern])
            
        query += " ORDER BY f.id DESC"
        fines = query_db(query, params)
        return jsonify({'success': True, 'count': len(fines), 'data': serialize_rows(fines)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/fines/<int:fine_id>/pay', methods=['POST'])
def pay_fine(fine_id):
    try:
        data = request.json or {}
        payment_notes = data.get('notes', 'Settled fine at desk').strip()
        
        fine = query_db("""
            SELECT f.*, m.full_name AS member_name, b.title AS book_title
            FROM fines f
            JOIN members m ON f.member_id = m.id
            JOIN loans l ON f.loan_id = l.id
            JOIN books b ON l.book_id = b.id
            WHERE f.id = %s
        """, (fine_id,), one=True)
        
        if not fine:
            return jsonify({'success': False, 'error': 'Fine record not found'}), 404
        if fine['status'] == 'PAID':
            return jsonify({'success': False, 'error': 'Fine is already paid.'}), 400
            
        today = date.today()
        execute_db("""
            UPDATE fines 
            SET status = 'PAID', paid_amount = amount, payment_date = %s, notes = %s
            WHERE id = %s
        """, (today, payment_notes, fine_id))
        
        log_activity('FINE_PAID', f'Settled fine of ${fine["amount"]:.2f} for {fine["member_name"]} ("{fine["book_title"]}")', 'FINE', fine_id)
        
        return jsonify({'success': True, 'message': f'Fine of ${fine["amount"]:.2f} paid successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/fines/<int:fine_id>/waive', methods=['POST'])
def waive_fine(fine_id):
    try:
        data = request.json or {}
        reason = data.get('reason', 'Administrative waiver').strip()
        
        fine = query_db("""
            SELECT f.*, m.full_name AS member_name
            FROM fines f
            JOIN members m ON f.member_id = m.id
            WHERE f.id = %s
        """, (fine_id,), one=True)
        
        if not fine:
            return jsonify({'success': False, 'error': 'Fine record not found'}), 404
            
        execute_db("""
            UPDATE fines SET status = 'WAIVED', notes = %s WHERE id = %s
        """, (f"Waived: {reason}", fine_id))
        
        log_activity('FINE_WAIVED', f'Waived fine of ${fine["amount"]:.2f} for {fine["member_name"]}', 'FINE', fine_id)
        return jsonify({'success': True, 'message': 'Fine has been waived.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# 6. Export APIs (CSV Generation)
# -------------------------------------------------------------
@app.route('/api/export/<string:report_type>', methods=['GET'])
def export_report(report_type):
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        filename = f"lms_{report_type}_{datetime.date.today().isoformat()}.csv"
        
        if report_type == 'books':
            rows = query_db("""
                SELECT b.isbn, b.title, b.author, c.name AS category, b.publisher, 
                       b.publication_year, b.total_copies, b.available_copies, b.shelf_location
                FROM books b LEFT JOIN categories c ON b.category_id = c.id
                ORDER BY b.title ASC
            """)
            writer.writerow(['ISBN', 'Title', 'Author', 'Category', 'Publisher', 'Year', 'Total Copies', 'Available Copies', 'Shelf Location'])
            for r in rows:
                writer.writerow([r['isbn'], r['title'], r['author'], r['category'], r['publisher'], r['publication_year'], r['total_copies'], r['available_copies'], r['shelf_location']])
                
        elif report_type == 'members':
            rows = query_db("""
                SELECT member_code, full_name, email, phone, membership_type, max_books_allowed, status, joined_date, expiry_date
                FROM members ORDER BY member_code ASC
            """)
            writer.writerow(['Member Code', 'Full Name', 'Email', 'Phone', 'Type', 'Max Allowed', 'Status', 'Joined Date', 'Expiry Date'])
            for r in rows:
                writer.writerow([r['member_code'], r['full_name'], r['email'], r['phone'], r['membership_type'], r['max_books_allowed'], r['status'], r['joined_date'], r['expiry_date']])
                
        elif report_type == 'loans':
            rows = query_db("""
                SELECT l.loan_code, b.title AS book, b.isbn, m.full_name AS member, m.member_code,
                       l.issue_date, l.due_date, l.return_date, l.status, l.renew_count
                FROM loans l
                JOIN books b ON l.book_id = b.id
                JOIN members m ON l.member_id = m.id
                ORDER BY l.id DESC
            """)
            writer.writerow(['Loan Code', 'Book Title', 'ISBN', 'Member Name', 'Member Code', 'Issue Date', 'Due Date', 'Return Date', 'Status', 'Renewals'])
            for r in rows:
                writer.writerow([r['loan_code'], r['book'], r['isbn'], r['member'], r['member_code'], r['issue_date'], r['due_date'], r['return_date'], r['status'], r['renew_count']])
                
        elif report_type == 'fines':
            rows = query_db("""
                SELECT f.id, l.loan_code, m.full_name AS member, b.title AS book,
                       f.amount, f.days_overdue, f.status, f.paid_amount, f.payment_date, f.notes
                FROM fines f
                JOIN loans l ON f.loan_id = l.id
                JOIN members m ON f.member_id = m.id
                JOIN books b ON l.book_id = b.id
                ORDER BY f.id DESC
            """)
            writer.writerow(['Fine ID', 'Loan Code', 'Member', 'Book', 'Amount ($)', 'Days Overdue', 'Status', 'Paid ($)', 'Payment Date', 'Notes'])
            for r in rows:
                writer.writerow([r['id'], r['loan_code'], r['member'], r['book'], r['amount'], r['days_overdue'], r['status'], r['paid_amount'], r['payment_date'], r['notes']])
        else:
            return jsonify({'success': False, 'error': 'Invalid report type requested'}), 400
            
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -------------------------------------------------------------
# Application Runner
# -------------------------------------------------------------
if __name__ == '__main__':
    print("=" * 60)
    print(" Starting Library Management System Web Application")
    print(f" Server running at: http://localhost:{Config.PORT}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=Config.PORT, debug=Config.DEBUG)
