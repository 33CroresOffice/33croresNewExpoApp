/*
  # Fix procurement automation price source

  Vendor prices are operator-provided catalog values, so generated procurement items use the existing `vendor` enum value.
*/

CREATE OR REPLACE FUNCTION auto_generate_procurement_from_requirements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE + 1;
  v_req RECORD;
  v_vendor RECORD;
  v_po_id uuid;
  v_po_number text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_total numeric(12,2);
BEGIN
  FOR v_req IN
    SELECT dr.flower_type_id, dr.total_quantity, dr.unit_type, ft.name as flower_name
    FROM daily_requirements dr
    JOIN flower_types ft ON ft.id = dr.flower_type_id
    WHERE dr.requirement_date = v_today
      AND dr.total_quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM procurement_order_items poi
        JOIN procurement_orders po ON po.id = poi.procurement_order_id
        WHERE poi.flower_type_id = dr.flower_type_id
          AND po.requirement_date = v_today
          AND po.status <> 'cancelled'
      )
  LOOP
    SELECT vf.vendor_id, vf.price_per_unit INTO v_vendor
    FROM vendor_flowers vf
    JOIN vendors v ON v.id = vf.vendor_id
    WHERE vf.flower_type_id = v_req.flower_type_id
      AND vf.is_active = true
      AND v.is_active = true
    ORDER BY vf.price_per_unit ASC
    LIMIT 1;

    IF v_vendor.vendor_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT po.id INTO v_po_id
    FROM procurement_orders po
    WHERE po.vendor_id = v_vendor.vendor_id
      AND po.requirement_date = v_today
      AND po.status NOT IN ('cancelled','paid');

    IF v_po_id IS NULL THEN
      v_po_number := 'PO-' || to_char(now(), 'YYYYMM') || '-' || lpad((COALESCE((SELECT max(split_part(order_number,'-',3))::integer FROM procurement_orders WHERE order_number LIKE 'PO-%'),0)+1)::text,4,'0');
      INSERT INTO procurement_orders (order_number, vendor_id, order_date, requirement_date, status, notes, created_by)
      VALUES (v_po_number, v_vendor.vendor_id, CURRENT_DATE, v_today, 'sent', 'Auto-generated from daily requirements', NULL)
      RETURNING id INTO v_po_id;
    END IF;

    INSERT INTO procurement_order_items (procurement_order_id, flower_type_id, quantity, unit_type, price_per_unit, total_price, price_set_by)
    VALUES (v_po_id, v_req.flower_type_id, v_req.total_quantity, v_req.unit_type, v_vendor.price_per_unit, v_req.total_quantity * v_vendor.price_per_unit, 'vendor')
    ON CONFLICT (procurement_order_id, flower_type_id) DO NOTHING;

    v_created := v_created + 1;
  END LOOP;

  FOR v_po_id IN
    SELECT DISTINCT po.id FROM procurement_orders po
    JOIN procurement_order_items poi ON poi.procurement_order_id = po.id
    WHERE po.requirement_date = v_today AND po.status = 'sent' AND po.notes = 'Auto-generated from daily requirements'
  LOOP
    SELECT COALESCE(sum(total_price), 0) INTO v_total FROM procurement_order_items WHERE procurement_order_id = v_po_id;
    UPDATE procurement_orders SET total_amount = v_total, updated_at = now() WHERE id = v_po_id;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('auto_generate_procurement', v_today, jsonb_build_object('created', v_created, 'skipped', v_skipped))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'date', v_today);
END;
$$;
