-- The rest of what SmartPharma360 says about a medicine
--
-- 20260809000006 stored the six fields the charges screen needed and left the
-- others in `raw_response`. That was fine until the bill had to be checked
-- against the pharmacy's own printout, which carries the HSN code, the
-- manufacturer, the expiry and the drug schedule. Reading them back out of a
-- jsonb blob for every render is the wrong shape for data this ordinary.
--
-- Only the expiry is printed today. The other three are stored anyway because
-- they arrived in the same payload and re-fetching a bill to get them later is
-- exactly the call to somebody else's site this whole feature avoids.

ALTER TABLE public.pharmacy_bill_items
  ADD COLUMN IF NOT EXISTS hsn_code      varchar(20),
  ADD COLUMN IF NOT EXISTS mfg           varchar(50),
  ADD COLUMN IF NOT EXISTS expiry        varchar(10),
  ADD COLUMN IF NOT EXISTS schedule_type varchar(10);

COMMENT ON COLUMN public.pharmacy_bill_items.expiry IS 'As SmartPharma360 sends it: YYYY-MM. The only one of these four currently printed.';
COMMENT ON COLUMN public.pharmacy_bill_items.schedule_type IS 'Drug schedule (H, H1, …) or blank for something unscheduled.';

-- Backfill from the payload already stored against each bill. Matched on the
-- product and batch rather than on position: row order is not guaranteed by a
-- plain SELECT, and a bill can list the same product under two batches, which
-- the pair still separates.
UPDATE public.pharmacy_bill_items i
   SET hsn_code      = nullif(raw->>'hsn_code', ''),
       mfg           = nullif(raw->>'mfg', ''),
       expiry        = nullif(raw->>'expiry', ''),
       schedule_type = nullif(raw->>'schedule_type', '')
  FROM public.pharmacy_bills b,
       LATERAL jsonb_array_elements(b.raw_response->'items') AS raw
 WHERE i.pharmacy_bill_id = b.id
   AND raw->>'product_name' IS NOT DISTINCT FROM i.product_name
   AND raw->>'batch_number' IS NOT DISTINCT FROM i.batch_number
   AND i.expiry IS NULL;
