create index if not exists race_player_cars_model_idx on public.race_player_cars(car_model_id);
create index if not exists race_results_player_car_idx on public.race_results(player_car_id);
revoke all on function public.race_ensure_player() from public,anon,authenticated;
