-- ============================================================================
-- FLEET COMMAND: SAMPLE SEED DATA FOR TESTING
-- ============================================================================

-- 1. Insert Sample Fleet Assets
INSERT INTO fleet_assets (id, asset_tag, license_plate, model, capacity, status)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'BUS-101', 'AP-31-TE-1001', 'Ashok Leyland Viking', 52, 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222222', 'BUS-102', 'AP-31-TE-1002', 'Tata Starbus Ultra', 40, 'ACTIVE')
ON CONFLICT (asset_tag) DO NOTHING;

-- 2. Insert Sample Personnel
INSERT INTO personnel (id, employee_id, full_name, role, phone_number, license_number, is_active)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EMP-501', 'Raju Rao', 'DRIVER', '+91-9876543210', 'DL-AP-2018-00912', TRUE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'EMP-502', 'Srinivas Rao', 'DRIVER', '+91-9876543211', 'DL-AP-2019-00431', TRUE)
ON CONFLICT (employee_id) DO NOTHING;

-- 3. Insert Active Sessions
INSERT INTO active_sessions (id, asset_id, personnel_id, route_id, status)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ROUTE_MAIN_CAMPUS', 'IN_PROGRESS')
ON CONFLICT (id) DO NOTHING;
