/**
 * IRIEEN Library Management System - Landing & Login Controller
 * Institution: Indian Railways Institute of Electrical Engineering
 */

(function () {
    'use strict';

    // Demo/Development Auth Configuration (isolated for easy upgrade to backend DB auth)
    const AUTH_CONFIG = {
        VALID_USERNAME: 'test_1',
        VALID_PASSWORD: '123456',
        REDIRECT_TARGET: '/dashboard'
    };

    document.addEventListener('DOMContentLoaded', () => {
        // Initialize Feather icons
        if (window.feather) {
            feather.replace();
        }

        const loginForm = document.getElementById('login-form');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const togglePasswordBtn = document.getElementById('btn-toggle-password');
        const submitBtn = document.getElementById('btn-submit-login');
        const errorAlert = document.getElementById('login-error-alert');
        const errorMessage = document.getElementById('login-error-message');

        // Check if user is already authenticated in this session
        const existingSession = sessionStorage.getItem('irieen_user');
        if (existingSession) {
            try {
                const user = JSON.parse(existingSession);
                if (user && user.username) {
                    console.log("Active session found, redirecting to dashboard...");
                    window.location.href = AUTH_CONFIG.REDIRECT_TARGET;
                    return;
                }
            } catch (e) {
                sessionStorage.removeItem('irieen_user');
            }
        }

        // Show/Hide Password Toggle
        if (togglePasswordBtn && passwordInput) {
            togglePasswordBtn.addEventListener('click', () => {
                const isPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

                const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
                const eyeOffIcon = togglePasswordBtn.querySelector('.eye-off-icon');

                if (eyeIcon && eyeOffIcon) {
                    eyeIcon.style.display = isPassword ? 'none' : 'inline-block';
                    eyeOffIcon.style.display = isPassword ? 'inline-block' : 'none';
                }

                togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
                if (window.feather) feather.replace();
            });
        }

        // Auto Fill Demo Credentials
        const autofillBtn = document.getElementById('btn-autofill');
        if (autofillBtn && usernameInput && passwordInput) {
            autofillBtn.addEventListener('click', () => {
                usernameInput.value = AUTH_CONFIG.VALID_USERNAME;
                passwordInput.value = AUTH_CONFIG.VALID_PASSWORD;
                hideError();
                passwordInput.focus();
            });
        }

        // Helper to display friendly error messages
        function showError(msg) {
            if (errorMessage) {
                errorMessage.textContent = msg || 'Invalid username or password.';
            }
            if (errorAlert) {
                errorAlert.classList.add('show');
            }
        }

        function hideError() {
            if (errorAlert) {
                errorAlert.classList.remove('show');
            }
        }

        // Clear error on input change
        usernameInput?.addEventListener('input', hideError);
        passwordInput?.addEventListener('input', hideError);

        // Handle Login Submission
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            // 1. Validation for empty inputs
            if (!username || !password) {
                showError('Please enter both username and password.');
                if (!username) {
                    usernameInput?.focus();
                } else {
                    passwordInput?.focus();
                }
                return;
            }

            // Set button loading state
            if (submitBtn) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
                const btnText = submitBtn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'Authenticating...';
            }

            try {
                // First attempt backend API login
                let authenticated = false;
                let userData = null;

                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ username, password })
                    });

                    const data = await response.json();
                    if (response.ok && data.success) {
                        authenticated = true;
                        userData = data.user || { username, role: 'Administrator', name: 'IRIEEN Library Admin' };
                    }
                } catch (networkErr) {
                    console.warn("Backend auth endpoint unreachable, falling back to local auth validation:", networkErr);
                }

                // Fallback verification against isolated AUTH_CONFIG
                if (!authenticated) {
                    if (username === AUTH_CONFIG.VALID_USERNAME && password === AUTH_CONFIG.VALID_PASSWORD) {
                        authenticated = true;
                        userData = {
                            username: AUTH_CONFIG.VALID_USERNAME,
                            role: 'Administrator',
                            name: 'IRIEEN Library Admin'
                        };
                    }
                }

                if (authenticated) {
                    // Store authenticated session
                    sessionStorage.setItem('irieen_user', JSON.stringify({
                        ...userData,
                        loginTime: new Date().toISOString()
                    }));

                    // Successful transition to dashboard
                    if (submitBtn) {
                        const btnText = submitBtn.querySelector('.btn-text');
                        if (btnText) btnText.textContent = 'Success! Opening Portal...';
                    }

                    setTimeout(() => {
                        window.location.href = AUTH_CONFIG.REDIRECT_TARGET;
                    }, 400);
                } else {
                    showError('Invalid username or password.');
                    passwordInput.value = '';
                    passwordInput.focus();

                    if (submitBtn) {
                        submitBtn.classList.remove('loading');
                        submitBtn.disabled = false;
                        const btnText = submitBtn.querySelector('.btn-text');
                        if (btnText) btnText.textContent = 'Sign In to Library Portal';
                    }
                }
            } catch (err) {
                console.error("Login process error:", err);
                showError('Invalid username or password.');

                if (submitBtn) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                    const btnText = submitBtn.querySelector('.btn-text');
                    if (btnText) btnText.textContent = 'Sign In to Library Portal';
                }
            }
        });
    });
})();
