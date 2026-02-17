# Upload ID Setup Instructions

## Overview
This update adds an `upload_id` column to track which upload batch each booking came from.

## Steps to Complete the Setup

### 1. Run the SQL Script in Supabase

1. Go to your Supabase Dashboard
2. Navigate to the SQL Editor
3. Open the file `add-upload-id-to-bookings.sql` in this directory
4. Copy and paste the SQL into the Supabase SQL Editor
5. Click "Run" to execute the script

This will:
- Add the `upload_id` column to the `bookings` table
- Create a foreign key relationship to `upload_history(id)`
- Add an index for better performance
- Add documentation comment

### 2. What Changed in the Code

The upload process has been updated to:
1. **Create the upload_history record first** and get its ID
2. **Add the upload_id to each booking** before inserting
3. **Update the upload_history** with the booking IDs after insertion
4. **Display the upload_id column** in the table (far right, after `updated_at`)

### 3. How It Works Now

**During Excel Upload:**
- Each uploaded booking will automatically get the `upload_id` of that upload batch
- The success message will show the Upload ID (e.g., "Upload ID: #25")

**In the Table:**
- The `upload_id` column will appear at the far right
- You can see which upload batch each booking came from
- Manually added rows will have `upload_id = null` (which is fine)

**In Upload History:**
- You can now cross-reference bookings with their upload batch
- Click a booking's upload_id to trace it back to the original upload

### 4. Existing Data

**Important:** Existing bookings in your database will have `upload_id = null` because they were uploaded before this feature was added. Only new uploads will have the upload_id populated.

If you need to retroactively assign upload_ids to existing bookings, you would need to:
1. Match bookings to uploads using the `booking_ids` array in `upload_history`
2. Run an UPDATE query to set the upload_id for those bookings

Let me know if you need help with that!

### 5. Verify the Setup

After running the SQL script:
1. Go to the dashboard
2. Upload a new Excel file
3. Check that the new bookings have an `upload_id` value
4. The column should appear at the far right of the table
5. The upload success message should show the Upload ID

## Benefits

- **Full Traceability:** Know exactly which upload batch each booking came from
- **Easy Deletion:** Delete all bookings from a specific upload via Upload History
- **Audit Trail:** Track when and how bookings entered the system
- **Data Quality:** Identify patterns or issues with specific uploads
