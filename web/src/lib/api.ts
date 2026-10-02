const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

function pageQuery({ page, pageSize }: PageParams = {}): string {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
}

export interface Owner {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export type AgencyRole = "owner" | "admin" | "manager" | "agent";

export interface AgencyUser {
  id: string;
  email: string;
  phone: string | null;
  role: AgencyRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function listUsers(params?: PageParams) {
  return apiFetch<Paginated<AgencyUser>>(`/api/users${pageQuery(params)}`);
}

export function inviteUser(data: { email: string; password: string; role: AgencyRole; phone?: string }) {
  return apiFetch<AgencyUser>("/api/users", { method: "POST", body: JSON.stringify(data) });
}

export function updateUser(id: string, data: { role?: AgencyRole; isActive?: boolean }) {
  return apiFetch<void>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export interface CommissionRule {
  id: string;
  ratePercentage: string;
  calculationBase: "gross" | "net";
}

export interface OwnerDetail extends Owner {
  properties: { id: string; name: string }[];
  hasPortalAccess: boolean;
  commissionRule: CommissionRule | null;
}

export type PayoutStatus = "pending" | "paid";

export interface OwnerPayout {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossRentCollected: string;
  commissionAmount: string;
  expensesDeducted: string;
  netAmount: string;
  status: PayoutStatus;
  paidAt: string | null;
}

export function getOwner(id: string) {
  return apiFetch<OwnerDetail>(`/api/owners/${id}`);
}

export function setCommissionRule(ownerId: string, data: { ratePercentage: number; calculationBase?: "gross" | "net" }) {
  return apiFetch<CommissionRule>(`/api/owners/${ownerId}/commission-rule`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function createPortalAccess(ownerId: string, data: { email: string; password: string }) {
  return apiFetch<{ id: string; email: string }>(`/api/owners/${ownerId}/portal-access`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listOwnerPayouts(ownerId: string) {
  return apiFetch<OwnerPayout[]>(`/api/owners/${ownerId}/payouts`);
}

export function generatePayout(ownerId: string) {
  return apiFetch<OwnerPayout>(`/api/owners/${ownerId}/payouts/generate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function markPayoutPaid(payoutId: string) {
  return apiFetch<void>(`/api/payouts/${payoutId}`, { method: "PATCH" });
}

// --- Portail propriétaire (owner_viewer) ---

export interface PortalMe extends Owner {
  properties: { id: string; name: string }[];
}

export interface PortalSummary {
  propertiesCount: number;
  grossThisMonth: string;
  latestPayout: OwnerPayout | null;
}

export function getPortalMe() {
  return apiFetch<PortalMe>("/api/portal/me");
}

export function getPortalSummary() {
  return apiFetch<PortalSummary>("/api/portal/summary");
}

export function listPortalPayouts() {
  return apiFetch<OwnerPayout[]>("/api/portal/payouts");
}

export interface PortalPayment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  contract: {
    tenant: { firstName: string; lastName: string };
    unit: { number: string; property: { name: string } };
  };
}

export function listPortalPayments(params?: PageParams) {
  return apiFetch<Paginated<PortalPayment>>(`/api/portal/payments${pageQuery(params)}`);
}

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  propertyType: string;
  address: string | null;
  city: string | null;
  district: string | null;
  description: string | null;
  status: string;
  owner: { id: string; fullName: string };
  unitsTotal: number;
  unitsOccupied: number;
}

export type UnitStatus = "available" | "reserved" | "occupied" | "maintenance" | "out_of_service";

export interface Unit {
  id: string;
  propertyId: string;
  number: string;
  unitType: string;
  floor: string | null;
  areaSqm: string | null;
  description: string | null;
  rentAmount: string;
  depositAmount: string | null;
  status: UnitStatus;
}

export interface PropertyDetail extends Property {
  units: Unit[];
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  profession: string | null;
  birthDate: string | null;
  idDocType: string | null;
  idDocNumber: string | null;
  emergencyContact: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("gera_access_token");
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(body?.code ?? "unknown_error", body?.message ?? "La requête a échoué.");
  }

  return body as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function listOwners(params?: PageParams) {
  return apiFetch<Paginated<Owner>>(`/api/owners${pageQuery(params)}`);
}

export function createOwner(data: { fullName: string; phone?: string; email?: string }) {
  return apiFetch<Owner>("/api/owners", { method: "POST", body: JSON.stringify(data) });
}

export function listProperties(params?: PageParams) {
  return apiFetch<Paginated<Property>>(`/api/properties${pageQuery(params)}`);
}

export function createProperty(data: {
  ownerId: string;
  name: string;
  propertyType: string;
  address?: string;
  city?: string;
  district?: string;
  description?: string;
}) {
  return apiFetch<Property>("/api/properties", { method: "POST", body: JSON.stringify(data) });
}

export function getProperty(id: string) {
  return apiFetch<PropertyDetail>(`/api/properties/${id}`);
}

export type ContractStatus = "draft" | "active" | "suspended" | "terminated" | "expired";

export interface Guarantor {
  id: string;
  fullName: string;
  phone: string | null;
  relationship: string | null;
  guaranteedAmount: string | null;
}

export interface Contract {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string | null;
  rentAmount: string;
  depositAmount: string | null;
  paymentFrequency: string;
  dueDay: number;
  terms: string | null;
  status: ContractStatus;
  tenant: { id: string; firstName: string; lastName: string; phone: string | null };
  unit: { id: string; number: string; unitType: string; property: { id: string; name: string } };
  guarantors: Guarantor[];
}

export function listContracts(params?: PageParams) {
  return apiFetch<Paginated<Contract>>(`/api/contracts${pageQuery(params)}`);
}

export function createContract(data: {
  unitId: string;
  tenantId: string;
  startDate: string;
  rentAmount: number;
  depositAmount?: number;
  dueDay?: number;
}) {
  return apiFetch<Contract>("/api/contracts", { method: "POST", body: JSON.stringify(data) });
}

export function getContract(id: string) {
  return apiFetch<Contract>(`/api/contracts/${id}`);
}

export function updateContractStatus(id: string, status: ContractStatus) {
  return apiFetch<Contract>(`/api/contracts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function createGuarantor(
  contractId: string,
  data: { fullName: string; phone?: string; relationship?: string; guaranteedAmount?: number }
) {
  return apiFetch<Guarantor>(`/api/contracts/${contractId}/guarantors`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type InvoiceStatus = "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";

export interface Payment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
}

export interface Invoice {
  id: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  lateFeeAmount: string;
  dueDate: string;
  status: InvoiceStatus;
  payments: Payment[];
  contract: {
    id: string;
    tenant: { id: string; firstName: string; lastName: string };
    unit: { id: string; number: string; property: { id: string; name: string } };
  };
}

export interface PaymentMethod {
  id: string;
  code: string;
  label: string;
  requiresReference: boolean;
}

export function listInvoices(params?: PageParams) {
  return apiFetch<Paginated<Invoice>>(`/api/invoices${pageQuery(params)}`);
}

export function getInvoice(id: string) {
  return apiFetch<Invoice>(`/api/invoices/${id}`);
}

export function listContractInvoices(contractId: string) {
  return apiFetch<Invoice[]>(`/api/contracts/${contractId}/invoices`);
}

export function generateInvoice(contractId: string) {
  return apiFetch<Invoice>(`/api/contracts/${contractId}/invoices`, { method: "POST" });
}

export function recordPayment(
  invoiceId: string,
  data: { amount: number; paymentMethod: string; reference?: string }
) {
  return apiFetch<Invoice>(`/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listPaymentMethods() {
  return apiFetch<PaymentMethod[]>("/api/payment-methods");
}

// Ouvre le reçu PDF d'un paiement dans un nouvel onglet (impression/partage
// natifs du navigateur — cf. cahier des charges, module "Reçus de paiement").
// Contrairement à apiFetch, la réponse est un flux binaire (application/pdf),
// pas du JSON — on ne peut pas simplement passer par un <a href>, l'API
// exige le jeton en en-tête Authorization.
export async function openPaymentReceipt(invoiceId: string, paymentId: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/invoices/${invoiceId}/payments/${paymentId}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.code ?? "unknown_error", body?.message ?? "Impossible de générer le reçu.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export interface DashboardSummary {
  propertiesTotal: number;
  unitsTotal: number;
  unitsOccupied: number;
  activeContracts: number;
  // null pour le rôle agent — "Rapports financiers" est ❌ dans la matrice
  // de permissions (Partie 2), seuls les agrégats monétaires sont retirés.
  revenueThisMonth: string | null;
  outstandingAmount: string | null;
  overdueCount: number;
  monthlyRevenue: { month: string; total: string }[];
}

export function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}

export interface TenantInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  profession?: string;
  birthDate?: string;
  idDocType?: string;
  idDocNumber?: string;
  emergencyContact?: string;
}

export function listTenants(params?: PageParams) {
  return apiFetch<Paginated<Tenant>>(`/api/tenants${pageQuery(params)}`);
}

export function createTenant(data: TenantInput) {
  return apiFetch<Tenant>("/api/tenants", { method: "POST", body: JSON.stringify(data) });
}

export function getTenant(id: string) {
  return apiFetch<Tenant>(`/api/tenants/${id}`);
}

export type ActivityAction = "create" | "update" | "delete";

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { email: string } | null;
}

export function listActivityLogs(params?: PageParams) {
  return apiFetch<Paginated<ActivityLog>>(`/api/activity-logs${pageQuery(params)}`);
}

export type RelatedType = "tenant" | "contract" | "guarantor" | "property" | "owner";

export interface AppDocument {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  fileName: string;
  fileType: string | null;
  createdAt: string;
  downloadUrl: string;
}

export function listDocuments(relatedType: RelatedType, relatedId: string) {
  return apiFetch<AppDocument[]>(`/api/documents?relatedType=${relatedType}&relatedId=${relatedId}`);
}

// Upload multipart — ne peut pas passer par apiFetch() : celui-ci force
// Content-Type: application/json, alors qu'un FormData a besoin que le
// navigateur pose lui-même l'en-tête multipart avec sa boundary.
export async function uploadDocument(
  relatedType: RelatedType,
  relatedId: string,
  file: File
): Promise<AppDocument> {
  const token = getToken();
  const form = new FormData();
  form.append("relatedType", relatedType);
  form.append("relatedId", relatedId);
  form.append("file", file);

  const res = await fetch(`${API_URL}/api/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.code ?? "unknown_error", body?.message ?? "Échec de l'envoi du fichier.");
  }
  return body as AppDocument;
}

export function deleteDocument(id: string) {
  return apiFetch<void>(`/api/documents/${id}`, { method: "DELETE" });
}

export function createUnit(
  propertyId: string,
  data: {
    number: string;
    unitType: string;
    floor?: string;
    areaSqm?: number;
    rentAmount: number;
    depositAmount?: number;
    description?: string;
  }
) {
  return apiFetch<Unit>(`/api/properties/${propertyId}/units`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
