-- A fetched bill, held between "show it to me" and "yes, save it"
--
-- A pharmacy bill used to be stored the moment an id was typed, so the desk
-- found out whether it was the right invoice only after it had landed on the
-- patient's bill. Showing it first needs the fetched payload to survive from the
-- preview request to the save request.
--
-- It survives here rather than in a module-level Map because API routes run as
-- separate serverless invocations with no memory in common — an in-process cache
-- would miss on nearly every save and re-fetch the bill, which is the exact call
-- to somebody else's site this whole feature exists to avoid.
--
-- Handing the payload to the browser and taking it back on save would also cost
-- one fetch, but then the medicines and amounts stored as "what the pharmacy
-- said" would be whatever the browser sent back, which is the one thing they
-- must not be.
--
-- Rows are deleted the moment they are consumed. Whatever is left is an
-- abandoned preview, swept on the way through the next one.

CREATE TABLE IF NOT EXISTS public.pharmacy_bill_previews (
  token             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_bill_id  bigint NOT NULL,
  payload           jsonb  NOT NULL,   -- head + items, exactly as fetched
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.pharmacy_bill_previews IS 'Short-lived hand-off between previewing a SmartPharma360 bill and saving it, so confirming one costs no extra call to their API. Consumed rows are deleted; strays are swept after an hour.';
COMMENT ON COLUMN public.pharmacy_bill_previews.payload IS 'The fetched head+items. The save path writes from this, never from anything the browser sends back.';

CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_previews_created
  ON public.pharmacy_bill_previews (created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_bill_previews TO anon, authenticated, service_role;
