/*
# Grant service provider admin access

1. Changes
- Adds the Service Providers module to super_admin and operations role defaults.

2. Security
- Reuses the existing RBAC role_modules table and its policies.
*/
INSERT INTO role_modules (role,module) VALUES ('super_admin','service_providers'),('operations','service_providers') ON CONFLICT (role,module) DO NOTHING;
