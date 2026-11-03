CREATE OR REPLACE FUNCTION public.race_select_car(p_player_car_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=auth.uid(); v_car public.race_player_cars%rowtype; v_balance bigint;
begin
  perform public.race_ensure_player();
  select cash into v_balance from public.player_wallets where user_id=v_user_id for update;
  update public.race_player_cars set is_selected=false where user_id=v_user_id and is_selected;
  update public.race_player_cars set is_selected=true where id=p_player_car_id and user_id=v_user_id returning * into v_car;
  if not found then raise exception 'Owned car not found'; end if;
  return jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level));
end;
$function$
