-- ============================================================
-- Plateforme de gestion locative — Schéma PostgreSQL
-- Cahier des charges v2.1 — Modèle de données
-- Stratégie multi-tenant : schéma partagé + organization_id + Row Level Security (cf. section B3)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- Fonction utilitaire : mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. TENANCY & UTILISATEURS
-- ============================================================

CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(255) NOT NULL,
  org_type        varchar(20) NOT NULL CHECK (org_type IN ('particulier','agence')),
  status          varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id),
  email                varchar(255) NOT NULL UNIQUE,
  phone                varchar(30),
  password_hash        varchar(255) NOT NULL,
  role                 varchar(20) NOT NULL CHECK (role IN ('owner','admin','manager','agent','owner_viewer')),
  is_active            boolean NOT NULL DEFAULT true,
  two_factor_enabled   boolean NOT NULL DEFAULT false,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Accès multi-organisation : agent travaillant pour plusieurs agences,
-- ou propriétaire multi-agence (fonctionnalité A14, Enterprise)
CREATE TABLE organization_members (
  user_id          uuid NOT NULL REFERENCES users(id),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  role             varchar(20) NOT NULL,
  PRIMARY KEY (user_id, organization_id)
);

-- ============================================================
-- 2. PATRIMOINE : PROPRIÉTAIRES, PROPRIÉTÉS, LOCAUX
-- ============================================================

CREATE TABLE owners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  user_id          uuid REFERENCES users(id),      -- NULL tant que le portail (A3) n'est pas activé
  full_name        varchar(255) NOT NULL,
  phone            varchar(30),
  email            varchar(255),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_owners_organization_id ON owners(organization_id);

CREATE TABLE properties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  owner_id         uuid NOT NULL REFERENCES owners(id),
  name             varchar(255) NOT NULL,
  property_type    varchar(30) NOT NULL,
  address          varchar(255),
  city             varchar(100),
  district         varchar(100),
  description      text,
  photo_url        text,
  status           varchar(20) NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_properties_organization_id ON properties(organization_id);
CREATE INDEX idx_properties_owner_id ON properties(owner_id);
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE units (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),   -- recopié depuis properties, voir trigger plus bas
  property_id      uuid NOT NULL REFERENCES properties(id),
  number           varchar(50) NOT NULL,
  unit_type        varchar(30) NOT NULL,
  floor            varchar(20),
  area_sqm         numeric(8,2),
  description      text,
  rent_amount      numeric(14,2) NOT NULL,
  currency         varchar(3) NOT NULL DEFAULT 'GNF',  -- correction Partie 4.2 v3.0 : devise par ligne, pas seulement sur les tables SaaS
  deposit_amount   numeric(14,2),
  status           varchar(20) NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','reserved','occupied','maintenance','out_of_service')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_units_organization_id ON units(organization_id);
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_units_status ON units(organization_id, status);
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger de cohérence : organization_id de units est TOUJOURS dérivé de sa property.
-- Le même schéma doit être répliqué sur contracts (depuis units), invoices (depuis contracts),
-- payments (depuis invoices) et maintenance_requests (depuis properties).
CREATE OR REPLACE FUNCTION sync_unit_organization_id() RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM properties WHERE id = NEW.property_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_units_sync_org BEFORE INSERT OR UPDATE OF property_id ON units
  FOR EACH ROW EXECUTE FUNCTION sync_unit_organization_id();

-- ============================================================
-- 3. LOCATION : LOCATAIRES, GARANTS, PROSPECTS, CONTRATS
-- ============================================================

CREATE TABLE tenants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  first_name        varchar(100) NOT NULL,
  last_name         varchar(100) NOT NULL,
  phone             varchar(30),
  email             varchar(255),
  address           varchar(255),
  profession        varchar(100),
  birth_date        date,
  photo_url         text,
  id_doc_type       varchar(30),
  id_doc_number     varchar(50),
  id_doc_file_url   text,
  emergency_contact varchar(255),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_tenants_organization_id ON tenants(organization_id);
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id),
  full_name             varchar(255) NOT NULL,
  phone                 varchar(30),
  budget_min            numeric(14,2),
  budget_max            numeric(14,2),
  desired_type          varchar(30),
  desired_district      varchar(100),
  status                varchar(20) NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new','visiting','negotiating','converted','lost')),
  converted_tenant_id   uuid REFERENCES tenants(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_organization_id ON leads(organization_id);

CREATE TABLE property_visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES leads(id),
  unit_id       uuid NOT NULL REFERENCES units(id),
  scheduled_at  timestamptz NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'planned',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_property_visits_lead_id ON property_visits(lead_id);

CREATE TABLE contracts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id),  -- recopié depuis units
  unit_id            uuid NOT NULL REFERENCES units(id),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  start_date         date NOT NULL,
  end_date           date,
  rent_amount        numeric(14,2) NOT NULL,
  currency           varchar(3) NOT NULL DEFAULT 'GNF',
  deposit_amount     numeric(14,2),
  payment_frequency  varchar(20) NOT NULL DEFAULT 'monthly'
                       CHECK (payment_frequency IN ('monthly','quarterly','semiannual','annual','custom')),
  due_day            smallint NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 28),
  terms              text,
  status             varchar(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('draft','active','suspended','terminated','expired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX idx_contracts_unit_id ON contracts(unit_id);
CREATE INDEX idx_contracts_tenant_id ON contracts(tenant_id);
CREATE INDEX idx_contracts_status ON contracts(organization_id, status);
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION sync_contract_organization_id() RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM units WHERE id = NEW.unit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contracts_sync_org BEFORE INSERT OR UPDATE OF unit_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION sync_contract_organization_id();

CREATE TABLE guarantors (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id        uuid NOT NULL REFERENCES contracts(id),
  full_name          varchar(255) NOT NULL,
  phone              varchar(30),
  address            varchar(255),
  profession         varchar(100),
  id_doc_type        varchar(30),
  id_doc_number      varchar(50),
  id_doc_file_url    text,
  guaranteed_amount  numeric(14,2),
  relationship       varchar(100),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_guarantors_contract_id ON guarantors(contract_id);

CREATE TABLE rent_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       uuid NOT NULL REFERENCES contracts(id),
  effective_date    date NOT NULL,
  previous_amount   numeric(14,2) NOT NULL,
  new_amount        numeric(14,2) NOT NULL,
  reason            varchar(255),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rent_revisions_contract_id ON rent_revisions(contract_id);

CREATE TABLE inspections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id           uuid NOT NULL REFERENCES contracts(id),
  inspection_type       varchar(10) NOT NULL CHECK (inspection_type IN ('entry','exit')),
  inspection_date       date NOT NULL,
  performed_by          uuid REFERENCES users(id),
  tenant_signature_url  text,
  owner_signature_url   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspections_contract_id ON inspections(contract_id);

CREATE TABLE inspection_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id     uuid NOT NULL REFERENCES inspections(id),
  room_name         varchar(100) NOT NULL,
  condition_rating  varchar(20),
  notes             text,
  photo_urls        text[]
);
CREATE INDEX idx_inspection_items_inspection_id ON inspection_items(inspection_id);

CREATE TABLE esignatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signable_type   varchar(30) NOT NULL,     -- 'contract' | 'inspection'
  signable_id     uuid NOT NULL,
  signer_name     varchar(255) NOT NULL,
  signer_role     varchar(30) NOT NULL,
  signature_hash  varchar(255) NOT NULL,
  signed_at       timestamptz NOT NULL DEFAULT now(),
  ip_address      inet
);
CREATE INDEX idx_esignatures_signable ON esignatures(signable_type, signable_id);

-- ============================================================
-- 4. ARGENT — LOYERS (FACTURES, PAIEMENTS, PÉNALITÉS)
-- ============================================================

CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),  -- recopié depuis contracts
  contract_id      uuid NOT NULL REFERENCES contracts(id),
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  amount           numeric(14,2) NOT NULL,
  currency         varchar(3) NOT NULL DEFAULT 'GNF',
  late_fee_amount  numeric(14,2) NOT NULL DEFAULT 0,
  due_date         date NOT NULL,
  status           varchar(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','partially_paid','paid','overdue','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_invoices_contract_id ON invoices(contract_id);
CREATE INDEX idx_invoices_due_date ON invoices(organization_id, due_date) WHERE status IN ('pending','overdue');

CREATE OR REPLACE FUNCTION sync_invoice_organization_id() RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM contracts WHERE id = NEW.contract_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_sync_org BEFORE INSERT OR UPDATE OF contract_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_organization_id();

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),  -- recopié depuis invoices
  invoice_id       uuid NOT NULL REFERENCES invoices(id),
  contract_id      uuid NOT NULL REFERENCES contracts(id),
  amount           numeric(14,2) NOT NULL,
  currency         varchar(3) NOT NULL DEFAULT 'GNF',
  payment_date     timestamptz NOT NULL DEFAULT now(),
  payment_method   varchar(30) NOT NULL,   -- especes, orange_money, mtn_momo, virement, carte, autre
  reference        varchar(100),
  recorded_by      uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_organization_id ON payments(organization_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);

CREATE OR REPLACE FUNCTION sync_payment_organization_id() RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM invoices WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_sync_org BEFORE INSERT OR UPDATE OF invoice_id ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_payment_organization_id();

CREATE TABLE late_fee_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id),
  contract_id        uuid REFERENCES contracts(id),   -- NULL = règle par défaut de l'organisation
  calculation_type   varchar(20) NOT NULL CHECK (calculation_type IN ('fixed','percentage','progressive')),
  value              numeric(10,4) NOT NULL,
  grace_period_days  smallint NOT NULL DEFAULT 0,
  cap_amount         numeric(14,2),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_late_fee_rules_organization_id ON late_fee_rules(organization_id);

-- Moyens de paiement configurables par organisation (v1.0 §14/§26) — organization_id
-- NULL désigne un moyen global proposé par défaut à toutes les organisations
-- (espèces, Orange Money, MTN MoMo, virement) ; ajouté en Phase 4 de la feuille de
-- route d'implémentation, remplace le varchar libre initial sur payments.
CREATE TABLE payment_methods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES organizations(id),
  code                varchar(30) NOT NULL,
  label               varchar(100) NOT NULL,
  requires_reference  boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_methods_organization_id ON payment_methods(organization_id);

-- ============================================================
-- 5. ARGENT — AGENCE (COMMISSION, VERSEMENTS PROPRIÉTAIRE)
-- ============================================================

CREATE TABLE agency_commission_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  property_id       uuid REFERENCES properties(id),  -- NULL = règle par défaut de l'organisation
  owner_id          uuid REFERENCES owners(id),
  rate_percentage   numeric(5,2) NOT NULL,
  calculation_base  varchar(10) NOT NULL DEFAULT 'gross' CHECK (calculation_base IN ('gross','net')),
  frequency         varchar(20) NOT NULL DEFAULT 'monthly',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agency_commission_rules_organization_id ON agency_commission_rules(organization_id);

CREATE TABLE owner_payouts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id),
  owner_id              uuid NOT NULL REFERENCES owners(id),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  gross_rent_collected  numeric(14,2) NOT NULL DEFAULT 0,
  commission_amount     numeric(14,2) NOT NULL DEFAULT 0,
  expenses_deducted     numeric(14,2) NOT NULL DEFAULT 0,
  net_amount            numeric(14,2) NOT NULL DEFAULT 0,
  status                varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at               timestamptz,
  statement_pdf_url     text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_owner_payouts_organization_id ON owner_payouts(organization_id);
CREATE INDEX idx_owner_payouts_owner_id ON owner_payouts(owner_id);

-- ============================================================
-- 6. EXPLOITATION : PRESTATAIRES, MAINTENANCE, DÉPENSES
-- ============================================================

CREATE TABLE vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  name                varchar(255) NOT NULL,
  specialty           varchar(100),
  phone               varchar(30),
  email               varchar(255),
  average_cost        numeric(14,2),
  average_delay_days  numeric(6,1),
  rating              numeric(3,2),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_organization_id ON vendors(organization_id);

CREATE TABLE maintenance_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),  -- recopié depuis properties
  property_id      uuid NOT NULL REFERENCES properties(id),
  unit_id          uuid REFERENCES units(id),
  tenant_id        uuid REFERENCES tenants(id),
  vendor_id        uuid REFERENCES vendors(id),
  description      text NOT NULL,
  priority         varchar(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  photo_urls       text[],
  cost             numeric(14,2),
  status           varchar(20) NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','assigned','in_progress','resolved','closed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);
CREATE INDEX idx_maintenance_requests_organization_id ON maintenance_requests(organization_id);
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(organization_id, status);

CREATE OR REPLACE FUNCTION sync_maintenance_organization_id() RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM properties WHERE id = NEW.property_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintenance_sync_org BEFORE INSERT OR UPDATE OF property_id ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION sync_maintenance_organization_id();

CREATE TABLE expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  property_id      uuid REFERENCES properties(id),
  unit_id          uuid REFERENCES units(id),
  category         varchar(50) NOT NULL,
  amount           numeric(14,2) NOT NULL,
  currency         varchar(3) NOT NULL DEFAULT 'GNF',
  expense_date     date NOT NULL,
  description      text,
  receipt_url      text,
  recorded_by      uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_organization_id ON expenses(organization_id);

-- ============================================================
-- 7. DOCUMENTS, NOTIFICATIONS, JOURNAL D'ACTIVITÉ
-- ============================================================

CREATE TABLE documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  related_type     varchar(30) NOT NULL,   -- 'contract' | 'tenant' | 'expense' | 'maintenance_request' ...
  related_id       uuid NOT NULL,
  file_url         text NOT NULL,
  file_type        varchar(30),
  uploaded_by      uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_organization_id ON documents(organization_id);
CREATE INDEX idx_documents_related ON documents(related_type, related_id);

CREATE TABLE notification_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  trigger_point    varchar(20) NOT NULL CHECK (trigger_point IN ('before_due','on_due','after_due')),
  offset_days      smallint NOT NULL DEFAULT 0,
  channel          varchar(20) NOT NULL CHECK (channel IN ('push','sms','whatsapp','email')),
  template_key     varchar(50) NOT NULL,
  enabled          boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_notification_rules_organization_id ON notification_rules(organization_id);

CREATE TABLE notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  recipient_type   varchar(20) NOT NULL CHECK (recipient_type IN ('user','tenant')),
  recipient_id     uuid NOT NULL,
  channel          varchar(20) NOT NULL,
  template_key     varchar(50) NOT NULL,
  payload          jsonb,
  status           varchar(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_organization_id ON notifications(organization_id);

-- Journal d'activité : append-only, jamais de UPDATE ni de DELETE applicatif (cf. section 24 du document v1.0)
CREATE TABLE activity_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  user_id          uuid REFERENCES users(id),
  action           varchar(50) NOT NULL,
  entity_type      varchar(50) NOT NULL,
  entity_id        uuid,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_organization_id ON activity_logs(organization_id, created_at DESC);

-- ============================================================
-- 8. MODÈLE SAAS : ABONNEMENTS, FACTURATION PLATEFORME, PAIEMENTS MOBILES
-- ============================================================

CREATE TABLE subscription_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                varchar(20) NOT NULL UNIQUE CHECK (code IN ('free','standard','pro','business')),
  name                varchar(100) NOT NULL,
  price_amount        numeric(14,2) NOT NULL,
  currency            varchar(3) NOT NULL DEFAULT 'GNF',
  billing_interval    varchar(10) NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly','annual')),
  max_properties      integer,
  max_units           integer,
  notification_quota  integer,
  features            jsonb NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT true
);

CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id),
  plan_id               uuid NOT NULL REFERENCES subscription_plans(id),
  status                varchar(20) NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('trialing','active','past_due','canceled')),
  current_period_start  date NOT NULL,
  current_period_end    date NOT NULL,
  trial_ends_at         date,
  payment_method        varchar(30),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Facturation de l'ABONNEMENT SaaS — bien distincte de `invoices` (loyers dus par les locataires, section 4).
-- Voir Partie D du document v2.1 sur cette distinction.
CREATE TABLE platform_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    uuid NOT NULL REFERENCES subscriptions(id),
  amount             numeric(14,2) NOT NULL,
  currency           varchar(3) NOT NULL DEFAULT 'GNF',
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  status             varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  paid_at            timestamptz,
  payment_reference  varchar(100),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_invoices_subscription_id ON platform_invoices(subscription_id);

CREATE TABLE usage_counters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  period           varchar(7) NOT NULL,     -- 'YYYY-MM'
  metric           varchar(30) NOT NULL,    -- 'notifications_sent' | 'sms_sent' ...
  count            integer NOT NULL DEFAULT 0,
  UNIQUE (organization_id, period, metric)
);

-- Traçabilité des transactions Orange Money / MTN MoMo — mode facilitateur, cf. Partie D3.
-- idempotency_key évite tout double enregistrement en cas de retry webhook.
CREATE TABLE payment_transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id),
  contract_id              uuid REFERENCES contracts(id),
  provider                 varchar(20) NOT NULL CHECK (provider IN ('orange_money','mtn_momo')),
  provider_transaction_id  varchar(100) NOT NULL,
  amount                   numeric(14,2) NOT NULL,
  currency                 varchar(3) NOT NULL DEFAULT 'GNF',
  direction                varchar(10) NOT NULL CHECK (direction IN ('collection','payout')),
  status                   varchar(20) NOT NULL DEFAULT 'pending',
  idempotency_key          varchar(100) NOT NULL,
  raw_payload              jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_transaction_id),
  UNIQUE (idempotency_key)
);
CREATE INDEX idx_payment_transactions_organization_id ON payment_transactions(organization_id);

-- ============================================================
-- 9. ADMINISTRATION DE LA PLATEFORME (Super-Admin) — HORS PÉRIMÈTRE MULTI-TENANT
-- cf. Partie A15 / B18. Ces tables ne portent pas d'organization_id de premier
-- niveau et ne sont JAMAIS soumises aux politiques RLS ci-dessous : seul un rôle
-- PostgreSQL séparé avec BYPASSRLS (jamais le rôle applicatif tenant-facing) y accède.
-- ============================================================

CREATE TABLE platform_admins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               varchar(255) NOT NULL UNIQUE,
  password_hash       varchar(255) NOT NULL,
  role                varchar(20) NOT NULL CHECK (role IN ('support','billing_admin','super_admin')),
  two_factor_enabled  boolean NOT NULL DEFAULT true CHECK (two_factor_enabled = true),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- La contrainte CHECK sur two_factor_enabled rend le 2FA non désactivable pour ce rôle
-- (contrairement aux utilisateurs organisationnels, section 7, où il reste optionnel).

CREATE TABLE platform_audit_logs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id                 uuid NOT NULL REFERENCES platform_admins(id),
  action                   varchar(50) NOT NULL,
  target_organization_id   uuid REFERENCES organizations(id),
  target_type              varchar(50),
  target_id                uuid,
  metadata                 jsonb,
  ip_address               inet,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_logs_admin_id ON platform_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_platform_audit_logs_target_org ON platform_audit_logs(target_organization_id);

CREATE TABLE impersonation_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id         uuid NOT NULL REFERENCES platform_admins(id),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  reason           text NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz
);
CREATE INDEX idx_impersonation_sessions_admin_id ON impersonation_sessions(admin_id);
CREATE INDEX idx_impersonation_sessions_organization_id ON impersonation_sessions(organization_id);

CREATE TABLE support_tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id),
  subject            varchar(255) NOT NULL,
  description        text,
  status             varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority           varchar(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_admin_id  uuid REFERENCES platform_admins(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);
CREATE INDEX idx_support_tickets_organization_id ON support_tickets(organization_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

-- ============================================================
-- 10. ROW LEVEL SECURITY — ISOLATION MULTI-TENANT (cf. Partie B3/B6)
-- ============================================================

-- Chaque requête applicative doit exécuter, en tout début de transaction :
--   SET LOCAL app.current_org_id = '<uuid-de-l-organisation-de-l-utilisateur>';
-- Le middleware Django s'en charge automatiquement à partir du JWT décodé.
-- Le rôle PostgreSQL applicatif ne doit JAMAIS avoir l'attribut BYPASSRLS.
-- Le compte technique de migration/support, lui, utilise un rôle séparé avec BYPASSRLS.

CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  -- NULLIF gère le cas où le paramètre n'a jamais été fixé dans la session : Postgres
  -- renvoie alors une chaîne vide plutôt que NULL pour un GUC personnalisé inconnu.
  -- Sans ce NULLIF, un middleware qui oublierait de fixer app.current_org_id ferait
  -- planter la requête au lieu de la bloquer silencieusement — on préfère "fail closed"
  -- (aucune ligne visible) à une erreur 500 imprévisible.
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Exemple appliqué aux tables les plus sensibles — répliquer le même schéma
-- (ENABLE ROW LEVEL SECURITY + CREATE POLICY) sur toutes les tables portant organization_id :
-- owners, guarantors (via contract), leads, expenses, maintenance_requests, vendors,
-- documents, notifications, activity_logs, subscriptions, usage_counters, payment_transactions...

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON owners
  USING (organization_id = current_org_id());

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON properties
  USING (organization_id = current_org_id());

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON units
  USING (organization_id = current_org_id());

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (organization_id = current_org_id());

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contracts
  USING (organization_id = current_org_id());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (organization_id = current_org_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (organization_id = current_org_id());

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_tickets
  USING (organization_id = current_org_id());

ALTER TABLE late_fee_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON late_fee_rules
  USING (organization_id = current_org_id());

-- Journal d'activité : écriture seule, jamais modifiable ni supprimable
-- (cf. module Gouvernance, Partie 1) — comme owners avant correction, cette
-- table portait organization_id sans policy RLS, ce qui aurait permis à une
-- requête applicative mal filtrée d'exposer le journal d'une autre agence.
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON activity_logs
  USING (organization_id = current_org_id());

-- organization_id NULL = moyen de paiement global, visible par toutes les
-- organisations (cf. définition de la table plus haut).
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_methods
  USING (organization_id = current_org_id() OR organization_id IS NULL);

ALTER TABLE agency_commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agency_commission_rules
  USING (organization_id = current_org_id());

-- Isolation par organisation seulement : le filtrage supplémentaire par
-- owner_id (un propriétaire ne doit voir que SES versements, pas ceux des
-- autres propriétaires de la même agence) est appliqué côté application
-- dans les routes du portail (routes/portal.ts) — la RLS ne connaît pas la
-- notion de "propriétaire courant", seulement l'organisation.
ALTER TABLE owner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON owner_payouts
  USING (organization_id = current_org_id());
-- support_tickets reste visible par son organisation (portail "mes tickets"), à la
-- différence de platform_admins / platform_audit_logs / impersonation_sessions
-- ci-dessus : ces trois tables ne portent volontairement AUCUNE politique RLS — elles
-- ne sont jamais interrogées par le rôle applicatif tenant-facing, seulement par le
-- service admin séparé (B18), via un rôle PostgreSQL distinct avec BYPASSRLS.

-- Note sur la suppression logique : deleted_at (properties, units, tenants) reste un filtre
-- applicatif (Django manager par défaut), volontairement séparé de la RLS, pour qu'un
-- compte de support avec le bon organization_id puisse encore consulter les lignes archivées.

-- ============================================================
-- 11. SUPER-ADMIN — Phase 7 : trou RLS comblé + rôle Postgres séparé
-- ============================================================

-- subscriptions/usage_counters/payment_transactions portent organization_id
-- mais n'avaient pas encore de policy (cf. note historique plus haut) —
-- même pattern que toutes les autres tables tenant-facing.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (organization_id = current_org_id());

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_counters
  USING (organization_id = current_org_id());

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_transactions
  USING (organization_id = current_org_id());

-- Rôle super-admin : BYPASSRLS, mais droits d'écriture volontairement bornés
-- aux tables que l'espace super-admin touche réellement (jamais un accès en
-- écriture illimité aux tables opérationnelles locataires — properties,
-- contracts, invoices... restent en lecture seule pour ce rôle).
CREATE ROLE gera_platform_admin LOGIN PASSWORD 'GeraPlatformAdmin_Local2026!' BYPASSRLS;
GRANT USAGE ON SCHEMA public TO gera_platform_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gera_platform_admin;
GRANT INSERT, UPDATE, DELETE ON organizations, platform_admins,
  platform_audit_logs, impersonation_sessions, support_tickets,
  subscription_plans, subscriptions TO gera_platform_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO gera_platform_admin;
