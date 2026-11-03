create index if not exists race_player_cars_model_idx on public.race_player_cars(car_model_id);
create index if not exists race_results_player_car_idx on public.race_results(player_car_id);
revoke all on function public.race_ensure_player() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.race_purchase_car(p_car_model_id text, p_action_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.race_action_receipts%rowtype;
  v_model public.race_car_models%rowtype;
  v_car public.race_player_cars%rowtype;
  v_balance bigint;
  v_payload jsonb;
  v_response jsonb;
begin
  perform public.race_ensure_player();
  if p_action_key is null or p_car_model_id is null then raise exception 'Purchase request is incomplete'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_action_key::text,0));
  v_payload := jsonb_build_object('carModelId',p_car_model_id);
  select * into v_receipt from public.race_action_receipts where user_id=v_user_id and action_key=p_action_key;
  if found then
    if v_receipt.action_type <> 'CAR_PURCHASE' or v_receipt.request_payload <> v_payload then raise exception 'Idempotency key reused for a different action'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_model from public.race_car_models where id=p_car_model_id and is_active;
  if not found then raise exception 'Car model is unavailable'; end if;
  select * into v_car from public.race_player_cars where user_id=v_user_id and car_model_id=p_car_model_id;
  if found then
    select cash into v_balance from public.player_wallets where user_id=v_user_id;
    v_response:=jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level),'balance',v_balance,'alreadyOwned',true);
  else
    select cash into v_balance from public.player_wallets where user_id=v_user_id for update;
    if v_balance < v_model.price_credits then raise exception 'Not enough credits' using errcode='P0001'; end if;
    update public.player_wallets set cash=cash-v_model.price_credits where user_id=v_user_id returning cash into v_balance;
    insert into public.race_player_cars(user_id,car_model_id) values(v_user_id,p_car_model_id) returning * into v_car;
    if v_model.price_credits > 0 then
      insert into public.race_economy_ledger(user_id,entry_type,amount,balance_after,action_key,metadata)
      values(v_user_id,'CAR_PURCHASE',-v_model.price_credits,v_balance,p_action_key,jsonb_build_object('carModelId',p_car_model_id));
    end if;
    v_response:=jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level),'balance',v_balance,'alreadyOwned',false);
  end if;
  insert into public.race_action_receipts(user_id,action_key,action_type,request_payload,response_payload)
  values(v_user_id,p_action_key,'CAR_PURCHASE',v_payload,v_response);
  return v_response;
end; $function$

CREATE OR REPLACE FUNCTION public.race_upgrade_car(p_player_car_id uuid, p_stat text, p_action_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.race_action_receipts%rowtype;
  v_car public.race_player_cars%rowtype;
  v_level integer;
  v_cost integer;
  v_balance bigint;
  v_payload jsonb;
  v_response jsonb;
begin
  perform public.race_ensure_player();
  if p_action_key is null or p_player_car_id is null or p_stat not in ('topSpeed','acceleration','handling','nitro') then raise exception 'Invalid upgrade request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_action_key::text,0));
  v_payload:=jsonb_build_object('playerCarId',p_player_car_id,'stat',p_stat);
  select * into v_receipt from public.race_action_receipts where user_id=v_user_id and action_key=p_action_key;
  if found then
    if v_receipt.action_type <> 'CAR_UPGRADE' or v_receipt.request_payload <> v_payload then raise exception 'Idempotency key reused for a different action'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_car from public.race_player_cars where id=p_player_car_id and user_id=v_user_id for update;
  if not found then raise exception 'Owned car not found'; end if;
  v_level:=case p_stat when 'topSpeed' then v_car.top_speed_level when 'acceleration' then v_car.acceleration_level when 'handling' then v_car.handling_level else v_car.nitro_level end;
  if v_level >= 10 then raise exception 'Upgrade level is already at maximum'; end if;
  v_cost:=250*(v_level+1)*(v_level+1);
  select cash into v_balance from public.player_wallets where user_id=v_user_id for update;
  if v_balance < v_cost then raise exception 'Not enough credits'; end if;
  update public.player_wallets set cash=cash-v_cost where user_id=v_user_id returning cash into v_balance;
  update public.race_player_cars set
    top_speed_level=case when p_stat='topSpeed' then top_speed_level+1 else top_speed_level end,
    acceleration_level=case when p_stat='acceleration' then acceleration_level+1 else acceleration_level end,
    handling_level=case when p_stat='handling' then handling_level+1 else handling_level end,
    nitro_level=case when p_stat='nitro' then nitro_level+1 else nitro_level end
  where id=p_player_car_id returning * into v_car;
  insert into public.race_economy_ledger(user_id,entry_type,amount,balance_after,action_key,metadata)
  values(v_user_id,'CAR_UPGRADE',-v_cost,v_balance,p_action_key,jsonb_build_object('playerCarId',p_player_car_id,'stat',p_stat,'level',v_level+1));
  v_response:=jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level),'balance',v_balance,'cost',v_cost);
  insert into public.race_action_receipts(user_id,action_key,action_type,request_payload,response_payload)
  values(v_user_id,p_action_key,'CAR_UPGRADE',v_payload,v_response);
  return v_response;
end; $function$

