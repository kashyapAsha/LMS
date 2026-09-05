-- ==========================================================
-- Library Management System (Library_Management_System) Schema
-- Database: library_management_system
-- Relational Schema with Constraints, Triggers & Sample Fixtures
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `library_management_system`
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `library_management_system`;

-- 1. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `description` VARCHAR(255) DEFAULT NULL,
    `icon` VARCHAR(50) DEFAULT 'book',
    `color` VARCHAR(30) DEFAULT '#6366f1',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. BOOKS TABLE
CREATE TABLE IF NOT EXISTS `books` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `isbn` VARCHAR(20) NOT NULL UNIQUE,
    `title` VARCHAR(255) NOT NULL,
    `author` VARCHAR(150) NOT NULL,
    `category_id` INT DEFAULT NULL,
    `publisher` VARCHAR(150) DEFAULT NULL,
    `publication_year` INT DEFAULT NULL,
    `total_copies` INT NOT NULL DEFAULT 1,
    `available_copies` INT NOT NULL DEFAULT 1,
    `shelf_location` VARCHAR(50) DEFAULT 'Section A',
    `description` TEXT DEFAULT NULL,
    `cover_color` VARCHAR(30) DEFAULT '#4f46e5',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
    INDEX `idx_books_isbn` (`isbn`),
    INDEX `idx_books_title` (`title`),
    INDEX `idx_books_author` (`author`),
    INDEX `idx_books_category` (`category_id`)
) ENGINE=InnoDB;

-- 3. MEMBERS TABLE
CREATE TABLE IF NOT EXISTS `members` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `member_code` VARCHAR(30) NOT NULL UNIQUE,
    `full_name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `phone` VARCHAR(30) NOT NULL,
    `address` VARCHAR(255) DEFAULT NULL,
    `membership_type` ENUM('Student', 'Faculty', 'Standard', 'Premium') DEFAULT 'Student',
    `max_books_allowed` INT DEFAULT 3,
    `status` ENUM('Active', 'Suspended', 'Expired') DEFAULT 'Active',
    `joined_date` DATE NOT NULL,
    `expiry_date` DATE DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_members_code` (`member_code`),
    INDEX `idx_members_email` (`email`),
    INDEX `idx_members_status` (`status`)
) ENGINE=InnoDB;

-- 4. LOANS (CIRCULATION) TABLE
CREATE TABLE IF NOT EXISTS `loans` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `loan_code` VARCHAR(40) NOT NULL UNIQUE,
    `book_id` INT NOT NULL,
    `member_id` INT NOT NULL,
    `issue_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `return_date` DATE DEFAULT NULL,
    `status` ENUM('ISSUED', 'RETURNED', 'OVERDUE', 'LOST') DEFAULT 'ISSUED',
    `renew_count` INT DEFAULT 0,
    `notes` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE RESTRICT,
    INDEX `idx_loans_status` (`status`),
    INDEX `idx_loans_due_date` (`due_date`),
    INDEX `idx_loans_member` (`member_id`),
    INDEX `idx_loans_book` (`book_id`)
) ENGINE=InnoDB;

-- 5. FINES TABLE
CREATE TABLE IF NOT EXISTS `fines` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `loan_id` INT NOT NULL,
    `member_id` INT NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `fine_rate_per_day` DECIMAL(6, 2) NOT NULL DEFAULT 1.00,
    `days_overdue` INT NOT NULL DEFAULT 0,
    `status` ENUM('UNPAID', 'PAID', 'WAIVED') DEFAULT 'UNPAID',
    `paid_amount` DECIMAL(10, 2) DEFAULT 0.00,
    `payment_date` DATE DEFAULT NULL,
    `notes` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE,
    INDEX `idx_fines_status` (`status`),
    INDEX `idx_fines_member` (`member_id`)
) ENGINE=InnoDB;

-- 6. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS `activity_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `action_type` VARCHAR(50) NOT NULL,
    `description` TEXT NOT NULL,
    `entity_type` VARCHAR(50) DEFAULT NULL,
    `entity_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==========================================================
-- INITIAL SEED DATA
-- ==========================================================

-- Categories Seed
INSERT INTO `categories` (`id`, `name`, `description`, `icon`, `color`) VALUES
(1, 'Computer Science', 'Programming, Algorithms, Software Engineering & Systems', 'code', '#6366f1'),
(2, 'Artificial Intelligence', 'Machine Learning, Deep Learning, NLP & Robotics', 'cpu', '#8b5cf6'),
(3, 'Classic Literature', 'Timeless masterpieces of world prose and drama', 'feather', '#ec4899'),
(4, 'Science & Physics', 'Astrophysics, Quantum Mechanics, Biology & Chemistry', 'atom', '#06b6d4'),
(5, 'Mathematics', 'Calculus, Linear Algebra, Statistics & Topology', 'percent', '#3b82f6'),
(6, 'History & Philosophy', 'World civilizations, ancient histories and philosophical thought', 'landmark', '#f59e0b'),
(7, 'Business & Finance', 'Economics, Management, Startups and Investing', 'trending-up', '#10b981'),
(8, 'Psychology & Growth', 'Cognitive science, human behavior and personal development', 'smile', '#14b8a6')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- Books Seed
INSERT INTO `books` (`id`, `isbn`, `title`, `author`, `category_id`, `publisher`, `publication_year`, `total_copies`, `available_copies`, `shelf_location`, `description`, `cover_color`) VALUES
(1, '978-0132350884', 'Clean Code: A Handbook of Agile Software Craftsmanship', 'Robert C. Martin', 1, 'Prentice Hall', 2008, 5, 4, 'Rack CS-01', 'Even bad code can function. But if code is not clean, it can bring a development organization to its knees.', '#3b82f6'),
(2, '978-0262033848', 'Introduction to Algorithms (4th Edition)', 'Thomas H. Cormen, Charles E. Leiserson', 1, 'MIT Press', 2022, 4, 3, 'Rack CS-02', 'Comprehensive and definitive guide to the modern study of computer algorithms.', '#6366f1'),
(3, '978-1491957660', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 1, 'O''Reilly Media', 2017, 6, 4, 'Rack CS-03', 'The big ideas behind reliable, scalable, and maintainable data systems.', '#0ea5e9'),
(4, '978-0262035613', 'Deep Learning', 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', 2, 'MIT Press', 2016, 4, 2, 'Rack AI-01', 'An introduction to a broad range of topics in deep learning, covering mathematical and conceptual background.', '#8b5cf6'),
(5, '978-1492032649', 'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow', 'Aurélien Géron', 2, 'O''Reilly Media', 2022, 5, 5, 'Rack AI-02', 'Through a series of recent breakthroughs, deep learning has boosted the entire field of machine learning.', '#a855f7'),
(6, '978-0141439518', 'Pride and Prejudice', 'Jane Austen', 3, 'Penguin Classics', 1813, 3, 2, 'Rack LIT-01', 'A romantic novel of manners written by Jane Austen in 1813, following the character development of Elizabeth Bennet.', '#ec4899'),
(7, '978-0451524935', '1984', 'George Orwell', 3, 'Signet Classic', 1949, 7, 5, 'Rack LIT-02', 'A dystopian social science fiction novel and cautionary tale about totalitarianism, surveillance, and repression.', '#f43f5e'),
(8, '978-0553380163', 'A Brief History of Time', 'Stephen Hawking', 4, 'Bantam Books', 1988, 4, 3, 'Rack SCI-01', 'Hawking writes in non-technical terms about the structure, origin, development and eventual fate of the Universe.', '#06b6d4'),
(9, '978-0465024759', 'The Feynman Lectures on Physics', 'Richard P. Feynman', 4, 'Basic Books', 2011, 3, 3, 'Rack SCI-02', 'Legendary physics lectures delivered by Nobel laureate Richard Feynman.', '#0284c7'),
(10, '978-0199205882', 'The Princeton Companion to Mathematics', 'Timothy Gowers', 5, 'Princeton University Press', 2008, 2, 2, 'Rack MATH-01', 'An extensive, one-volume guide to some of the most profound ideas and branches in mathematics.', '#2563eb'),
(11, '978-0062316097', 'Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 6, 'Harper', 2015, 6, 4, 'Rack HIST-01', 'A groundbreaking narrative of humanity’s creation and evolution, from prehistoric hunter-gatherers to modern era.', '#f59e0b'),
(12, '978-0735211292', 'Atomic Habits', 'James Clear', 8, 'Avery', 2018, 8, 6, 'Rack PSY-01', 'An easy and proven way to build good habits and break bad ones.', '#10b981'),
(13, '978-0062457714', 'The Subtle Art of Not Giving a F*ck', 'Mark Manson', 8, 'HarperOne', 2016, 4, 4, 'Rack PSY-02', 'A counterintuitive approach to living a good life with resilience and focus.', '#14b8a6'),
(14, '978-0857197689', 'The Psychology of Money', 'Morgan Housel', 7, 'Harriman House', 2020, 5, 3, 'Rack FIN-01', 'Timeless lessons on wealth, greed, and happiness doing well with money.', '#059669'),
(15, '978-0321125217', 'Domain-Driven Design: Tackling Complexity in the Heart of Software', 'Eric Evans', 1, 'Addison-Wesley', 2003, 3, 2, 'Rack CS-04', 'Systematic approach to domain-driven design for complex systems.', '#4338ca')
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`);

-- Members Seed
INSERT INTO `members` (`id`, `member_code`, `full_name`, `email`, `phone`, `address`, `membership_type`, `max_books_allowed`, `status`, `joined_date`, `expiry_date`) VALUES
(1, 'LIB-M1001', 'Alexander Wright', 'alex.wright@university.edu', '+1 (555) 234-5678', '402 Campus Dr, Boston, MA', 'Faculty', 10, 'Active', '2025-01-15', '2027-01-15'),
(2, 'LIB-M1002', 'Sophia Chen', 'sophia.chen@techmail.com', '+1 (555) 876-5432', '120 Silicon Ave, Cambridge, MA', 'Student', 5, 'Active', '2025-03-01', '2026-03-01'),
(3, 'LIB-M1003', 'Liam Rodriguez', 'liam.rodriguez@gmail.com', '+1 (555) 345-6789', '88 Beacon St, Boston, MA', 'Premium', 8, 'Active', '2025-02-10', '2026-02-10'),
(4, 'LIB-M1004', 'Emily Watson', 'emily.watson@libraryhub.org', '+1 (555) 901-2345', '14 Elm Road, Somerville, MA', 'Standard', 3, 'Active', '2025-04-18', '2026-04-18'),
(5, 'LIB-M1005', 'Marcus Vance', 'marcus.vance@stateu.edu', '+1 (555) 456-7890', '710 Harvard St, Brookline, MA', 'Student', 5, 'Active', '2025-05-05', '2026-05-05'),
(6, 'LIB-M1006', 'Olivia Taylor', 'olivia.t@outlook.com', '+1 (555) 678-1234', '25 Commonwealth Ave, Boston, MA', 'Student', 5, 'Suspended', '2025-01-20', '2026-01-20'),
(7, 'LIB-M1007', 'Daniel Kim', 'daniel.kim@mit.alum.edu', '+1 (555) 789-4321', '330 Memorial Dr, Cambridge, MA', 'Faculty', 10, 'Active', '2025-02-22', '2027-02-22')
ON DUPLICATE KEY UPDATE `full_name`=VALUES(`full_name`);

-- Loans Seed
INSERT INTO `loans` (`id`, `loan_code`, `book_id`, `member_id`, `issue_date`, `due_date`, `return_date`, `status`, `renew_count`, `notes`) VALUES
(1, 'LN-2026-0001', 1, 1, '2026-02-10', '2026-02-24', '2026-02-22', 'RETURNED', 0, 'Returned in excellent condition'),
(2, 'LN-2026-0002', 4, 2, '2026-02-15', '2026-03-01', NULL, 'OVERDUE', 0, 'Semester project reference'),
(3, 'LN-2026-0003', 2, 3, '2026-02-28', '2026-03-14', NULL, 'ISSUED', 1, 'Extended 14 days'),
(4, 'LN-2026-0004', 7, 4, '2026-02-18', '2026-03-04', NULL, 'OVERDUE', 0, 'Book club reading'),
(5, 'LN-2026-0005', 11, 5, '2026-03-01', '2026-03-15', NULL, 'ISSUED', 0, 'General reading loan'),
(6, 'LN-2026-0006', 14, 2, '2026-03-02', '2026-03-16', NULL, 'ISSUED', 0, 'Course supplement')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- Fines Seed
INSERT INTO `fines` (`id`, `loan_id`, `member_id`, `amount`, `fine_rate_per_day`, `days_overdue`, `status`, `paid_amount`, `payment_date`, `notes`) VALUES
(1, 2, 2, 4.00, 1.00, 4, 'UNPAID', 0.00, NULL, '4 days overdue for Deep Learning'),
(2, 4, 4, 1.00, 1.00, 1, 'UNPAID', 0.00, NULL, '1 day overdue for 1984')
ON DUPLICATE KEY UPDATE `amount`=VALUES(`amount`);

-- Activity Logs Seed
INSERT INTO `activity_logs` (`action_type`, `description`, `entity_type`, `entity_id`) VALUES
('SYSTEM_INIT', 'Library Management System initialized with default catalogs and rules', 'SYSTEM', 1),
('BOOK_ADDED', 'Added book: Clean Code (Robert C. Martin)', 'BOOK', 1),
('MEMBER_REGISTERED', 'Registered faculty member: Alexander Wright', 'MEMBER', 1),
('BOOK_ISSUED', 'Issued "Deep Learning" to Sophia Chen', 'LOAN', 2),
('BOOK_RETURNED', 'Loan #LN-2026-0001 returned on time', 'LOAN', 1);
