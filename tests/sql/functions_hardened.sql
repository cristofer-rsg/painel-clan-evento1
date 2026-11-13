CREATE OR REPLACE FUNCTION public.record_clash_war_events(p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

CREATE OR REPLACE FUNCTION public.record_clash_league_events(p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

CREATE OR REPLACE FUNCTION public.sync_clash_donations(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;