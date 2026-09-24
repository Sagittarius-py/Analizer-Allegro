# Allegro Profit Analyzer — Standalone Desktop Application

A fully-local, no-server Electron desktop app for importing and analyzing Allegro CSV exports.

Production (Standalone Exe)
```bash
# Build and package into exe
npm run build

# The exe will be in dist/ folder
# Run it directly without any servers
dist/Allegro-Profit-Analyzer.exe
```

## Key Features

- **100% Local**: SQLite database stored in `%APPDATA%/Local/Allegro Profit Analyzer`
- **No Network**: Fully functional offline, works as standalone exe
- **Responsive UI**: React + TypeScript + TailwindCSS
- **Import**: Drag & drop CSV files, auto-backup option
- **Dashboard**: Metrics summary and recent imports
- **Orders**: Searchable order list with details
- **Settings**: Database export and backup management
