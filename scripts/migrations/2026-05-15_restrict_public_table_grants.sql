-- Remove non-read table privileges from API roles after enabling RLS.

REVOKE ALL ON public.pharmacies FROM anon, authenticated;
REVOKE ALL ON public.animal_pharmacy_extra FROM anon, authenticated;
REVOKE ALL ON public.pharmacy_staff FROM anon, authenticated;
REVOKE ALL ON public.sync_log FROM anon, authenticated;
REVOKE ALL ON public.data_freshness FROM anon, authenticated;
REVOKE ALL ON public.pharmacy_changelog FROM anon, authenticated;
REVOKE ALL ON public.mois_facility_raw FROM anon, authenticated;

GRANT SELECT ON public.pharmacies TO anon, authenticated;
GRANT SELECT ON public.animal_pharmacy_extra TO anon, authenticated;
GRANT SELECT ON public.pharmacy_staff TO anon, authenticated;
GRANT SELECT ON public.sync_log TO anon, authenticated;
GRANT SELECT ON public.data_freshness TO anon, authenticated;
GRANT SELECT ON public.pharmacy_changelog TO anon, authenticated;
GRANT SELECT ON public.mois_facility_raw TO anon, authenticated;
GRANT SELECT ON public.pharmacy_marker_view TO anon, authenticated;
