/**
 * Athena Library Management System - REST API Client
 */

const API = {
    async request(url, options = {}) {
        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                ...options
            };
            
            if (config.body && typeof config.body === 'object') {
                config.body = JSON.stringify(config.body);
            }

            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok || data.success === false) {
                throw new Error(data.error || `HTTP error ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error [${url}]:`, error);
            throw error;
        }
    },

    // Dashboard
    getDashboardStats() {
        return this.request('/api/dashboard/stats');
    },

    getDashboardCharts() {
        return this.request('/api/dashboard/charts');
    },

    // Books
    getBooks(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/books?${query}`);
    },

    getBookDetails(id) {
        return this.request(`/api/books/${id}`);
    },

    addBook(bookData) {
        return this.request('/api/books', {
            method: 'POST',
            body: bookData
        });
    },

    updateBook(id, bookData) {
        return this.request(`/api/books/${id}`, {
            method: 'PUT',
            body: bookData
        });
    },

    deleteBook(id) {
        return this.request(`/api/books/${id}`, {
            method: 'DELETE'
        });
    },

    getCategories() {
        return this.request('/api/categories');
    },

    // Members
    getMembers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/members?${query}`);
    },

    getMemberProfile(id) {
        return this.request(`/api/members/${id}`);
    },

    registerMember(memberData) {
        return this.request('/api/members', {
            method: 'POST',
            body: memberData
        });
    },

    updateMember(id, memberData) {
        return this.request(`/api/members/${id}`, {
            method: 'PUT',
            body: memberData
        });
    },

    deleteMember(id) {
        return this.request(`/api/members/${id}`, {
            method: 'DELETE'
        });
    },

    // Circulation (Loans)
    getLoans(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/loans?${query}`);
    },

    issueBook(issueData) {
        return this.request('/api/loans/issue', {
            method: 'POST',
            body: issueData
        });
    },

    returnBook(loanId, returnData = {}) {
        return this.request(`/api/loans/${loanId}/return`, {
            method: 'POST',
            body: returnData
        });
    },

    renewLoan(loanId) {
        return this.request(`/api/loans/${loanId}/renew`, {
            method: 'POST'
        });
    },

    // Fines
    getFines(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/fines?${query}`);
    },

    payFine(fineId, notes = '') {
        return this.request(`/api/fines/${fineId}/pay`, {
            method: 'POST',
            body: { notes }
        });
    },

    waiveFine(fineId, reason = '') {
        return this.request(`/api/fines/${fineId}/waive`, {
            method: 'POST',
            body: { reason }
        });
    }
};

window.API = API;
