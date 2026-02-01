const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'attendance.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        // Employees table
        db.run(`CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            rut TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            weekly_hours_agreed INTEGER DEFAULT 42,
            shift_start TEXT,
            shift_end TEXT,
            is_telework INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Raw Attendance Logs (Inalterable)
        db.run(`CREATE TABLE IF NOT EXISTS attendance_logs (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            event_type TEXT NOT NULL, -- ENTRY, LUNCH_START, LUNCH_END, EXIT
            timestamp TEXT NOT NULL, -- ISO Format, NO ROUNDING
            lat REAL,
            lng REAL,
            hash TEXT NOT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        )`);

        // Modification Requests (Audit Log with Worker Approval)
        db.run(`CREATE TABLE IF NOT EXISTS modification_requests (
            id TEXT PRIMARY KEY,
            original_log_id TEXT,
            employee_id TEXT NOT NULL,
            proposed_change_details TEXT NOT NULL,
            admin_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            worker_approval_status TEXT DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED
            approval_token TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees (id),
            FOREIGN KEY (original_log_id) REFERENCES attendance_logs (id)
        )`);

        // Calculated Working Days (For Reports)
        db.run(`CREATE TABLE IF NOT EXISTS working_days (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL, -- YYYY-MM-DD
            employee_id TEXT NOT NULL,
            actual_entry_time TEXT,
            actual_exit_time TEXT,
            lunch_minutes INTEGER DEFAULT 0,
            ordinary_minutes INTEGER DEFAULT 0,
            overtime_minutes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'PRESENT', -- PRESENT, ABSENT, LICENSE, VACATION
            observations TEXT,
            UNIQUE(date, employee_id),
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        )`);

        // Audit Log for Generic Actions
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            details TEXT,
            user_id TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

module.exports = db;
