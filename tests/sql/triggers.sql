-- Attach the exact production trigger function after it has been installed.
CREATE TRIGGER events_fill_player_tag
BEFORE INSERT OR UPDATE OF player, player_tag ON public.events
FOR EACH ROW EXECUTE FUNCTION public.fill_event_player_tag();
