/*
  # Make notes column nullable in procurement_orders

  The notes field should be optional. This removes the NOT NULL constraint
  so orders can be created without a note.
*/

ALTER TABLE procurement_orders ALTER COLUMN notes DROP NOT NULL;
