create table if not exists public.race_car_models (
 id text primary key, name text not null,
 car_class text not null check (car_class in ('D','C','B','A','S')),
 price_credits integer not null check (price_credits>=0),
 top_speed double precision not null check (top_speed>0),
 acceleration double precision not null check (acceleration>0),
 handling double precision not null check (handling>0),
 nitro_capacity double precision not null check (nitro_capacity>0),
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.race_player_cars (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 car_model_id text not null references public.race_car_models(id) on delete restrict,
 top_speed_level smallint not null default 0 check (top_speed_level between 0 and 10),
 acceleration_level smallint not null default 0 check (acceleration_level between 0 and 10),
 handling_level smallint not null default 0 check (handling_level between 0 and 10),
 nitro_level smallint not null default 0 check (nitro_level between 0 and 10),
 is_selected boolean not null default false, acquired_at timestamptz not null default now(),
 unique(user_id,car_model_id)
);
create index if not exists race_player_cars_user_idx on public.race_player_cars(user_id);
create unique index if not exists race_player_cars_one_selected_idx on public.race_player_cars(user_id) where is_selected;
create table if not exists public.race_economy_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_type text not null check(entry_type in ('CAR_PURCHASE','CAR_UPGRADE','RACE_REWARD','ADMIN_ADJUSTMENT')),
 amount bigint not null check(amount<>0), balance_after bigint not null check(balance_after>=0),
 action_key uuid not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(user_id,action_key)
);
create index if not exists race_economy_ledger_user_created_idx on public.race_economy_ledger(user_id,created_at desc);
create table if not exists public.race_action_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 action_key uuid not null, action_type text not null, request_payload jsonb not null,
 response_payload jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,action_key)
);
create table if not exists public.race_results (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 player_car_id uuid not null references public.race_player_cars(id) on delete restrict,
 track_id text not null, finish_position smallint not null check(finish_position between 1 and 6),
 duration_ms integer not null check(duration_ms between 1000 and 3600000),
 distance_meters integer not null check(distance_meters between 1 and 1000000),
 drift_score integer not null default 0 check(drift_score between 0 and 100000000),
 verified boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists race_results_user_created_idx on public.race_results(user_id,created_at desc);
create index if not exists race_results_track_rank_idx on public.race_results(track_id,finish_position,duration_ms);
alter table public.race_car_models enable row level security;
alter table public.race_player_cars enable row level security;
alter table public.race_economy_ledger enable row level security;
alter table public.race_action_receipts enable row level security;
alter table public.race_results enable row level security;
create policy "Race catalog visible to authenticated players" on public.race_car_models for select to authenticated using(is_active);
create policy "Players read own racing cars" on public.race_player_cars for select to authenticated using((select auth.uid())=user_id);
create policy "Players read own race ledger" on public.race_economy_ledger for select to authenticated using((select auth.uid())=user_id);
create policy "No direct access to race action receipts" on public.race_action_receipts for all to anon,authenticated using(false) with check(false);
create policy "Players read own race results" on public.race_results for select to authenticated using((select auth.uid())=user_id);
insert into public.race_car_models(id,name,car_class,price_credits,top_speed,acceleration,handling,nitro_capacity) values
('falcon-gt','Falcon GT','D',0,245,78,72,100),
('city-sprint','City Sprint','C',8000,265,82,76,105),
('vortex-r','Vortex R','B',15000,290,88,81,115),
('apex-rs','Apex RS','A',30000,320,93,88,125),
('nebula-x','Nebula X','S',60000,350,98,92,140)
on conflict(id) do update set name=excluded.name,car_class=excluded.car_class,price_credits=excluded.price_credits,top_speed=excluded.top_speed,acceleration=excluded.acceleration,handling=excluded.handling,nitro_capacity=excluded.nitro_capacity,is_active=true;
create or replace function public.race_ensure_player()
returns void language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 insert into public.player_profiles(user_id,display_name) values(v_user_id,'Racer') on conflict(user_id) do nothing;
 insert into public.player_wallets(user_id,cash,bank) values(v_user_id,25000,0) on conflict(user_id) do nothing;
 insert into public.race_player_cars(user_id,car_model_id,is_selected) values(v_user_id,'falcon-gt',true) on conflict(user_id,car_model_id) do nothing;
 if not exists(select 1 from public.race_player_cars where user_id=v_user_id and is_selected) then
  update public.race_player_cars set is_selected=true where id=(select id from public.race_player_cars where user_id=v_user_id order by acquired_at,id limit 1);
 end if;
end; $$;
create or replace function public.race_get_garage()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_result jsonb;
begin
 perform public.race_ensure_player();
 select jsonb_build_object(
  'wallet',jsonb_build_object('credits',w.cash,'bank',w.bank),
  'cars',coalesce((select jsonb_agg(jsonb_build_object(
   'id',pc.id,'carModelId',pc.car_model_id,'isSelected',pc.is_selected,
   'topSpeedLevel',pc.top_speed_level,'accelerationLevel',pc.acceleration_level,
   'handlingLevel',pc.handling_level,'nitroLevel',pc.nitro_level,
   'model',jsonb_build_object('name',cm.name,'class',cm.car_class,'price',cm.price_credits,
    'topSpeed',cm.top_speed,'acceleration',cm.acceleration,'handling',cm.handling,'nitroCapacity',cm.nitro_capacity)
  ) order by pc.acquired_at) from public.race_player_cars pc join public.race_car_models cm on cm.id=pc.car_model_id where pc.user_id=v_user_id),'[]'::jsonb),
  'catalog',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'class',car_class,'price',price_credits,
   'topSpeed',top_speed,'acceleration',acceleration,'handling',handling,'nitroCapacity',nitro_capacity) order by price_credits)
   from public.race_car_models where is_active),'[]'::jsonb)
 ) into v_result from public.player_wallets w where w.user_id=v_user_id;
 return v_result;
end; $$;
create or replace function public.race_purchase_car(p_car_model_id text,p_action_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_receipt public.race_action_receipts%rowtype;
 v_model public.race_car_models%rowtype; v_car public.race_player_cars%rowtype;
 v_balance bigint; v_payload jsonb; v_response jsonb;
begin
 perform public.race_ensure_player();
 if p_action_key is null or p_car_model_id is null then raise exception 'Purchase request is incomplete'; end if;

 v_payload:=jsonb_build_object('carModelId',p_car_model_id);
 select * into v_receipt from public.race_action_receipts where user_id=v_user_id and action_key=p_action_key;
 if found then
  if v_receipt.action_type<>'CAR_PURCHASE' or v_receipt.request_payload<>v_payload then raise exception 'Idempotency key reused for a different action'; end if;
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
  if v_balance<v_model.price_credits then raise exception 'Not enough credits'; end if;
  update public.player_wallets set cash=cash-v_model.price_credits where user_id=v_user_id returning cash into v_balance;
  insert into public.race_player_cars(user_id,car_model_id) values(v_user_id,p_car_model_id) returning * into v_car;
  if v_model.price_credits>0 then
   insert into public.race_economy_ledger(user_id,entry_type,amount,balance_after,action_key,metadata)
   values(v_user_id,'CAR_PURCHASE',-v_model.price_credits,v_balance,p_action_key,jsonb_build_object('carModelId',p_car_model_id));
  end if;
  v_response:=jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level),'balance',v_balance,'alreadyOwned',false);
 end if;
 insert into public.race_action_receipts(user_id,action_key,action_type,request_payload,response_payload) values(v_user_id,p_action_key,'CAR_PURCHASE',v_payload,v_response);
 return v_response;
end; $$;
create or replace function public.race_upgrade_car(p_player_car_id uuid,p_stat text,p_action_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_receipt public.race_action_receipts%rowtype;
 v_car public.race_player_cars%rowtype; v_level integer; v_cost integer; v_balance bigint; v_payload jsonb; v_response jsonb;
begin
 perform public.race_ensure_player();
 if p_action_key is null or p_player_car_id is null or p_stat not in('topSpeed','acceleration','handling','nitro') then raise exception 'Invalid upgrade request'; end if;

 v_payload:=jsonb_build_object('playerCarId',p_player_car_id,'stat',p_stat);
 select * into v_receipt from public.race_action_receipts where user_id=v_user_id and action_key=p_action_key;
 if found then
  if v_receipt.action_type<>'CAR_UPGRADE' or v_receipt.request_payload<>v_payload then raise exception 'Idempotency key reused for a different action'; end if;
  return v_receipt.response_payload;
 end if;
 select * into v_car from public.race_player_cars where id=p_player_car_id and user_id=v_user_id for update;
 if not found then raise exception 'Owned car not found'; end if;
 v_level:=case p_stat when 'topSpeed' then v_car.top_speed_level when 'acceleration' then v_car.acceleration_level when 'handling' then v_car.handling_level else v_car.nitro_level end;
 if v_level>=10 then raise exception 'Upgrade level is already at maximum'; end if;
 v_cost:=250*(v_level+1)*(v_level+1);
 select cash into v_balance from public.player_wallets where user_id=v_user_id for update;
 if v_balance<v_cost then raise exception 'Not enough credits'; end if;
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
 insert into public.race_action_receipts(user_id,action_key,action_type,request_payload,response_payload) values(v_user_id,p_action_key,'CAR_UPGRADE',v_payload,v_response);
 return v_response;
end; $$;
create or replace function public.race_select_car(p_player_car_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_car public.race_player_cars%rowtype; v_balance bigint;
begin
 perform public.race_ensure_player();
 select cash into v_balance from public.player_wallets where user_id=v_user_id for update;
 update public.race_player_cars set is_selected=false where user_id=v_user_id and is_selected;
 update public.race_player_cars set is_selected=true where id=p_player_car_id and user_id=v_user_id returning * into v_car;
 if not found then raise exception 'Owned car not found'; end if;
 return jsonb_build_object('playerCar',jsonb_build_object('id',v_car.id,'carModelId',v_car.car_model_id,'isSelected',v_car.is_selected,'topSpeedLevel',v_car.top_speed_level,'accelerationLevel',v_car.acceleration_level,'handlingLevel',v_car.handling_level,'nitroLevel',v_car.nitro_level));
end; $$;
create or replace function public.race_record_result(p_player_car_id uuid,p_track_id text,p_finish_position integer,p_duration_ms integer,p_distance_meters integer,p_drift_score integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_result public.race_results%rowtype;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_track_id is null or length(p_track_id) not between 1 and 64 or p_finish_position not between 1 and 6 or p_duration_ms not between 1000 and 3600000 or p_distance_meters not between 1 and 1000000 or p_drift_score not between 0 and 100000000 then raise exception 'Invalid race result'; end if;
 if not exists(select 1 from public.race_player_cars where id=p_player_car_id and user_id=v_user_id) then raise exception 'Owned car not found'; end if;
 insert into public.race_results(user_id,player_car_id,track_id,finish_position,duration_ms,distance_meters,drift_score,verified)
 values(v_user_id,p_player_car_id,p_track_id,p_finish_position,p_duration_ms,p_distance_meters,p_drift_score,false) returning * into v_result;
 return jsonb_build_object('raceResult',to_jsonb(v_result),'trustedForLeaderboard',false,'rewardCredits',0);
end; $$;
revoke all on function public.race_ensure_player() from public,anon,authenticated;
revoke all on function public.race_get_garage() from public,anon;
revoke all on function public.race_purchase_car(text,uuid) from public,anon;
revoke all on function public.race_upgrade_car(uuid,text,uuid) from public,anon;
revoke all on function public.race_select_car(uuid) from public,anon;
revoke all on function public.race_record_result(uuid,text,integer,integer,integer,integer) from public,anon;
grant execute on function public.race_get_garage() to authenticated;
grant execute on function public.race_purchase_car(text,uuid) to authenticated;
grant execute on function public.race_upgrade_car(uuid,text,uuid) to authenticated;
grant execute on function public.race_select_car(uuid) to authenticated;
grant execute on function public.race_record_result(uuid,text,integer,integer,integer,integer) to authenticated;
create or replace function public.reject_race_ledger_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Race economy ledger is append-only'; end; $$;
drop trigger if exists race_economy_ledger_append_only on public.race_economy_ledger;
create trigger race_economy_ledger_append_only before update or delete on public.race_economy_ledger
for each row execute function public.reject_race_ledger_mutation();
