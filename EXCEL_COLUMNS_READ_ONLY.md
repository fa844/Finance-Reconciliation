# Excel Upload Columns - Read-Only Protection

## Overview
Columns that originate from Excel uploads are now **read-only** when editing existing records to maintain data integrity and traceability.

## Read-Only Columns (From Excel Uploads)

The following 13 columns are **read-only in edit mode**:

1. **zuzu_room_confirmation_number** - ZUZU's room confirmation ID
2. **hotel_name** - Hotel name
3. **country** - Country location
4. **name** - Guest name
5. **arrival_date** - Guest arrival date
6. **departure_date** - Guest departure date
7. **number_of_room_nights** - Number of nights
8. **status** - Booking status
9. **channel** - Booking channel (Booking.com, Agoda, etc.)
10. **channel_booking_confirmation_number** - Channel confirmation number
11. **zuzu_managing_channel_invoicing** - Payment management responsibility
12. **net_amount_by_zuzu** - Net amount by ZUZU
13. **currency** - Currency (auto-generated from country)

## Visual Indicators

### In Edit Modal:
- **Orange background** (`bg-orange-50`) on read-only fields
- **Orange border** (`border-orange-200`) 
- **Lock icon** 🔒 next to field label
- **"From Excel - Read Only"** label in orange text
- **Info banner** at top of modal: "Fields imported from Excel uploads are read-only"
- **Monospace font** for better data visibility
- **Disabled cursor** (`cursor-not-allowed`)

### When Adding New Rows:
- All fields are **editable** (no restrictions)
- Users can manually enter data into any field
- This allows for manual data entry when needed

## Why This Feature?

### Data Integrity
- Preserves the original data from Excel uploads
- Prevents accidental modifications to imported records
- Maintains audit trail and traceability

### Clear Communication
- Visual indicators make it immediately obvious which data came from Excel
- Users understand why certain fields cannot be edited
- Reduces confusion and support requests

### Flexibility
- Users can still add new rows manually with all fields editable
- System columns (id, created_at, updated_at, upload_id) are always protected

## User Experience

**When editing an existing booking:**
1. Click "Edit" on any row
2. See the info banner: "Fields imported from Excel uploads are read-only"
3. Excel columns appear with:
   - Orange background
   - Lock icon
   - "From Excel - Read Only" label
4. These fields cannot be modified
5. Other editable fields remain white with normal styling

**When adding a new booking manually:**
1. Click "+ Add Row" button
2. All fields are editable (no orange background)
3. Enter data as needed
4. Submit the new record

## Technical Implementation

The read-only logic is applied in the edit modal:
- `isReadOnly = modalMode === 'edit' && isExcelColumn`
- Only applies when `modalMode === 'edit'`
- Does not apply when `modalMode === 'add'`

If you need to modify Excel-imported data, you must:
1. Delete the existing record
2. Re-upload the corrected Excel file
3. Or add a new manual record with the corrected data
