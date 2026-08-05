-- Sample prices for the charge catalogue
--
-- Every entry 20260808000001_charge_catalogue.sql seeded has default_price = 0, so
-- exercising the charges flow — patient charges, charge sheets, the doctor rate card
-- interplay — meant typing a price in by hand every single time. These are illustrative
-- starting figures, not a real tariff; anyone can change them from the Charge Catalogue
-- page at any time, the same as if they'd been typed in there directly.
--
-- 'Other' is left at 0 deliberately — it has no fixed meaning to default to a number for.

UPDATE public.charge_items SET default_price = CASE code
  WHEN 'REG'  THEN 100
  WHEN 'CONS' THEN 300
  WHEN 'PROC' THEN 500
  WHEN 'MED'  THEN 150
  WHEN 'LAB'  THEN 250
  WHEN 'XRAY' THEN 400
  WHEN 'CT'   THEN 2500
  WHEN 'MRI'  THEN 4500
  WHEN 'ROOM' THEN 1000
  WHEN 'ICU'  THEN 3000
  WHEN 'O2'   THEN 200
  WHEN 'NEB'  THEN 150
  ELSE default_price
END
WHERE code IN ('REG','CONS','PROC','MED','LAB','XRAY','CT','MRI','ROOM','ICU','O2','NEB');
