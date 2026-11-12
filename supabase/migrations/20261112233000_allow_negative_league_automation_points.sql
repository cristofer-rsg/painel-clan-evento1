CREATE OR REPLACE FUNCTION public.record_clash_league_events(p_events jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 item JSONB; v_key TEXT; v_tag TEXT; v_player TEXT; v_war TEXT; v_activity TEXT;
 v_points INTEGER; v_event_id TEXT; v_inserted INTEGER := 0; v_skipped INTEGER := 0;
BEGIN
 IF jsonb_typeof(p_events) <> 'array' THEN RAISE EXCEPTION 'Formato de eventos inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clan_evento_league_monthly_cap'));
 FOR item IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  v_key := item->>'source_key'; v_tag := item->>'player_tag'; v_player := item->>'player';
  v_war := item->>'war_key'; v_activity := item->>'activity';
  v_points := COALESCE((item->>'points')::INTEGER, 0);
  IF COALESCE(v_key, '') = '' OR COALESCE(v_tag, '') = '' OR COALESCE(v_player, '') = '' OR COALESCE(v_war, '') = '' THEN
   RAISE EXCEPTION 'Dados incompletos no evento';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clash_league_automation WHERE source_key = v_key) THEN
   v_skipped := v_skipped + 1; CONTINUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players p WHERE p.player_tag = v_tag AND p.active = TRUE) THEN
   INSERT INTO public.clash_league_automation(source_key, war_key, player_tag, event_id)
   VALUES (v_key, v_war, v_tag, NULL) ON CONFLICT (source_key) DO NOTHING;
   v_skipped := v_skipped + 1; CONTINUE;
  END IF;
  v_event_id := NULL;
  IF v_points <> 0 THEN
   INSERT INTO public.events(player, category, activity, points)
   VALUES (v_player, 'Liga dos Clãs', v_activity, v_points)
   RETURNING id::TEXT INTO v_event_id;
   v_inserted := v_inserted + 1;
  ELSE
   v_skipped := v_skipped + 1;
  END IF;
  INSERT INTO public.clash_league_automation(source_key, war_key, player_tag, event_id)
  VALUES (v_key, v_war, v_tag, v_event_id) ON CONFLICT (source_key) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$function$;