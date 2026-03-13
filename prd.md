# Product Requirements Document (PRD)

## OTA Receivables & Payables — Finance Reconciliation App

**Tech stack:** Next.js 14 · React 18 · Tailwind CSS · Supabase (auth, database, storage) · XLSX library · Recharts (installed but not actively used yet)

---

## 1. Authentication & Authorization

### 1.1 Login (`/login`)
- Email + password sign-in via `supabase.auth.signInWithPassword`.
- Error display on invalid credentials.
- Loading state while authenticating.
- Redirects to `/data` on success.

### 1.2 Sign-up (`/signup`)
- Email + password registration via `supabase.auth.signUp`.
- **Domain restriction**: only `@zuzuhs.com` email addresses are accepted (client-side check).
- Password minimum length: 6 characters.
- Success screen with email verification prompt; auto-redirect to `/login` after 2 seconds.

### 1.3 Landing page (`/`)
- If user is already authenticated, redirects to `/data`.
- If not, shows Sign In / Create Account links.
- Auth state listener (`onAuthStateChange`) keeps session in sync.

### 1.4 Session management (all pages)
- Every authenticated page checks `supabase.auth.getSession()` on mount.
- Unauthenticated users are redirected to `/login`.
- Sign Out button calls `supabase.auth.signOut()` and redirects to `/`.
- Auth state listener on every page for real-time session changes.

### 1.5 Auth timeout handling (Data page)
- If `getSession()` takes longer than 12 seconds, shows a "session check is taking longer than usual" message with a link to the login page, instead of showing an infinite spinner.

---

## 2. Navigation

### 2.1 Top navigation bar (`TopNav`)
- Sticky at the top of the page (`z-50`).
- ZUZU logo linking to `/data`.
- Navigation tabs: **Bookings**, **Uploads**, **Edits**, **Dashboard**, **Settings**, **Properties**.
- Active page tab is grayed out and non-clickable.
- Right-side content slot (`HeaderRightContext`) — each page injects its own action buttons (Upload Excel, Download CSV, Filters, user email, Sign Out, etc.).

### 2.2 HeaderRightContext
- React Context + Provider that lets each page set custom content in the top-right area of the nav bar.
- Used to keep the nav component generic while allowing page-specific actions.

---

## 3. Bookings Data Page (`/data`)

This is the main page of the application. It displays the `bookings` table with extensive features.

### 3.1 Table display
- Fetches data from Supabase `bookings` table.
- Paginated display: 100 rows per page.
- Server-side pagination with total record count.
- Columns are dynamically discovered from the database schema.
- Formatted column names (e.g., `payment_request_date` → "Payment Request Date").

### 3.2 Sticky columns
- When viewing the `bookings` table, five columns are frozen (sticky) on the left for horizontal scrolling:
  - `hms_id` (90px)
  - `hotel_name` (150px)
  - `country` (80px)
  - `channel_booking_confirmation_number` (140px)
  - `arrival_date` (100px)
- Last sticky column has a drop shadow for visual separation.

### 3.3 Column styling
- **Gray columns** — read-only booking information (imported from Excel).
- **Green columns** — editable reconciliation fields: `payment_request_date`, `total_amount_submitted`, `amount_received`, `payment_gateway_fees`, `tax_amount_deducted`, `total_amount_received`, `total_payment_gateway_fees`, `payment_date`, `payment_method`, `transmission_queue_id`, `reference_number`, `vcc_number`, `expiry_date`, `cvc`, `remarks`, `net_of_demand_commission_amount_extranet`.
- **Blue columns** — computed/formula columns (read-only, auto-calculated):
  - `balance`
  - `reconciled_amount_check`
  - `variance_check`
  - `balance_before_reference_dates`
  - `balance_before_reference_date_in_sgd`
- **Yellow** — `payment_method` dropdown cell.
- Currency columns are right-aligned and formatted with 2 decimal places + thousands separators.
- Numeric columns are right-aligned.
- Date columns formatted as `YYYY-MM-DD`.
- Timestamps formatted as `YYYY-MM-DD HH:MM:SS`.

### 3.4 Inline cell editing
- Double-click on any **green** (editable) cell to enter edit mode.
- Pressing Enter or clicking outside saves the value.
- Pressing Escape cancels.
- Date columns normalize input (handles ISO, DD/MM/YYYY, Excel serial numbers).
- `payment_method` shows a dropdown with options: BT, VCC, Inactive, Inactive OTA, Unknown.
- After saving, formula columns (`balance`, `reconciled_amount_check`, etc.) are **recomputed** and stored.
- Every cell edit is logged to the `edit_history` table with: table name, row ID, column name, old value, new value, editor email, timestamp, and a human-readable row display string.
- **Payment date reminder**: if `amount_received` is set but `payment_date` is missing, the cell is highlighted in red.

### 3.5 Row detail / edit modal
- Click the Edit icon on a row to open a modal.
- **Modal — edit mode**:
  - "Booking Information" section (read-only).
  - "Reconciliation Information" section (editable fields).
  - Formula columns shown read-only.
  - Save updates the row and logs changes to `edit_history`.
- **Modal — add mode**:
  - "Add row" button opens an empty form.
  - All fields are editable.
  - Inserts a new row and refreshes the table.

### 3.6 Computed / formula columns
- `balance` = `net_amount_by_zuzu` − `amount_received` − `payment_gateway_fees` − `tax_amount_deducted`
- `reconciled_amount_check` = `total_amount_submitted` − `total_amount_received` − `total_payment_gateway_fees`
- `balance_before_reference_dates`: same as balance, but only subtracts `amount_received` and `payment_gateway_fees` when `payment_date <= reference_date`.
- `balance_before_reference_date_in_sgd` = `balance_before_reference_dates` / `rate_to_sgd` (currency conversion using rates from the `currency` table).
- Formulas are computed client-side on display and persisted to the database on every save.

### 3.7 Multi-cell selection
- Click a cell to select it (orange ring).
- Shift+click to extend selection within the same column.
- Selection shows a hint bar with copy/paste instructions and a "Clear selection" button.
- Delete/Backspace clears editable cells in the selection (with confirmation for >5 cells).

### 3.8 Copy & paste
- **Copy** (Ctrl+C): copies selected cell(s) as tab-separated values to clipboard.
- **Paste** (Ctrl+V):
  - Uses `navigator.clipboard.readText` when available.
  - Splits pasted text by newlines and applies to consecutive cells in the selection.
  - Supports pasting a single value into a range (fills all selected cells).
  - Supports pasting multiple values into consecutive cells starting from the anchor.
- **Fallback modal**: on HTTP (no clipboard API), shows a textarea modal where the user can paste and click Apply.

### 3.9 Filtering
- **Text filters**: case-insensitive `ilike` search; numeric columns use exact `eq`.
- **Multi-select filters**: dropdown with checkboxes for: `country`, `channel`, `zuzu_managing_channel_invoicing`, `status`, `currency`, `payment_method`.
  - Select all / Unselect all buttons.
  - Distinct values fetched from all rows (unfiltered) so options are always complete.
- **Date range filters**: From/To date inputs for date columns (except `expiry_date`). Rendered via portal to avoid clipping.
- Pending filter values are staged; "Apply" button commits them and refetches data.
- "Clear" resets all filters.
- Filter button shows active filter count badge.
- **Filter persistence**: filters and sort are saved per user per page in `localStorage` and restored on next visit.

### 3.10 Sorting
- Click column header to sort ascending; click again for descending.
- Sort icons in headers; active sort highlighted in orange.
- Server-side sorting via Supabase `.order()`.
- Sort preference persisted in `localStorage`.

### 3.11 Pagination
- 100 rows per page.
- Separate page tracking for filtered vs. unfiltered views.
- "Previous" / "Next" page navigation.
- "Load more" button to append next page of rows.
- Total row count and page numbers displayed.

### 3.12 Excel upload
- **Trigger**: "Upload Excel" button in nav, or URL param `?openUpload=1`.
- **Accepted formats**: `.xlsx`, `.xls`, `.csv`.
- **Multi-sheet handling**: if the Excel file has multiple sheets, a sheet selector modal is shown.
- **Upload phases** (with progress indicator):
  1. `parsing` — reads file with XLSX library.
  2. `checking_duplicates` — compares `zuzu_room_confirmation_number` against existing rows.
  3. `preparing` — maps Excel columns to database columns.
  4. `inserting` — batch inserts rows into `bookings` table.
  5. `linking` — associates inserted rows with `upload_history` via `upload_id`.
  6. `saving_file` — stores the original Excel file in Supabase Storage (`upload-files` bucket).
- **Post-insert**: creates an `upload_history` record with file name, sheet name, row count, uploader email, arrival date range, and booking IDs.
- **Date normalization**: handles ISO dates, DD/MM/YYYY, and Excel serial numbers.

### 3.13 Duplicate detection during upload
- During upload, compares `zuzu_room_confirmation_number` from the Excel file to existing bookings.
- Shows a duplicate modal with:
  - Total rows in the sheet.
  - Number of rows filtered out (missing confirmation number).
  - Number of duplicates found.
  - Number of new rows that will be imported.
- User can **Accept** (import only non-duplicates) or **Refuse** (cancel the entire upload).

### 3.14 Upload cancellation
- "Stop upload" button shown during upload progress.
- Sets `uploadCancelledRef` flag; checked after each phase.
- If cancelled, calls `rollbackUpload` which deletes the `upload_history` entry and all inserted bookings.
- Shows "Upload stopped. No data was saved."

### 3.15 CSV download / export
- "Download CSV" button in nav bar.
- Exports all bookings (or filtered subset) matching the current filters.
- Fetches in batches of 1,000 rows.
- Uses proper CSV escaping (quotes fields containing commas, quotes, or newlines).
- Filename format: `bookings_YYYY-MM-DD_HH-mm-ss.csv`.
- Downloads via `Blob` + anchor tag.
- Disabled with "Downloading..." label while in progress.

### 3.16 Reference date & currency conversion
- Loads `reference_date` from `app_settings` (id=1).
- Loads exchange rates from `currency` table.
- Used to compute `balance_before_reference_dates` and `balance_before_reference_date_in_sgd`.

### 3.17 Data load error handling
- If data fetching fails or times out, shows an error message with a retry option instead of an infinite spinner.

---

## 4. Upload History Page (`/uploads`)

### 4.1 Upload list
- Displays all entries from the `upload_history` table, ordered by `uploaded_at` descending.
- Columns: ID, File Name, Sheet, Rows, Uploaded By, Uploaded At, Arrival Dates, Actions.

### 4.2 Upload details
- Shows arrival date range (`arrival_date_min` → `arrival_date_max`).
- Row count with badge.
- Timestamps formatted as `YYYY-MM-DD HH:MM:SS`.
- Total uploads count in footer, with breakdown of active vs. cancelled.
- Total rows imported (active uploads only).

### 4.3 Delete upload (soft delete)
- Confirmation prompt with file name, sheet, and row count.
- Deletes all bookings associated with the upload (`DELETE FROM bookings WHERE upload_id = ?`).
- Marks the upload as cancelled (`cancelled_at` timestamp) — keeps it visible in the list but grayed out.
- Cancelled uploads cannot be deleted again.

### 4.4 Download original file
- If `file_storage_path` exists, shows a "Download" button.
- Creates a signed URL (1-hour expiry) from Supabase Storage and opens it in a new tab.
- Only available for uploads made after the file storage feature was added.

### 4.5 Navigation to upload
- "Upload Excel" button in the top nav redirects to `/data?openUpload=1`.

---

## 5. Edit History Page (`/history`)

### 5.1 Edit log
- Displays all entries from the `edit_history` table, ordered by `edited_at` descending.
- Columns: When, Who, Row, Column, Old value, New value, Actions.
- Only tracks manual edits on green (reconciliation) columns — Excel uploads are not included.
- Column names are mapped to human-readable display names.
- Numeric columns are right-aligned.

### 5.2 Undo / revert
- "Undo" button reverts a specific edit:
  - Loads the current row from the database.
  - Sets the column back to its old value.
  - Recomputes formula columns (`balance`, `reconciled_amount_check`, `balance_before_reference_dates`, `balance_before_reference_date_in_sgd`).
  - Marks the edit as `undone_at` with `undone_by` in `edit_history`.
- Reverted edits show "Reverted by [email] on [timestamp]" instead of the Undo button.

### 5.3 Filtering
- **Date range filter**: "When" (edited_at) — From/To date picker rendered via portal.
- **Multi-select filters**: "Who" (edited_by) and "Column" (column_name) — checkboxes.
- **Text filters**: "Row" (row_display), "Old value", "New value" — case-insensitive search.
- Apply / Clear buttons.
- Filter persistence in `localStorage`.

### 5.4 Pagination
- 100 edits per page.
- "Load more" button.
- Previous / Next page navigation.
- Total edit count displayed.

---

## 6. Dashboard (`/dashboard`)

### 6.1 Filters
- Multi-select dropdowns: Country, Channel, Currency, Status.
- Date range: Arrival from date / Arrival to date.
- "Clear filters" button.
- Sticky filter section at the top.
- Filter persistence in `localStorage`.

### 6.2 Summary card
- "Bookings filtered" — total count of bookings matching the current filters.

### 6.3 Channel balance table
- Table: "Balance before reference date in SGD by channel".
- Rows are grouped by `channel`.
- For each channel, computes the sum of `balance_before_reference_date_in_sgd` across all matching bookings.
- Same formula as the Data page: considers `net_amount_by_zuzu`, `amount_received`, `payment_gateway_fees`, `payment_date`, `reference_date`, and currency exchange rates.
- Sorted alphabetically by channel name.
- Numbers formatted with 2 decimal places and thousands separators.

---

## 7. Settings Page (`/settings`)

### 7.1 Reference date
- Displays and edits the global `reference_date` in `app_settings` (id=1).
- Date input field.
- Shared across all users — changing it here updates it for everyone.
- **Audit trail**: shows who last changed the reference date, when, and what the previous value was.
- Saving the reference date triggers a currency rate refresh.

### 7.2 Currency exchange rates
- Displays all currencies from the `currency` table (excluding SGD).
- Shows "1 SGD = X [currency]" for each.
- Rates fetched from the [Frankfurter API](https://api.frankfurter.app/) based on the reference date (or yesterday if the reference date is in the future or empty).
- Rates are stored back in the `currency` table after fetching.
- Special handling for LAK (Lao Kip) — flagged in red with a note that its rate doesn't auto-update.

---

## 8. Properties Page (`/properties`)

### 8.1 Properties table
- Displays data from the `properties` Supabase table.
- Columns are dynamically discovered from the schema.
- Paginated: 100 rows per page with Previous / Next navigation.

### 8.2 Filtering
- Filter by HMS ID (exact match).
- Filter by Hotel Name (case-insensitive partial match).
- Apply / Clear filter buttons.

### 8.3 CRUD operations
- **Add row**: opens an inline form with text inputs for `hms_id` and `hotel_name`, and dropdowns (BT, VCC, Inactive, Inactive OTA) for other columns. Inserts into `properties` table.
- **Edit row**: inline editing — switches the row to input/dropdown fields. Saves via `UPDATE`.
- **Delete row**: confirmation prompt, then `DELETE`.

---

## 9. Bulk Update Page (`/bulk-update`)

### 9.1 Paste data
- Textarea where users paste tab-separated data from Excel.
- First column must be the **channel booking confirmation number**.
- Additional columns are mapped to booking fields.

### 9.2 Column mapping
- For each extra column, user selects a booking field from a dropdown.
- Available fields: all editable (green) columns.
- Duplicate mappings are prevented.

### 9.3 Preview
- Preview table showing parsed rows with mapped column headers.
- Row count displayed.

### 9.4 Bulk update execution
- For each row, finds bookings by `channel_booking_confirmation_number`.
- Updates all matching bookings with the mapped values.
- Recomputes formula columns (`balance`, `reconciled_amount_check`) after update.
- Logs each changed cell to `edit_history`.
- Progress bar during update.

### 9.5 Results summary
- Count of: successful updates, not found, errors.
- Detail table showing each confirmation number with status and message.

---

## 10. Shared Utilities

### 10.1 Supabase client (`lib/supabase.ts`)
- Singleton Supabase client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Lazy initialization via Proxy to avoid errors during server-side imports.

### 10.2 Filter preferences (`lib/filterPrefs.ts`)
- Saves/loads filter and sort preferences per user per page in `localStorage`.
- Supports three pages: `data`, `history`, `dashboard`.
- Stores: text filters, multi-select filters, date range filters, sort column, sort direction.

---

## 11. Database Tables (Supabase)

Based on the application code, these tables are used:

| Table | Purpose |
|-------|---------|
| `bookings` | Main data table — booking records with financial data |
| `upload_history` | Tracks Excel uploads (file name, sheet, row count, uploader, timestamps, booking IDs) |
| `edit_history` | Audit log for manual cell edits (old/new values, editor, undo tracking) |
| `app_settings` | Global settings (reference date, audit fields) |
| `currency` | Currency codes with exchange rates to SGD |
| `properties` | Hotel properties with payment method configuration |
| `channels` | Channel configuration (referenced by RLS policies) |

### Supabase Storage
- **Bucket**: `upload-files` — stores original Excel files from uploads.

### Row-Level Security (RLS)
- Applied to all tables per the architecture rules.

---

## 12. Error Handling Patterns

- All Supabase queries include error handling with user-facing `alert()` or inline error messages.
- Error boundaries (`error.tsx`, `data/error.tsx`) for uncaught React errors.
- Auth failures redirect to login.
- Upload failures trigger rollback (delete inserted rows + upload history).
- Loading states with spinners on every data fetch.
