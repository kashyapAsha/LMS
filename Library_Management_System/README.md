# Library Management System (`Library_Management_System`)

An enterprise-grade, modern **Library Management System (LMS)** web application developed with **HTML5, CSS3, JavaScript (ES6+), Python (Flask), and MySQL**.

---

## 🌟 Key Features

1. **Interactive Dashboard & Real-Time Analytics**:
   - Total Book Copies, Available vs Issued Stock.
   - Member Roster and Active Loan Counters.
   - Real-time Overdue and Unpaid Fines Tracker.
   - HTML5 Canvas Donut Chart for **Category Distribution**.
   - HTML5 Canvas Bar Chart for **Monthly Circulation Trends**.

2. **Books Catalog Management**:
   - Live Search (Title, Author, ISBN, Publisher) with instant debounce filtering.
   - Dual View Modes: **Modern Card Grid View** & **Data Table View**.
   - Filter by Category chips, Availability (In-Stock vs Borrowed), and Sorting.
   - Add, Edit, Delete (with active loan checks), and View Details with full borrowing history.

3. **Members Directory & Access Tiers**:
   - Multiple Membership Tiers (`Student`, `Faculty`, `Premium`, `Standard`) with enforced borrowing limits.
   - Account status tracking (`Active`, `Suspended`, `Expired`).
   - Member borrowing history and fine ledger.

4. **Circulation Desk (Book Issue & Return)**:
   - **Quick Issue**: Searchable selection of available titles and eligible members, custom loan durations (7, 14, 21, 30 days) with auto due-date calculation.
   - **1-Click Return**: Dynamic calculation of overdue days and automated fine assessment.
   - **Loan Renewals**: 14-day extensions within allowable renewal limits.

5. **Fines & Revenue Ledger**:
   - Automated overdue penalty calculation ($1.00 / day default).
   - Fine settlement (Mark as Paid) and administrative waiver workflows.

6. **Reports & Exports**:
   - 1-Click CSV Downloads for Books Catalog, Members Roster, Loans, and Fines Ledger.

7. **System Audit Trail**:
   - Live activity timeline tracking all transactions, issues, returns, and inventory modifications.

8. **Theme & Aesthetics**:
   - Glassmorphic translucent cards with subtle glow borders and smooth micro-animations.
   - **Dark Mode & Light Mode** toggle with local storage persistence.
   - Fully responsive across desktop, tablet, and mobile browsers.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5 Semantic Markup, Vanilla CSS3 (Custom Properties & Glassmorphism), Modern JavaScript (ES6+, Fetch API, Canvas 2D).
- **Icons & Typography**: Feather Icons, Google Fonts (Inter & Outfit).
- **Backend**: Python 3.12 (Flask REST API, Flask-CORS, PyMySQL).
- **Database**: MySQL 8.0 (Relational schema with indexes, foreign keys, and cascading constraints).

---

## 🚀 Getting Started

### 1. Requirements
- Python 3.12+ (Installed)
- MySQL Server 8.0 running locally on `localhost:3306`

### 2. Configuration (`config.py`)
Default database credentials (customizable):
```python
DB_HOST = '127.0.0.1'
DB_PORT = 3306
DB_USER = 'root'
DB_PASSWORD = '123456'
DB_NAME = 'library_management_system'
```

### 3. Initialize Database & Seed Sample Data
```bash
python init_db.py
```

### 4. Start the Application
```bash
python app.py
# or double click start.bat
```
Open **`http://localhost:5000`** in any web browser.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Summary counts, overdue alerts & audit feed |
| `GET` | `/api/dashboard/charts` | Category donut breakdown & monthly trends |
| `GET` | `/api/books` | List books with search, category & stock filters |
| `POST` | `/api/books` | Add new book |
| `PUT` | `/api/books/<id>` | Update book metadata |
| `DELETE` | `/api/books/<id>` | Delete book (if no active loans) |
| `GET` | `/api/members` | List members with status & search filters |
| `POST` | `/api/members` | Register new member |
| `PUT` | `/api/members/<id>` | Update member profile |
| `DELETE` | `/api/members/<id>` | Remove member (if no active loans or unpaid fines) |
| `GET` | `/api/loans` | Circulation records (All, Active, Overdue, Returned) |
| `POST` | `/api/loans/issue` | Issue book to member |
| `POST` | `/api/loans/<id>/return` | Check in returned book & compute fine |
| `POST` | `/api/loans/<id>/renew` | Extend loan due date |
| `GET` | `/api/fines` | Fines ledger (Unpaid, Paid, Waived) |
| `POST` | `/api/fines/<id>/pay` | Record fine payment |
| `POST` | `/api/fines/<id>/waive` | Waive fine penalty |
| `GET` | `/api/export/<type>` | Download CSV report (`books`, `members`, `loans`, `fines`) |
