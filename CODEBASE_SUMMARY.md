# Tender Executive Dashboard - Codebase Summary

## 1. Project Overview

This repository is a React + TypeScript executive dashboard for monitoring tender participation and status data sourced from a Google Sheet. It also includes a Node.js Express backend proxy for secure Google Sheets access, attachment file handling, and local file indexing.

Key features:
- Live Google Sheet sync for tender master data
- Client-side filtering and dashboard visualization
- Server proxy and attachment route handling
- Excel costing sheet parsing and caching
- File and folder indexer support for tender-document mapping

---

## 2. High-Level Structure

### Root files
- `package.json` - project dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `index.html` - application shell and root mount point
- `main.tsx` - React entrypoint rendering `Dashboard`
- `server.js` - Express server and API entrypoint
- `global.d.ts` - TypeScript global definitions (if any)

### Key directories
- `pages/` - top-level page components
- `components/` - reusable UI components and styles
- `hooks/` - custom React hooks
- `services/` - business logic, data fetching, indexing, attachments
- `controllers/` - API route handlers for attachments/files
- `api/` - serverless endpoint definitions
- `types/` - TypeScript data models and enums
- `data/` - persisted JSON indexes and caches
- `excel_cache/` - local cache storage for downloaded Excel files

---

## 3. Main UI Flow

### `main.tsx`
- Imports `Dashboard` from `pages/Dashboard`
- Renders React app into the DOM root

### `pages/Dashboard.tsx`
- Central dashboard page and layout
- Uses `useTenderData` hook to fetch live tender records
- Maintains sidebar filters:
  - Client search
  - Status checkboxes
  - Engineer dropdown
  - Management decision dropdown
  - Value range
  - Price basis
  - Aluminium / Copper price ranges
- Creates a `TenderCalculations` instance for derived metrics
- Filters the dataset based on sidebar inputs
- Renders:
  - `FilterSidebar`
  - `AlertPanel`
  - `TenderTable`

### `hooks/useTenderData.ts`
- Custom hook returning:
  - `data`, `loading`, `error`, `refresh`
- Dual-mode architecture via `FETCH_MODE`
  - `proxy` (default): calls `/api/tenders`
  - `csv`: fetches public sheet CSV directly
- Caches results for 5 minutes in-memory
- Rehydrates JSON date strings into `Date` objects

---

## 4. Backend & API

### `server.js`
- Express server setup
- Loads `.env` variables manually
- Configures CORS and JSON parsing
- Registers `/api/tenders` route to server handler
- Registers attachment/files routes via `registerAttachmentRoutes`
- Implements internal Excel costing cache in `excel_cache`
- Contains `getCostingDetails(attachmentUrl, docketNo)` which:
  - Downloads or loads cached Excel file
  - Parses `AUTO CALCULATION SHEET (2)` worksheet
  - Extracts `Price Basis` and raw material rates
  - Dynamically scans rows for material header patterns
  - Extracts ERP item names and quantities

### `api/tenders.js`
- Google Sheets proxy endpoint logic
- Uses `GoogleSheetService` to fetch sheet data
- Handles response formatting and error propagation

### `controllers/tenderAttachmentController.js`
- Defines secure attachment/file routes and helpers
- Route methods:
  - `getTenderFiles(req, res)` - returns folder files for a docket
  - `getTenderFolderDetails(req, res)` - returns folder match metadata
  - `downloadFile(req, res)` - secure download streaming
  - `viewFile(req, res)` - secure inline preview for supported files
- Uses AES encryption for `fileId`
- Verifies paths against allowed roots to prevent traversal
- Uses basic token-style auth via `Authorization` header or query param

---

## 5. Services and Business Logic

### `services/googleSheetService.ts`
- Responsible for Google Sheets data fetch and parsing
- Supports two fetch paths:
  - `fetchTenderRecords()` using service account auth and the Google Sheets API
  - `fetchTenderRecordsViaCsv()` using public CSV export
- Includes helper methods:
  - `getAccessToken()` - JWT auth flow for Google OAuth2 token
  - `parseCsvText()` - custom CSV parser supporting quoted fields and escaped quotes
  - `processRawRows()` - schema validation and typed row conversion
- Joins costing attachment data via `AttachmentJoinService`

### `services/attachmentJoinService.ts`
- Performs a left join between tender records and costing attachment rows
- Normalizes keys for matching tender references
- Extracts attachment URLs and item categories
- Returns enriched `EpcTenderRecord[]`

### `services/tenderCalculations.ts`
- Provides calculation and dashboard metric helpers
- Includes:
  - `getPrimaryDataset()` - returns rawRecords directly (may be filter-ready)
  - `calculateMetrics(dataset)` - KPI overview totals and averages
  - `generateMonthlyTrend(dataset)` - counts and values by month
  - `generateStatusDistribution(dataset)` - classification into won/lost/evaluation/prep groups
  - `generateAlerts(dataset)` - likely creates actionable alert counts (not fully read yet)
- Uses enums from `types/tender.ts`

### `services/tenderFolderMatcher.js`
- Matches Google Sheet tenders against a folder index
- Maintains persistent JSON store at `data/tender_folder_matches.json`
- Handles:
  - matched vs unmatched tenders
  - duplicate folder conflict logging
  - storing match records atomically
- Exposes `getMatchingStatusApiHandler()` for API route composition

### `services/fileIndexer.js`
- Recursively indexes files in a root folder
- Ignores temporary Office lock files and `.tmp` files
- Persists metadata in `data/file_index.json`
- Detects duplicate file names during scanning
- Stores absolute path keyed file records with `relativePath`

### `services/documentIndexer.js` / `services/monitoringService.js` / `services/syncPipeline.js` / `services/mockDataGenerator.ts`
- These files are present in `services/` but not fully inspected in this summary.
- Likely contain auxiliary utilities for document scanning, monitoring, syncing, and demo/test data generation.

---

## 6. UI Components

### `components/FilterSidebar.tsx`
- Sidebar UI for filtering dataset
- Inputs for text, checkboxes, selects, numeric ranges
- Calls setState functions passed from `Dashboard`
- Includes `Refresh Dashboard` button

### `components/TenderTable.tsx`
- Data table rendering active tender records
- Likely supports row formatting, link actions, and sorting/scrolling

### `components/AlertPanel.tsx`
- Displays alert cards or KPI summaries
- Receives `alerts` data from `TenderCalculations`

### `components/ChartsSection.tsx`
- Likely renders trend charts or status distribution visuals
- May use canvas or SVG for charts

### `components/KpiSection.tsx`
- Likely displays top-level KPI widgets
- Probably uses metrics from `TenderCalculations`

### `components/AttachmentModal.tsx`
- Likely shows attachment previews or download links
- Connected to attachment controller APIs

### `components/FolderMonitorWidget.tsx`
- Likely tracks folder indexing or file watch status
- Connects folder matcher and indexing services

---

## 7. Types and Data Models

### `types/tender.ts`
- Defines enums for:
  - `TypeOfTender`
  - `ManagementDecision`
  - `CurrentStatus`
  - `EMDExchangeMode`
- Defines `EpcTenderRecord` interface with fields for:
  - tender metadata
  - submission & award dates
  - financial values and EMD details
  - participation and status values
  - attachment/enrichment fields
  - costing prices and additional item metadata

---

## 8. Data & Cache Files

### `data/`
- `boq_cache.json`
- `document_index.json`
- `file_index.json`
- `sync_logs.json`
- `tender_cache.json`
- `tender_folder_matches.json`
- `reports/` directory

These files store app data, indexes, logs, and persisted matching results.

### `excel_cache/`
- Stores downloaded costing Excel files used by `getCostingDetails`
- Includes a local TTL cache mechanism

---

## 9. Running the Project

Scripts from `package.json`:
- `npm run dev` - start Vite development server
- `npm run build` - compile TypeScript and build production bundle
- `npm run preview` - preview build locally

Important notes:
- `server.js` runs on Node.js and expects `.env` values for Google service account credentials
- The UI expects `/api/tenders` to be available for secure data fetch when `FETCH_MODE` is `proxy`
- Public CSV mode is available but requires the Google Sheet to be shareable

---

## 10. Summary of Responsibilities

- `main.tsx` / `pages/Dashboard.tsx` - app entry and dashboard layout
- `hooks/useTenderData.ts` - data fetching and caching
- `services/googleSheetService.ts` - Google Sheets integration and parsing
- `services/attachmentJoinService.ts` - join tender records with costing attachments
- `services/tenderCalculations.ts` - KPI, trend, and alert calculations
- `services/fileIndexer.js` - file system indexing and metadata persistence
- `services/tenderFolderMatcher.js` - map tender records to folder paths
- `controllers/tenderAttachmentController.js` - attachment and file-serving API
- `server.js` - Express startup, route registration, and Excel costing cache

---

## 11. Recommended Next Steps

1. Inspect `components/TenderTable.tsx`, `AlertPanel.tsx`, and `ChartsSection.tsx` for exact visual behavior.
2. Review `services/syncPipeline.js` and `services/documentIndexer.js` for end-to-end sync logic.
3. Confirm `.env` values and Google Sheet sharing configuration if the API is failing.
4. Consider modularizing `server.js` and service classes further for testability.
