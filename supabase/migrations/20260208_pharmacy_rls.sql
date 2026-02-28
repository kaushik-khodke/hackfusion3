-- Migration for Pharmacy RLS and RPC

-- 1. medicines
alter table public.medicines enable row level security;
drop policy if exists "Anyone can view medicines" on public.medicines;
create policy "Anyone can view medicines" on public.medicines for select using (true);

-- 2. orders
alter table public.orders enable row level security;
drop policy if exists "Patients can view own orders" on public.orders;
create policy "Patients can view own orders" on public.orders for select using (auth.uid() = patient_id);
drop policy if exists "Patients can insert own orders" on public.orders;
create policy "Patients can insert own orders" on public.orders for insert with check (auth.uid() = patient_id);
drop policy if exists "Patients can update own orders" on public.orders;
create policy "Patients can update own orders" on public.orders for update using (auth.uid() = patient_id);

-- 3. order_items
alter table public.order_items enable row level security;
drop policy if exists "Patients can view own order items" on public.order_items;
create policy "Patients can view own order items" on public.order_items for select using (
  exists (select 1 from public.orders where id = order_id and patient_id = auth.uid())
);
drop policy if exists "Patients can insert own order items" on public.order_items;
create policy "Patients can insert own order items" on public.order_items for insert with check (
  exists (select 1 from public.orders where id = order_id and patient_id = auth.uid())
);

-- 4. refill_alerts
alter table public.refill_alerts enable row level security;
drop policy if exists "Patients can view own refill alerts" on public.refill_alerts;
create policy "Patients can view own refill alerts" on public.refill_alerts for select using (auth.uid() = patient_id);

-- 5. notification_logs
alter table public.notification_logs enable row level security;
drop policy if exists "Patients can view own notification logs" on public.notification_logs;
create policy "Patients can view own notification logs" on public.notification_logs for select using (auth.uid() = patient_id);

-- RPC for stock decrement
create or replace function decrement_medicine_stock(med_id uuid, amount integer)
returns void as $$
begin
  update public.medicines
  set stock = stock - amount
  where id = med_id;
end;
$$ language plpgsql security definer;

-- Seed some medicines if empty
insert into public.medicines (name, strength, unit_type, stock, prescription_required)
values 
  ('Paracetamol', '500mg', 'tablet', 1000, false),
  ('Amoxicillin', '250mg', 'capsule', 500, true),
  ('Metformin', '500mg', 'tablet', 200, true),
  ('Atorvastatin', '10mg', 'tablet', 150, true),
  ('Ibuprofen', '400mg', 'tablet', 800, false),
  ('Cetirizine', '10mg', 'tablet', 300, false),
  ('Lisinopril', '10mg', 'tablet', 100, true),
  ('Omeprazole', '20mg', 'capsule', 400, false)
on conflict do nothing;
