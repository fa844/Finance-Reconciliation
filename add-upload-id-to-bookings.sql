-- Step 1: Add upload_id column to bookings table
ALTER TABLE bookings ADD COLUMN upload_id BIGINT;

-- Step 2: Add foreign key constraint
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_upload_id 
FOREIGN KEY (upload_id) REFERENCES upload_history(id) ON DELETE SET NULL;

-- Step 3: Create an index for better query performance
CREATE INDEX idx_bookings_upload_id ON bookings(upload_id);
