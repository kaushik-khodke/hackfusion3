-- 1. Modify the profiles role check constraint to include 'pharmacist'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['patient'::text, 'doctor'::text, 'admin'::text, 'pharmacist'::text]));

-- 2. Modify the notification_logs type column to allow null payload and status if needed (schema allows null payload, status is text)
-- 3. Modify orders status check constraint to include 'fulfilled' if it isn't already (Schema already has it: pending, approved, rejected, fulfilled, cancelled)

-- RLS for Pharmacist: Full access to relevant tables
-- Medicines
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can manage medicines" ON public.medicines;
CREATE POLICY "Pharmacists can manage medicines" ON public.medicines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view all orders" ON public.orders;
CREATE POLICY "Pharmacists can view all orders" ON public.orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

DROP POLICY IF EXISTS "Pharmacists can update orders" ON public.orders;
CREATE POLICY "Pharmacists can update orders" ON public.orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Order Items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view all order items" ON public.order_items;
CREATE POLICY "Pharmacists can view all order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Refill Alerts
ALTER TABLE public.refill_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view all refill alerts" ON public.refill_alerts;
CREATE POLICY "Pharmacists can view all refill alerts" ON public.refill_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

DROP POLICY IF EXISTS "Pharmacists can update refill alerts" ON public.refill_alerts;
CREATE POLICY "Pharmacists can update refill alerts" ON public.refill_alerts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Notification Logs (so they can see low stock alerts)
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view notification logs" ON public.notification_logs;
CREATE POLICY "Pharmacists can view notification logs" ON public.notification_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view audit logs" ON public.audit_logs;
CREATE POLICY "Pharmacists can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );

-- Trigger Function for Low Stock Alert
CREATE OR REPLACE FUNCTION public.check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- If stock drops to or below reorder threshold (and it wasn't already)
  IF NEW.stock <= COALESCE(NEW.reorder_threshold, 10) AND (OLD.stock > COALESCE(OLD.reorder_threshold, 10) OR TG_OP = 'INSERT') THEN
    -- Insert a notification log. Patient_id is generic or null since it's a system wide alert.
    INSERT INTO public.notification_logs (patient_id, channel, type, payload, status)
    VALUES (
      NULL, 
      'email',
      'low_stock',
      jsonb_build_object('medicine_id', NEW.id, 'medicine_name', NEW.name, 'current_stock', NEW.stock, 'threshold', COALESCE(NEW.reorder_threshold, 10)),
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for stock updates
DROP TRIGGER IF EXISTS trigger_check_low_stock ON public.medicines;
CREATE TRIGGER trigger_check_low_stock
  AFTER UPDATE OF stock ON public.medicines
  FOR EACH ROW
  EXECUTE FUNCTION public.check_low_stock();
