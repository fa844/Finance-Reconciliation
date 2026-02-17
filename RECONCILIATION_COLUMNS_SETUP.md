# Reconciliation Columns Setup Guide

## Overview
This guide explains how to add reconciliation tracking columns to the Bookings database and use them in the dashboard.

## Database Changes

### New Columns Added
The following 11 reconciliation columns have been added to track payment and reconciliation information (in display order):

1. **net_of_demand_commission_amount_extranet** (DECIMAL) - Net (of channel commission) amount (Extranet)
2. **payment_request_date** (DATE) - Payment Request Date
3. **total_amount_submitted** (DECIMAL) - Total Amount Submitted
4. **amount_received** (DECIMAL) - Amount Received
5. **total_amount_received** (DECIMAL) - Total Amount Received
6. **payment_date** (DATE) - Payment Date
7. **balance** (DECIMAL) - Balance
8. **reconciled_amount_check** (TEXT) - Reconciled amount Check
9. **transmission_queue_id** (TEXT) - Transmission Queue ID
10. **reference_number** (TEXT) - Reference Number
11. **remarks** (TEXT) - Remarks

### Running the Migration

To add these columns to your database, execute the SQL migration file:

```bash
# Connect to your Supabase database using the SQL Editor or psql
psql -h your-database-host -U your-username -d your-database-name -f add-reconciliation-columns.sql
```

Or in Supabase Dashboard:
1. Go to SQL Editor
2. Open `add-reconciliation-columns.sql`
3. Click "Run" to execute the migration

## Dashboard Changes

### Column Organization
The dashboard now organizes columns into three groups:

1. **Booking Information** (Excel Upload Fields)
   - Read-only when editing existing records
   - Contains: confirmation numbers, hotel info, dates, channel, etc.

2. **Reconciliation Information** (Manual Entry Fields)
   - Always editable
   - Contains: payment dates, amounts, balances, reference numbers, etc.

3. **System Fields** (Auto-generated)
   - ID, timestamps, upload tracking

### Features Added

#### 1. Separated Form Sections
The edit/add modal now has clear visual separation:
- 📋 **Booking Information** section (orange highlight for read-only in edit mode)
- 💰 **Reconciliation Information** section (green highlight, always editable)

#### 2. Enhanced Filtering
Added `transmission_queue_id` to the multi-select filter columns for easy tracking of payment batches.

#### 3. Column Ordering
Columns now display in logical order:
1. Main booking data first
2. Reconciliation fields in the middle
3. System fields at the end

### Using Reconciliation Fields

#### Adding New Booking
When adding a new booking manually, all fields (including reconciliation) are editable.

#### Editing Existing Booking
- **Excel upload fields**: Read-only (orange background)
- **Reconciliation fields**: Fully editable (normal background)
- You can update payment information without affecting the original booking data

#### Bulk Operations
The "Update All Currencies" button only affects the currency field and doesn't touch reconciliation data.

## Data Flow

```
1. Excel Upload → Booking Information columns populated
                ↓
2. Manual Entry → Reconciliation Information added/updated
                ↓
3. Tracking    → transmission_queue_id, reference_number for reporting
```

## Best Practices

1. **Import First**: Always import bookings from Excel first
2. **Reconcile Later**: Add payment and reconciliation info manually as payments are processed
3. **Use Filters**: Filter by `transmission_queue_id` to track payment batches
4. **Track Balances**: Use the `balance` field to identify outstanding amounts
5. **Document Changes**: Use the `remarks` field for important notes

## Database Indexes

The migration creates indexes on frequently filtered columns:
- `payment_request_date`
- `payment_date`
- `transmission_queue_id`
- `reference_number`

This ensures fast filtering and searching on reconciliation fields.

## Troubleshooting

### Column Not Showing
- Refresh the page after running the migration
- Check browser console for errors
- Verify the migration ran successfully

### Edit Not Working
- Reconciliation fields should always be editable
- Excel upload fields are read-only in edit mode (this is intentional)
- Check for JavaScript errors in the browser console

### Filter Not Working
- Clear browser cache
- Ensure you clicked "Apply" after setting filters
- Check that the column exists in the database

## Future Enhancements

Potential features to add:
- [ ] Bulk reconciliation import from payment reports
- [ ] Automated balance calculation
- [ ] Payment status workflow
- [ ] Reconciliation reports and exports
- [ ] Audit trail for reconciliation changes
