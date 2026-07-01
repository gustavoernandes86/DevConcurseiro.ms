const fs = require('fs');
const path = require('path');
const db = require('./connection');
const { backupDatabase } = require('../../tools/backup');

/**
 * Reads and applies pending migrations from the migrations directory.
 */
async function runMigrations() {
    console.log('[Migration] Starting migrations check...');

    // 1. Ensure schema_migrations table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        );
    `);

    // 2. Scan migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.log('[Migration] No migrations directory found. Creating directory.');
        fs.mkdirSync(migrationsDir, { recursive: true });
        return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Sort to apply migrations in version order

    if (migrationFiles.length === 0) {
        console.log('[Migration] No migration files found.');
        return;
    }

    // 3. Find already applied migrations
    const appliedRows = db.prepare('SELECT version FROM schema_migrations').all();
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    // Determine pending migrations
    const pendingMigrations = [];
    for (const file of migrationFiles) {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
            console.warn(`[Migration] Warning: File name '${file}' does not follow migration format 'XXX_name.sql', skipping.`);
            continue;
        }
        const version = parseInt(match[1], 10);
        if (!appliedVersions.has(version)) {
            pendingMigrations.push({ version, name: file, filePath: path.join(migrationsDir, file) });
        }
    }

    if (pendingMigrations.length === 0) {
        console.log('[Migration] Database is up to date. No pending migrations.');
        return;
    }

    console.log(`[Migration] Found ${pendingMigrations.length} pending migrations.`);

    // 4. Trigger database backup before running migrations
    try {
        const dbPath = db.name; // better-sqlite3 connection object exposes `.name` as the database filepath
        await backupDatabase(dbPath);
    } catch (backupErr) {
        console.error('[Migration] Failed to create database backup before migrating. Migration aborted to prevent data loss.', backupErr.message);
        throw backupErr;
    }

    // 5. Execute each pending migration in a transaction
    for (const migration of pendingMigrations) {
        console.log(`[Migration] Applying migration ${migration.name}...`);
        const sql = fs.readFileSync(migration.filePath, 'utf8');

        const transaction = db.transaction(() => {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
                .run(migration.version, migration.name, Date.now());
        });

        try {
            transaction();
            console.log(`[Migration] Migration ${migration.name} applied successfully.`);
        } catch (err) {
            console.error(`[Migration Error] Failed to apply migration ${migration.name}:`, err.message);
            throw err;
        }
    }

    console.log('[Migration] All migrations completed successfully.');
}

// Run directly if executed as main module
if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { runMigrations };
