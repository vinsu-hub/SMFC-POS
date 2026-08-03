-- HR approving signatory for the payslip template: a name to print and an
-- e-signature image to embed. Lives on the existing singleton
-- hr.payroll_rule_settings row rather than a new table -- same
-- one-row-of-global-config precedent as engine_enabled.

alter table hr.payroll_rule_settings
  add column hr_signatory_name text,
  add column hr_signature_path text;
