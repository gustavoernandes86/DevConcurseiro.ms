require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Creates a backup of the studies database.
 * @param {string} [dbPath] - Path to the database file.
 * @param {string} [backupDir] - Path to the directory where backups will be stored.
 * @returns {Promise<string|null>} - Path to the created backup file, or null if source DB doesn't exist.
 */
async function backupDatabase(dbPath, backupDir) {
    if (!dbPath) {
        dbPath = process.env.DB_PATH || path.join(__dirname, '../data/estudos.db');
    }
    if (!backupDir) {
        backupDir = path.join(path.dirname(dbPath), 'backups');
    }

    // Resolve absolute paths
    const resolvedDbPath = path.resolve(dbPath);
    const resolvedBackupDir = path.resolve(backupDir);

    if (!fs.existsSync(resolvedDbPath)) {
        console.log(`[Backup] Source database file not found at ${resolvedDbPath}, skipping backup.`);
        return null;
    }

    if (!fs.existsSync(resolvedBackupDir)) {
        fs.mkdirSync(resolvedBackupDir, { recursive: true });
    }

    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const filename = `estudos-before-refactor-${timestamp}.db`;
    const destPath = path.join(resolvedBackupDir, filename);

    console.log(`[Backup] Backing up database to ${destPath}...`);
    let tempDb;
    try {
        tempDb = new Database(resolvedDbPath, { readonly: true });
        await tempDb.backup(destPath);
        console.log(`[Backup] Database backup completed successfully.`);
        return destPath;
    } catch (err) {
        console.warn(`[Backup] SQLite backup failed, trying file copy fallback:`, err.message);
        try {
            fs.copyFileSync(resolvedDbPath, destPath);
            console.log(`[Backup] Database backup (file copy fallback) completed successfully.`);
            return destPath;
        } catch (copyErr) {
            console.error(`[Backup] Backup failed completely:`, copyErr.message);
            throw copyErr;
        }
    } finally {
        if (tempDb) {
            tempDb.close();
        }
    }
}

// Run directly if executed as main module
if (require.main === module) {
    backupDatabase()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { backupDatabase };
