-- Update all existing bookings (where upload_id is NULL) to have upload_id = 1
UPDATE bookings
SET upload_id = 1
WHERE upload_id IS NULL;
