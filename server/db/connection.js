const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Resolve database path relative to cwd if environment variable is set, otherwise resolve from current file
const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '../../data/estudos.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

console.log(`[Database] Connected to SQLite database at: ${DB_PATH}`);

module.exports = db;
