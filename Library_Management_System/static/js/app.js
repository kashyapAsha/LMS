/**
 * Athena Library Management System - Main Application Controller
 */

class LibraryApp {
    constructor() {
        this.state = {
            currentTab: 'dashboard',
            theme: localStorage.getItem('athena_theme') || 'light',
            booksViewMode: 'grid', // 'grid' | 'table'
            books: [],
            members: [],
            categories: [],
            loans: [],
            fines: [],
            selectedCategory: '',
            loanStatusFilter: 'ALL',
            fineStatusFilter: 'ALL'
        };

        this.searchDebounceTimer = null;
    }

    async init() {
        console.log("Initializing IRIEEN LMS...");

        // Ensure user is authenticated, otherwise redirect to landing/login page
        const authData = sessionStorage.getItem('irieen_user');
        if (!authData) {
            console.warn("No active session found. Redirecting to login page...");
            window.location.href = '/login';
            return;
        }

        this.applyTheme(this.state.theme);
        this.initEventListeners();
        this.startClock();

        // Load initial data
        await this.loadCategories();
        await this.loadDashboardData();

        // Check URL hash for tab routing
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            this.switchTab(hash);
        }

        // Auto refresh dashboard every 45 seconds
        setInterval(() => {
            if (this.state.currentTab === 'dashboard') {
                this.loadDashboardData(true);
            }
        }, 45000);
    }

    // =========================================================
    // AUTHENTICATION & LOGOUT
    // =========================================================
    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        } catch (e) {
            // Ignore network errors during logout
        }
        sessionStorage.removeItem('irieen_user');
        window.location.href = '/login';
    }

    // =========================================================
    // THEME & CLOCK & EVENT LISTENERS
    // =========================================================
    applyTheme(theme) {
        this.state.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('athena_theme', theme);
        if (this.state.currentTab === 'dashboard') {
            this.refreshCharts();
        }
    }

    toggleTheme() {
        const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(nextTheme);
        this.showToast(`Switched to ${nextTheme} theme`, 'info');
    }

    startClock() {
        const clockEl = document.getElementById('live-clock');
        if (!clockEl) return;

        const updateTime = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            clockEl.innerHTML = `
                <span class="clock-time">${timeStr}</span>
                <span class="clock-date">${dateStr}</span>
            `;
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    initEventListeners() {
        // Theme toggle button
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => this.toggleTheme());

        // Quick Issue Nav button
        document.getElementById('btn-quick-issue-nav')?.addEventListener('click', () => this.openIssueModal());

        // Navigation Tabs
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Global Search shortcut (Cmd+K / Ctrl+K)
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                const globalSearch = document.getElementById('global-search-input');
                if (globalSearch) {
                    globalSearch.focus();
                    globalSearch.select();
                }
            }
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Global Search Input
        const globalSearch = document.getElementById('global-search-input');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                const term = e.target.value.trim();
                if (term.length > 1) {
                    this.switchTab('books');
                    const bookSearch = document.getElementById('books-search-input');
                    if (bookSearch) {
                        bookSearch.value = term;
                        this.filterBooks();
                    }
                }
            });
        }

        // View Mode Toggles (Grid / Table)
        document.getElementById('view-mode-grid')?.addEventListener('click', () => this.setBooksViewMode('grid'));
        document.getElementById('view-mode-table')?.addEventListener('click', () => this.setBooksViewMode('table'));

        // Books Filters
        document.getElementById('books-search-input')?.addEventListener('input', () => this.debounceSearch(() => this.filterBooks()));
        document.getElementById('books-category-filter')?.addEventListener('change', (e) => {
            this.state.selectedCategory = e.target.value;
            this.renderCategoryChips();
            this.filterBooks();
        });
        document.getElementById('books-avail-filter')?.addEventListener('change', () => this.filterBooks());
        document.getElementById('books-sort-filter')?.addEventListener('change', () => this.filterBooks());

        // Members Filters
        document.getElementById('members-search-input')?.addEventListener('input', () => this.debounceSearch(() => this.filterMembers()));
        document.getElementById('members-type-filter')?.addEventListener('change', () => this.filterMembers());
        document.getElementById('members-status-filter')?.addEventListener('change', () => this.filterMembers());

        // Loans Filters
        document.getElementById('loans-search-input')?.addEventListener('input', () => this.debounceSearch(() => this.filterLoans()));
        document.querySelectorAll('#loan-status-tabs .filter-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#loan-status-tabs .filter-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.loanStatusFilter = btn.getAttribute('data-status');
                this.filterLoans();
            });
        });

        // Fines Filters
        document.getElementById('fines-search-input')?.addEventListener('input', () => this.debounceSearch(() => this.filterFines()));
        document.querySelectorAll('#fine-status-tabs .filter-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#fine-status-tabs .filter-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.fineStatusFilter = btn.getAttribute('data-status');
                this.filterFines();
            });
        });

        // Duration select in Issue modal
        document.getElementById('issue-days-input')?.addEventListener('change', () => this.updateIssueDueDatePreview());

        // Mobile Sidebar Toggle
        /*const mobileToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');
        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        }*/
        /*const mobileToggle = document.getElementById('mobile-menu-toggle');
        const desktopToggle = document.getElementById('btn-sidebar-collapse');
        const sidebar = document.getElementById('sidebar');


        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        }


        if (desktopToggle && sidebar) {
            desktopToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        }*/
        // =========================================================
        // SIDEBAR TOGGLE
        // =========================================================
        //newly added code for sidebar collapse//
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        const desktopToggle = document.getElementById('btn-sidebar-collapse');
        const sidebar = document.getElementById('sidebar');

        // Mobile sidebar
        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }

        // Desktop sidebar collapse
        if (desktopToggle && sidebar) {
            desktopToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');

                // Change arrow direction
                const icon = desktopToggle.querySelector('svg');

                if (sidebar.classList.contains('collapsed')) {
                    desktopToggle.setAttribute('aria-label', 'Expand Sidebar');

                    if (icon) {
                        icon.outerHTML = '<i data-feather="chevron-right"></i>';
                    }
                } else {
                    desktopToggle.setAttribute('aria-label', 'Collapse Sidebar');

                    if (icon) {
                        icon.outerHTML = '<i data-feather="chevron-left"></i>';
                    }
                }

                if (window.feather) {
                    feather.replace();
                }
            });
        }

        // Close modal on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    this.closeAllModals();
                }
            });
        });
    }

    debounceSearch(callback, delay = 250) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(callback, delay);
    }

    // =========================================================
    // TAB ROUTING & SWITCHING
    // =========================================================
    switchTab(tabName, filterOverride = null) {
        this.state.currentTab = tabName;
        window.location.hash = tabName;

        // Update sidebar active link
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            if (item.getAttribute('data-tab') === tabName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            if (pane.id === `pane-${tabName}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Update page title
        const titles = {
            'dashboard': { title: 'Dashboard Overview', sub: 'Real-time circulation metrics and library operations' },
            'books': { title: 'Books Catalog', sub: 'Manage titles, authors, ISBNs, categories and inventory' },
            'members': { title: 'Members Directory', sub: 'Patron registration, membership levels and account records' },
            'circulation': { title: 'Issue & Return Desk', sub: 'Track active loans, return check-ins and due dates' },
            'fines': { title: 'Fines & Dues Ledger', sub: 'Monitor overdue penalties, payments and fee waivers' },
            'reports': { title: 'Reports & Exports', sub: 'Instant CSV data downloads and library spreadsheets' },
            'activity': { title: 'Audit Trail Logs', sub: 'Full history of library transactions and administrative actions' }
        };

        const t = titles[tabName] || { title: 'Library Management', sub: '' };
        document.getElementById('current-page-title').textContent = t.title;
        document.getElementById('current-page-subtitle').textContent = t.sub;

        // Load specific tab data
        if (tabName === 'dashboard') {
            this.loadDashboardData();
        } else if (tabName === 'books') {
            this.loadBooks();
        } else if (tabName === 'members') {
            this.loadMembers();
        } else if (tabName === 'circulation') {
            if (filterOverride) {
                this.state.loanStatusFilter = filterOverride;
                document.querySelectorAll('#loan-status-tabs .filter-tab-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-status') === filterOverride);
                });
            }
            this.loadLoans();
        } else if (tabName === 'fines') {
            this.loadFines();
        } else if (tabName === 'activity') {
            this.loadAuditLogs();
        }

        // Re-render Feather icons
        if (window.feather) feather.replace();
    }

    // =========================================================
    // 1. DASHBOARD CONTROLLER
    // =========================================================
    async loadDashboardData(silent = false) {
        try {
            const res = await API.getDashboardStats();
            if (!res.success) return;

            const { books, members, loans, fines, recent_activities, critical_overdue } = res.data;

            // Update top cards
            document.getElementById('stat-total-books').textContent = books.total_copies || 0;
            document.getElementById('stat-available-copies').textContent = books.available_copies || 0;

            document.getElementById('stat-active-loans').textContent = loans.active_loans || 0;
            document.getElementById('stat-returned-loans').textContent = loans.returned_loans || 0;

            document.getElementById('stat-overdue-loans').textContent = loans.overdue_loans || 0;
            document.getElementById('stat-unpaid-fines').textContent = `$${(fines.total_unpaid_fines || 0).toFixed(2)}`;

            document.getElementById('stat-total-members').textContent = members.total_members || 0;
            document.getElementById('stat-active-members').textContent = members.active_members || 0;

            // Update sidebar badge pills
            document.getElementById('badge-total-books').textContent = books.total_unique_books || 0;
            document.getElementById('badge-total-members').textContent = members.total_members || 0;
            document.getElementById('badge-active-loans').textContent = loans.active_loans || 0;
            document.getElementById('badge-overdue-fines').textContent = `$${(fines.total_unpaid_fines || 0).toFixed(0)}`;

            // Render Overdue alert table
            const overdueTbody = document.getElementById('dashboard-overdue-tbody');
            if (overdueTbody) {
                if (!critical_overdue || critical_overdue.length === 0) {
                    overdueTbody.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-center py-4 text-emerald">
                                <i data-feather="check-circle" style="width:16px;height:16px;vertical-align:middle;"></i> All loans are currently within their due dates!
                            </td>
                        </tr>
                    `;
                } else {
                    overdueTbody.innerHTML = critical_overdue.map(item => `
                        <tr>
                            <td><code>${item.loan_code}</code></td>
                            <td><strong>${this.escapeHtml(item.book_title)}</strong></td>
                            <td>
                                <div>${this.escapeHtml(item.member_name)}</div>
                                <small class="text-muted">${this.escapeHtml(item.member_phone)}</small>
                            </td>
                            <td>${item.due_date}</td>
                            <td><span class="badge-status overdue">${item.days_overdue}d Overdue</span></td>
                            <td><strong class="text-danger">$${Number(item.fine_amount || 0).toFixed(2)}</strong></td>
                            <td>
                                <button class="btn-sm btn-emerald" onclick="app.openReturnModal(${item.id})">Return</button>
                            </td>
                        </tr>
                    `).join('');
                }
            }

            // Render Recent audit feed
            const feedContainer = document.getElementById('dashboard-feed-list');
            if (feedContainer && recent_activities) {
                feedContainer.innerHTML = recent_activities.map(act => `
                    <div class="feed-item">
                        <div class="feed-item-icon"><i data-feather="bell"></i></div>
                        <div class="feed-item-text">
                            <div>${this.escapeHtml(act.description)}</div>
                            <div class="feed-item-time">${this.formatDateTime(act.created_at)}</div>
                        </div>
                    </div>
                `).join('');
            }

            // Load and draw charts
            await this.refreshCharts();

            if (window.feather) feather.replace();
        } catch (error) {
            console.error("Failed to load dashboard data:", error);
            if (!silent) this.showToast("Failed to fetch dashboard metrics", "error");
        }
    }

    async refreshCharts() {
        try {
            const chartRes = await API.getDashboardCharts();
            if (chartRes.success) {
                LMSCharts.renderCategoryDonut('categoryDonutChart', 'category-legend-container', chartRes.categories || []);
                LMSCharts.renderCirculationTrend('circulationTrendChart', chartRes.monthly_trends || []);
            }
        } catch (e) {
            console.warn("Chart refresh notice:", e);
        }
    }

    // =========================================================
    // 2. BOOKS CONTROLLER
    // =========================================================
    async loadCategories() {
        try {
            const res = await API.getCategories();
            if (res.success) {
                this.state.categories = res.data || [];

                // Populate category dropdowns
                const filterSelect = document.getElementById('books-category-filter');
                const modalSelect = document.getElementById('book-category-input');

                if (filterSelect) {
                    filterSelect.innerHTML = '<option value="">All Categories</option>' +
                        this.state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }

                if (modalSelect) {
                    modalSelect.innerHTML = '<option value="">-- Select Category --</option>' +
                        this.state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }

                this.renderCategoryChips();
            }
        } catch (e) {
            console.error("Error loading categories:", e);
        }
    }

    renderCategoryChips() {
        const chipsContainer = document.getElementById('books-category-chips');
        if (!chipsContainer) return;

        chipsContainer.innerHTML = `
            <button class="chip-btn ${this.state.selectedCategory === '' ? 'active' : ''}" onclick="app.selectCategoryChip('')">
                <i data-feather="layers"></i> All (${this.state.books.length || 0})
            </button>
            ${this.state.categories.map(c => `
                <button class="chip-btn ${this.state.selectedCategory == c.id ? 'active' : ''}" onclick="app.selectCategoryChip('${c.id}')">
                    <span style="width:8px;height:8px;border-radius:50%;background:${c.color || '#6366f1'};display:inline-block;"></span>
                    ${c.name}
                </button>
            `).join('')}
        `;
        if (window.feather) feather.replace();
    }

    selectCategoryChip(categoryId) {
        this.state.selectedCategory = categoryId;
        const filterSelect = document.getElementById('books-category-filter');
        if (filterSelect) filterSelect.value = categoryId;
        this.renderCategoryChips();
        this.filterBooks();
    }

    setBooksViewMode(mode) {
        this.state.booksViewMode = mode;
        document.getElementById('view-mode-grid')?.classList.toggle('active', mode === 'grid');
        document.getElementById('view-mode-table')?.classList.toggle('active', mode === 'table');
        document.getElementById('books-grid-view')?.classList.toggle('d-none', mode !== 'grid');
        document.getElementById('books-table-view')?.classList.toggle('d-none', mode !== 'table');
        this.renderBooks();
    }

    async loadBooks() {
        await this.filterBooks();
    }

    async filterBooks() {
        try {
            const search = document.getElementById('books-search-input')?.value.trim() || '';
            const category_id = this.state.selectedCategory || document.getElementById('books-category-filter')?.value || '';
            const availability = document.getElementById('books-avail-filter')?.value || 'all';
            const sort_by = document.getElementById('books-sort-filter')?.value || 'newest';

            const res = await API.getBooks({ search, category_id, availability, sort_by });
            if (res.success) {
                this.state.books = res.data || [];
                this.renderBooks();
            }
        } catch (error) {
            console.error("Failed to fetch books:", error);
            this.showToast("Could not load books catalog", "error");
        }
    }

    renderBooks() {
        const books = this.state.books;

        // 1. Render Grid View
        const gridView = document.getElementById('books-grid-view');
        if (gridView) {
            if (books.length === 0) {
                gridView.innerHTML = `
                      <div class="col-12 text-center py-5 d-flex flex-column align-items-center justify-content-center" style="min-height: 300px; width: 100%;">
                          <p class="text-muted fs-5 m-0">No books found matching the current search criteria.</p>
                      </div>
                  `;

            } else {
                gridView.innerHTML = books.map(b => {
                    const avail = Number(b.available_copies);
                    const total = Number(b.total_copies);
                    const percentage = total > 0 ? (avail / total) * 100 : 0;
                    const fillClass = avail === 0 ? 'empty' : (avail === 1 ? 'low' : '');

                    return `
                        <div class="book-card">
                            <div class="book-card-header" style="background:${b.cover_color || '#3b82f6'};">
                                <span class="book-cover-badge">${b.category_name || 'General'}</span>
                                <span class="book-shelf-tag">${this.escapeHtml(b.shelf_location || 'Shelf A')}</span>
                            </div>
                            <div class="book-card-body">
                                <h4 class="book-title" title="${this.escapeHtml(b.title)}">${this.escapeHtml(b.title)}</h4>
                                <div class="book-author">by ${this.escapeHtml(b.author)}</div>
                                
                                <div class="book-meta-row">
                                    <span>ISBN: <code>${b.isbn}</code></span>
                                    <span>Year: ${b.publication_year || 'N/A'}</span>
                                </div>

                                <div class="book-stock-progress">
                                    <div class="stock-label-row">
                                        <span>Stock Availability:</span>
                                        <strong>${avail} of ${total} Copies</strong>
                                    </div>
                                    <div class="stock-bar-track">
                                        <div class="stock-bar-fill ${fillClass}" style="width: ${percentage}%"></div>
                                    </div>
                                </div>

                                <div class="book-card-footer">
                                    <button class="btn-sm btn-outline" onclick="app.viewBookDetails(${b.id})">
                                        <i data-feather="info"></i> Details
                                    </button>
                                    <div class="btn-group-actions">
                                        <button class="btn-action-icon" title="Edit Book" onclick="app.openBookModal(${b.id})">
                                            <i data-feather="edit-2"></i>
                                        </button>
                                        <button class="btn-action-icon text-danger" title="Delete Book" onclick="app.deleteBook(${b.id})">
                                            <i data-feather="trash-2"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 2. Render Table View
        const tbody = document.getElementById('books-table-tbody');
        if (tbody) {
            if (books.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No books match your filters.</td></tr>';
            } else {
                tbody.innerHTML = books.map(b => `
                    <tr>
                        <td>
                            <div style="width:24px;height:32px;border-radius:3px;background:${b.cover_color || '#6366f1'};"></div>
                        </td>
                        <td>
                            <strong>${this.escapeHtml(b.title)}</strong>
                            <div class="text-muted" style="font-size:0.75rem;">${this.escapeHtml(b.publisher || '')} ${b.publication_year ? `(${b.publication_year})` : ''}</div>
                        </td>
                        <td>${this.escapeHtml(b.author)}</td>
                        <td><span class="badge-status active">${this.escapeHtml(b.category_name || 'General')}</span></td>
                        <td><code>${b.isbn}</code></td>
                        <td>${this.escapeHtml(b.shelf_location || '-')}</td>
                        <td>
                            <strong>${b.available_copies}</strong> / ${b.total_copies}
                        </td>
                        <td>
                            <div class="btn-group-actions">
                                <button class="btn-action-icon" title="View Details" onclick="app.viewBookDetails(${b.id})"><i data-feather="eye"></i></button>
                                <button class="btn-action-icon" title="Edit" onclick="app.openBookModal(${b.id})"><i data-feather="edit-2"></i></button>
                                <button class="btn-action-icon text-danger" title="Delete" onclick="app.deleteBook(${b.id})"><i data-feather="trash-2"></i></button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        }

        if (window.feather) feather.replace();
    }

    openBookModal(bookId = null) {
        const modal = document.getElementById('modal-book');
        const titleEl = document.getElementById('modal-book-title');
        const form = document.getElementById('form-book');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('book-id').value = '';

        if (bookId) {
            const book = this.state.books.find(b => b.id === bookId);
            if (book) {
                titleEl.textContent = 'Edit Book Details';
                document.getElementById('book-id').value = book.id;
                document.getElementById('book-title-input').value = book.title;
                document.getElementById('book-author-input').value = book.author;
                document.getElementById('book-isbn-input').value = book.isbn;
                document.getElementById('book-category-input').value = book.category_id || '';
                document.getElementById('book-publisher-input').value = book.publisher || '';
                document.getElementById('book-year-input').value = book.publication_year || '';
                document.getElementById('book-copies-input').value = book.total_copies;
                document.getElementById('book-shelf-input').value = book.shelf_location || '';
                document.getElementById('book-desc-input').value = book.description || '';

                const colorRadio = form.querySelector(`input[name="book-color"][value="${book.cover_color}"]`);
                if (colorRadio) colorRadio.checked = true;
            }
        } else {
            titleEl.textContent = 'Add New Book to Catalog';
            document.getElementById('book-copies-input').value = '3';
        }

        modal.classList.add('open');
    }

    async handleBookSubmit(e) {
        e.preventDefault();
        const bookId = document.getElementById('book-id').value;
        const colorRadio = document.querySelector('input[name="book-color"]:checked');

        const payload = {
            title: document.getElementById('book-title-input').value.trim(),
            author: document.getElementById('book-author-input').value.trim(),
            isbn: document.getElementById('book-isbn-input').value.trim(),
            category_id: document.getElementById('book-category-input').value || null,
            publisher: document.getElementById('book-publisher-input').value.trim() || null,
            publication_year: document.getElementById('book-year-input').value || null,
            total_copies: parseInt(document.getElementById('book-copies-input').value, 10),
            shelf_location: document.getElementById('book-shelf-input').value.trim() || 'Section A',
            description: document.getElementById('book-desc-input').value.trim() || null,
            cover_color: colorRadio ? colorRadio.value : '#3b82f6'
        };

        try {
            if (bookId) {
                await API.updateBook(bookId, payload);
                this.showToast('Book updated successfully!', 'success');
            } else {
                await API.addBook(payload);
                this.showToast('New book added to library!', 'success');
            }

            this.closeModal('modal-book');
            await this.filterBooks();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async deleteBook(bookId) {
        const book = this.state.books.find(b => b.id === bookId);
        const name = book ? `"${book.title}"` : 'this book';

        if (!confirm(`Are you sure you want to delete ${name} from catalog?`)) {
            return;
        }

        try {
            await API.deleteBook(bookId);
            this.showToast('Book deleted successfully', 'success');
            await this.filterBooks();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async viewBookDetails(bookId) {
        try {
            const res = await API.getBookDetails(bookId);
            if (!res.success) return;

            const { data: book, history } = res;
            const contentEl = document.getElementById('modal-book-details-content');
            if (!contentEl) return;

            contentEl.innerHTML = `
                <div style="display:flex;gap:20px;margin-bottom:20px;">
                    <div style="width:120px;height:160px;border-radius:8px;background:${book.cover_color || '#3b82f6'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:2rem;box-shadow:var(--shadow-md);">
                        <i data-feather="book-open"></i>
                    </div>
                    <div style="flex:1;">
                        <h3 style="margin-bottom:4px;">${this.escapeHtml(book.title)}</h3>
                        <div class="text-secondary" style="font-size:0.95rem;margin-bottom:8px;">by <strong>${this.escapeHtml(book.author)}</strong></div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.82rem;margin-bottom:12px;">
                            <span>Category: <strong>${this.escapeHtml(book.category_name || 'General')}</strong></span>
                            <span>ISBN: <code>${book.isbn}</code></span>
                            <span>Shelf: <strong>${this.escapeHtml(book.shelf_location || 'N/A')}</strong></span>
                        </div>
                        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">${this.escapeHtml(book.description || 'No detailed overview provided.')}</p>
                    </div>
                </div>

                <h4 style="font-size:0.95rem;margin-bottom:10px;border-bottom:1px solid var(--border-glass);padding-bottom:6px;">Circulation History for this Book</h4>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Borrower</th>
                                <th>Issue Date</th>
                                <th>Due Date</th>
                                <th>Return Date</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(!history || history.length === 0) ? '<tr><td colspan="5" class="text-center py-2">No borrowing records yet.</td></tr>' : history.map(h => `
                                <tr>
                                    <td><strong>${this.escapeHtml(h.member_name)}</strong> (<code>${h.member_code}</code>)</td>
                                    <td>${h.issue_date}</td>
                                    <td>${h.due_date}</td>
                                    <td>${h.return_date || '-'}</td>
                                    <td><span class="badge-status ${h.status.toLowerCase()}">${h.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            document.getElementById('modal-book-details')?.classList.add('open');
            if (window.feather) feather.replace();
        } catch (e) {
            this.showToast("Could not load book details", "error");
        }
    }

    // =========================================================
    // 3. MEMBERS CONTROLLER
    // =========================================================
    async loadMembers() {
        await this.filterMembers();
    }

    async filterMembers() {
        try {
            const search = document.getElementById('members-search-input')?.value.trim() || '';
            const membership_type = document.getElementById('members-type-filter')?.value || '';
            const status = document.getElementById('members-status-filter')?.value || '';

            const res = await API.getMembers({ search, membership_type, status });
            if (res.success) {
                this.state.members = res.data || [];
                this.renderMembers();
            }
        } catch (error) {
            console.error("Failed to load members:", error);
            this.showToast("Could not fetch members directory", "error");
        }
    }

    renderMembers() {
        const tbody = document.getElementById('members-table-tbody');
        if (!tbody) return;

        const members = this.state.members;
        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No members found matching query.</td></tr>';
            return;
        }

        tbody.innerHTML = members.map(m => `
            <tr>
                <td><code>${m.member_code}</code></td>
                <td>
                    <strong>${this.escapeHtml(m.full_name)}</strong>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${this.escapeHtml(m.email)} | ${this.escapeHtml(m.phone)}</div>
                </td>
                <td><span class="badge-status active">${m.membership_type}</span></td>
                <td>
                    <strong>${m.active_loans_count || 0}</strong> / ${m.max_books_allowed}
                </td>
                <td>
                    <strong class="${Number(m.unpaid_fines_total) > 0 ? 'text-danger' : ''}">$${Number(m.unpaid_fines_total || 0).toFixed(2)}</strong>
                </td>
                <td>
                    <span class="badge-status ${m.status.toLowerCase()}">${m.status}</span>
                </td>
                <td>${m.joined_date}</td>
                <td>
                    <div class="btn-group-actions">
                        <button class="btn-action-icon" title="Edit Profile" onclick="app.openMemberModal(${m.id})"><i data-feather="edit-2"></i></button>
                        <button class="btn-action-icon text-danger" title="Remove Member" onclick="app.deleteMember(${m.id})"><i data-feather="user-x"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (window.feather) feather.replace();
    }

    openMemberModal(memberId = null) {
        const modal = document.getElementById('modal-member');
        const titleEl = document.getElementById('modal-member-title');
        const form = document.getElementById('form-member');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('member-id').value = '';

        if (memberId) {
            const member = this.state.members.find(m => m.id === memberId);
            if (member) {
                titleEl.textContent = 'Edit Member Profile';
                document.getElementById('member-id').value = member.id;
                document.getElementById('member-name-input').value = member.full_name;
                document.getElementById('member-email-input').value = member.email;
                document.getElementById('member-phone-input').value = member.phone;
                document.getElementById('member-address-input').value = member.address || '';
                document.getElementById('member-type-input').value = member.membership_type;
                document.getElementById('member-max-input').value = member.max_books_allowed;
                document.getElementById('member-status-input').value = member.status;
            }
        } else {
            titleEl.textContent = 'Register New Library Member';
            document.getElementById('member-type-input').value = 'Student';
            document.getElementById('member-max-input').value = '5';
            document.getElementById('member-status-input').value = 'Active';
        }

        modal.classList.add('open');
    }

    handleMembershipTypeChange() {
        const type = document.getElementById('member-type-input').value;
        const limits = { 'Student': 5, 'Faculty': 10, 'Premium': 8, 'Standard': 3 };
        document.getElementById('member-max-input').value = limits[type] || 3;
    }

    async handleMemberSubmit(e) {
        e.preventDefault();
        const memberId = document.getElementById('member-id').value;

        const payload = {
            full_name: document.getElementById('member-name-input').value.trim(),
            email: document.getElementById('member-email-input').value.trim(),
            phone: document.getElementById('member-phone-input').value.trim(),
            address: document.getElementById('member-address-input').value.trim() || null,
            membership_type: document.getElementById('member-type-input').value,
            max_books_allowed: parseInt(document.getElementById('member-max-input').value, 10),
            status: document.getElementById('member-status-input').value
        };

        try {
            if (memberId) {
                await API.updateMember(memberId, payload);
                this.showToast('Member profile updated successfully', 'success');
            } else {
                const res = await API.registerMember(payload);
                this.showToast(`Member registered! ID: ${res.member_code}`, 'success');
            }

            this.closeModal('modal-member');
            await this.filterMembers();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async deleteMember(memberId) {
        const member = this.state.members.find(m => m.id === memberId);
        const name = member ? `"${member.full_name}"` : 'this member';

        if (!confirm(`Are you sure you want to remove member ${name}?`)) {
            return;
        }

        try {
            await API.deleteMember(memberId);
            this.showToast('Member account removed successfully', 'success');
            await this.filterMembers();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    // =========================================================
    // 4. CIRCULATION (LOANS) CONTROLLER
    // =========================================================
    async loadLoans() {
        await this.filterLoans();
    }

    async filterLoans() {
        try {
            const search = document.getElementById('loans-search-input')?.value.trim() || '';
            const status = this.state.loanStatusFilter || 'ALL';

            const res = await API.getLoans({ search, status });
            if (res.success) {
                this.state.loans = res.data || [];
                this.renderLoans();
            }
        } catch (error) {
            console.error("Failed to load loans:", error);
            this.showToast("Could not load circulation records", "error");
        }
    }

    renderLoans() {
        const tbody = document.getElementById('loans-table-tbody');
        if (!tbody) return;

        const loans = this.state.loans;
        if (loans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4">No loan records match criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = loans.map(l => {
            const isReturned = l.status === 'RETURNED';
            const isOverdue = l.status === 'OVERDUE';

            return `
                <tr>
                    <td><code>${l.loan_code}</code></td>
                    <td>
                        <strong>${this.escapeHtml(l.book_title)}</strong>
                        <div style="font-size:0.75rem;color:var(--text-muted);">ISBN: ${l.isbn}</div>
                    </td>
                    <td>
                        <strong>${this.escapeHtml(l.member_name)}</strong>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${l.member_code}</div>
                    </td>
                    <td>${l.issue_date}</td>
                    <td>
                        <strong class="${isOverdue ? 'text-danger' : ''}">${l.due_date}</strong>
                    </td>
                    <td>${l.return_date || '-'}</td>
                    <td><span class="badge-status ${l.status.toLowerCase()}">${l.status}</span></td>
                    <td><span class="badge-status active">${l.renew_count || 0} renewals</span></td>
                    <td>
                        <div class="btn-group-actions">
                            ${!isReturned ? `
                                <button class="btn-sm btn-emerald" onclick="app.openReturnModal(${l.id})">Return</button>
                                <button class="btn-sm btn-outline" onclick="app.renewLoan(${l.id})" title="Extend loan">Renew</button>
                            ` : `
                                <span class="text-muted" style="font-size:0.78rem;">Complete</span>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.feather) feather.replace();
    }

    async openIssueModal() {
        const modal = document.getElementById('modal-issue');
        const form = document.getElementById('form-issue');
        if (!modal || !form) return;

        form.reset();

        // Fetch up-to-date available books & active members
        try {
            const [booksRes, membersRes] = await Promise.all([
                API.getBooks({ availability: 'available' }),
                API.getMembers({ status: 'Active' })
            ]);

            const bookSelect = document.getElementById('issue-book-select');
            const memberSelect = document.getElementById('issue-member-select');

            if (bookSelect) {
                bookSelect.innerHTML = '<option value="">-- Choose Available Book --</option>' +
                    (booksRes.data || []).map(b => `<option value="${b.id}">${b.title} (${b.available_copies} available) - ${b.isbn}</option>`).join('');
            }

            if (memberSelect) {
                memberSelect.innerHTML = '<option value="">-- Choose Member --</option>' +
                    (membersRes.data || []).map(m => `<option value="${m.id}">${m.full_name} (${m.member_code}) - ${m.membership_type}</option>`).join('');
            }

            this.updateIssueDueDatePreview();
            modal.classList.add('open');
        } catch (e) {
            this.showToast("Failed to prepare issue desk", "error");
        }
    }

    updateIssueDueDatePreview() {
        const days = parseInt(document.getElementById('issue-days-input')?.value || 14, 10);
        const due = new Date();
        due.setDate(due.getDate() + days);
        const previewEl = document.getElementById('issue-due-date-preview');
        if (previewEl) {
            previewEl.value = due.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }

    async handleIssueSubmit(e) {
        e.preventDefault();
        const bookId = document.getElementById('issue-book-select').value;
        const memberId = document.getElementById('issue-member-select').value;
        const loanDays = document.getElementById('issue-days-input').value;
        const notes = document.getElementById('issue-notes-input').value.trim();

        if (!bookId || !memberId) {
            this.showToast('Please select both a book and member', 'warning');
            return;
        }

        try {
            const res = await API.issueBook({
                book_id: parseInt(bookId, 10),
                member_id: parseInt(memberId, 10),
                loan_days: parseInt(loanDays, 10),
                notes
            });

            this.showToast(res.message || 'Book issued successfully!', 'success');
            this.closeModal('modal-issue');

            if (this.state.currentTab === 'circulation') {
                await this.filterLoans();
            }
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    openReturnModal(loanId) {
        const loan = (this.state.loans || []).find(l => l.id === loanId);
        const modal = document.getElementById('modal-return');
        if (!modal) return;

        document.getElementById('return-loan-id').value = loanId;

        if (loan) {
            document.getElementById('return-book-title').textContent = loan.book_title;
            document.getElementById('return-member-name').textContent = `${loan.member_name} (${loan.member_code})`;
            document.getElementById('return-due-date').textContent = loan.due_date;

            const due = new Date(loan.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            due.setHours(0, 0, 0, 0);

            const diffDays = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));
            const fine = diffDays * 1.0;

            document.getElementById('return-overdue-days').textContent = diffDays > 0 ? `${diffDays} Days Overdue` : 'On Time';
            document.getElementById('return-fine-amount').textContent = `$${fine.toFixed(2)}`;
        }

        modal.classList.add('open');
    }

    async confirmReturn() {
        const loanId = document.getElementById('return-loan-id').value;
        const notes = document.getElementById('return-notes-input')?.value || '';

        try {
            const res = await API.returnBook(loanId, { notes });
            this.showToast(res.message || 'Book returned successfully!', 'success');
            this.closeModal('modal-return');

            if (this.state.currentTab === 'circulation') {
                await this.filterLoans();
            }
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async renewLoan(loanId) {
        if (!confirm('Extend this book loan by 14 days?')) return;

        try {
            const res = await API.renewLoan(loanId);
            this.showToast(res.message || 'Loan renewed successfully!', 'success');
            await this.filterLoans();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    // =========================================================
    // 5. FINES CONTROLLER
    // =========================================================
    async loadFines() {
        await this.filterFines();
    }

    async filterFines() {
        try {
            const search = document.getElementById('fines-search-input')?.value.trim() || '';
            const status = this.state.fineStatusFilter || 'ALL';

            const res = await API.getFines({ search, status });
            if (res.success) {
                this.state.fines = res.data || [];
                this.renderFines();
            }
        } catch (error) {
            console.error("Failed to load fines:", error);
            this.showToast("Could not fetch fines ledger", "error");
        }
    }

    renderFines() {
        const tbody = document.getElementById('fines-table-tbody');
        if (!tbody) return;

        const fines = this.state.fines;
        const totalUnpaid = fines
            .filter(f => f.status === 'UNPAID')
            .reduce((acc, f) => acc + Number(f.amount || 0), 0);

        document.getElementById('fines-total-unpaid-header').textContent = `$${totalUnpaid.toFixed(2)}`;

        if (fines.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4">No fine records found.</td></tr>';
            return;
        }

        tbody.innerHTML = fines.map(f => {
            const isUnpaid = f.status === 'UNPAID';
            return `
                <tr>
                    <td><code>#F-${f.id}</code></td>
                    <td><code>${f.loan_code}</code></td>
                    <td>
                        <strong>${this.escapeHtml(f.member_name)}</strong>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${f.member_code}</div>
                    </td>
                    <td>${this.escapeHtml(f.book_title)}</td>
                    <td><span class="badge-status overdue">${f.days_overdue} days</span></td>
                    <td><strong class="text-danger">$${Number(f.amount || 0).toFixed(2)}</strong></td>
                    <td><span class="badge-status ${f.status.toLowerCase()}">${f.status}</span></td>
                    <td>
                        <div style="font-size:0.8rem;">${this.escapeHtml(f.notes || '-')}</div>
                        ${f.payment_date ? `<div class="text-muted" style="font-size:0.72rem;">Paid on ${f.payment_date}</div>` : ''}
                    </td>
                    <td>
                        ${isUnpaid ? `
                            <button class="btn-sm btn-primary" onclick="app.openFineModal(${f.id})">Settle</button>
                        ` : `
                            <span class="text-muted" style="font-size:0.78rem;">Settled</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

        if (window.feather) feather.replace();
    }

    openFineModal(fineId) {
        const fine = (this.state.fines || []).find(f => f.id === fineId);
        const modal = document.getElementById('modal-fine');
        if (!modal || !fine) return;

        document.getElementById('fine-id').value = fineId;
        document.getElementById('fine-modal-amount').textContent = `$${Number(fine.amount).toFixed(2)}`;
        document.getElementById('fine-modal-member').textContent = `Borrower: ${fine.member_name} (${fine.member_code}) - Book: ${fine.book_title}`;

        modal.classList.add('open');
    }

    async confirmPayFine() {
        const fineId = document.getElementById('fine-id').value;
        const notes = document.getElementById('fine-payment-notes')?.value || 'Settled at desk';

        try {
            await API.payFine(fineId, notes);
            this.showToast('Fine payment recorded successfully!', 'success');
            this.closeModal('modal-fine');
            await this.filterFines();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async waiveFine() {
        const fineId = document.getElementById('fine-id').value;
        if (!confirm('Are you sure you want to waive this fine penalty?')) return;

        try {
            await API.waiveFine(fineId, 'Administrative desk waiver');
            this.showToast('Fine waived successfully', 'info');
            this.closeModal('modal-fine');
            await this.filterFines();
            this.loadDashboardData(true);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    // =========================================================
    // 6. AUDIT LOGS CONTROLLER
    // =========================================================
    async loadAuditLogs() {
        try {
            const res = await API.getDashboardStats();
            if (res.success) {
                const logs = res.data.recent_activities || [];
                const timeline = document.getElementById('full-activity-timeline');
                if (timeline) {
                    timeline.innerHTML = logs.map(l => `
                        <div class="timeline-item">
                            <div class="timeline-marker">
                                <div class="timeline-dot"></div>
                                <div class="timeline-line"></div>
                            </div>
                            <div class="timeline-content">
                                <div class="timeline-action">${l.action_type}</div>
                                <div class="timeline-desc">${this.escapeHtml(l.description)}</div>
                                <div class="timeline-time">${this.formatDateTime(l.created_at)}</div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            console.error("Failed to load audit trail:", e);
        }
    }

    // =========================================================
    // MODALS & NOTIFICATIONS HELPERS
    // =========================================================
    closeModal(modalId) {
        document.getElementById(modalId)?.classList.remove('open');
    }

    closeAllModals() {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            'success': 'check-circle',
            'error': 'alert-triangle',
            'warning': 'alert-circle',
            'info': 'info'
        };

        toast.innerHTML = `
            <div class="toast-icon"><i data-feather="${icons[type] || 'info'}"></i></div>
            <div class="toast-message">${this.escapeHtml(message)}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;

        container.appendChild(toast);
        if (window.feather) feather.replace();

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    formatDateTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' +
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

// Global App Instance Initialization
window.app = new LibraryApp();
document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});
