const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; headers?: Record<string, string> } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") msg = data.detail;
      else if (Array.isArray(data?.detail)) msg = data.detail.map((d: { msg?: string }) => d.msg).join(", ");
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* -------------------------------- Types -------------------------------- */

export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  department: string | null;
  position: string | null;
  branch_id: number | null;
  hire_date: string | null;
  status: string;
  salary_type: string;
  base_salary: string;
  bank_name: string | null;
  bank_account: string | null;
  has_pin?: boolean;
  termination_date?: string | null;
  payment_method?: string;
  ssnit_number?: string | null;
  tin_number?: string | null;
  ssnit_exempt?: boolean;
  created_at: string;
}

export interface EmployeePayload {
  employee_code?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  department?: string;
  position?: string;
  branch_id?: number | null;
  hire_date?: string;
  status?: string;
  salary_type?: string;
  base_salary?: number;
  bank_name?: string;
  bank_account?: string;
  payment_method?: string;
  ssnit_number?: string;
  tin_number?: string;
  ssnit_exempt?: boolean;
  termination_date?: string;
  pin?: string;
}

export interface WorkerProfile {
  id: number;
  employee_code: string;
  full_name: string;
  department: string | null;
  position: string | null;
}

export interface WorkerMe {
  employee: WorkerProfile;
  today: AttendanceRecord | null;
  require_workplace_qr?: boolean;
}

export interface WorkerMonth {
  month: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  half_day: number;
  records: AttendanceRecord[];
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  notes: string | null;
  employee_name: string | null;
  employee_code: string | null;
}

export interface PayrollRun {
  id: number;
  label: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  payslips_count: number;
  total_net: string;
  total_gross: string;
  total_paye: string;
  total_ssnit_employee: string;
  total_ssnit_employer: string;
}

export interface Payslip {
  id: number;
  run_id: number;
  employee_id: number;
  days_present: number;
  days_late: number;
  days_absent: number;
  days_leave: number;
  basic_pay: string;
  allowances: string;
  deductions: string;
  ssnit_employee: string;
  paye: string;
  ssnit_employer: string;
  gross_pay: string;
  net_pay: string;
  notes: string | null;
  created_at: string;
  employee_name: string | null;
  employee_code: string | null;
  department: string | null;
  position: string | null;
  days_half?: number;
  days_holiday?: number;
  days_expected?: string;
  days_payable?: string;
  overtime_hours?: string;
  overtime_pay?: string;
  loan_deduction?: string;
  taxable_income?: string;
  ssnit_number?: string | null;
  tin_number?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  run_label?: string | null;
  run_status?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  items?: PayslipItem[];
  company_name?: string | null;
  company_address?: string | null;
  company_tin?: string | null;
}

export interface PayslipItem {
  id: number;
  kind: string;
  name: string;
  amount: string;
  taxable: boolean;
  source: string;
}

export interface Component {
  id: number;
  employee_id: number;
  name: string;
  kind: "ALLOWANCE" | "DEDUCTION";
  amount: string;
  taxable: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  employee_name: string | null;
  employee_code: string | null;
}

export interface LeaveBalance {
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  year: number;
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface Loan {
  id: number;
  employee_id: number;
  principal: string;
  installment: string;
  balance: string;
  reason: string | null;
  issued_date: string;
  status: string;
  created_at: string;
  employee_name: string | null;
  employee_code: string | null;
}

export interface Holiday { id: number; date: string; name: string }

export interface TaxBand { width: number | null; rate: number }

export interface PayrollSettings {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_tin: string | null;
  company_ssnit_no: string | null;
  ssnit_enabled: boolean;
  ssnit_employee_rate: string;
  ssnit_employer_rate: string;
  paye_enabled: boolean;
  tax_bands: TaxBand[];
  working_days_per_month: number;
  working_days_of_week: string;
  work_start_time: string;
  late_grace_minutes: number;
  standard_hours_per_day: string;
  overtime_enabled: boolean;
  overtime_multiplier: string;
  late_deduction_enabled: boolean;
  late_deduction_amount: string;
  annual_leave_days: number;
  kiosk_require_pin: boolean;
  require_workplace_qr: boolean;
  office_name: string;
  office_lat: string;
  office_lng: string;
  geofence_radius_m: number;
  min_checkout_minutes: number;
}

export interface QrInfo {
  payload: string; office_name: string; lat: number; lng: number; radius_m: number; maps_url: string | null;
}

export interface DailyRow {
  employee_id: number; employee_code: string; employee_name: string; department: string | null;
  position: string | null; phone: string | null; status: string;
  check_in: string | null; check_out: string | null; hours: string; late_minutes: number;
  distance_m: number | null; check_out_distance_m: number | null; maps_url: string | null;
  source: string | null; flagged: boolean; flag_reason: string | null;
}
export interface DailyBoard {
  date: string; is_working_day: boolean; holiday: string | null;
  summary: Record<string, number>; total: number; rows: DailyRow[];
  office: { name: string; lat: number; lng: number; radius_m: number };
}

export interface MonthSummary {
  days_attended: string; days_total: number; elapsed_days: number; late: number; late_minutes: number;
  absent: number; leave: number; hours: string; pct: number;
}
export interface MonthlyRow extends MonthSummary {
  employee_id: number; employee_code: string; employee_name: string; department: string | null; status: string;
  suggested_amount: string; paid_amount: string;
}
export interface MonthlyReport { month: string; working_days: number; employees: number; rows: MonthlyRow[] }

export interface DayDetail {
  date: string; weekday: string; status: string; holiday: string | null;
  check_in: string | null; check_out: string | null; hours: string; late_minutes: number;
  distance_m: number | null; maps_url: string | null; source: string | null; notes: string | null;
  flagged: boolean; flag_reason: string | null;
}
export interface PaymentLog {
  id: number; employee_id?: number; employee_name?: string | null; employee_code?: string | null;
  period?: string; amount: string; method: string; reference: string | null; note: string | null;
  paid_at: string; paid_by?: string; source?: string; days_attended: string | null; days_total: number | null;
}
export interface MonthlyDetail {
  employee: {
    id: number; code: string; name: string; department: string | null; position: string | null; phone: string | null;
    email: string | null; salary_type: string; base_salary: string; payment_method: string;
    bank_name: string | null; bank_account: string | null; hire_date: string | null;
  };
  month: string; summary: MonthSummary; suggested_amount: string; paid_amount: string;
  days: DayDetail[]; payments: PaymentLog[];
}
export interface ScanLogRow {
  id: number; at: string; kind: string; result: string; message: string | null;
  employee_id: number | null; employee_name: string | null; employee_code: string | null;
  lat: number | null; lng: number | null; accuracy_m: number | null; distance_m: number | null;
  flagged: boolean; maps_url: string | null;
}
export interface PaymentList { items: PaymentLog[]; total: string; by_method: Record<string, string>; count: number }

export interface WorkerDay {
  id: number | null; date: string; status: string; check_in: string | null; check_out: string | null;
  hours: string; late_minutes: number; distance_m: number | null; source: string | null; notes: string | null;
}
export interface WorkerHome {
  employee: WorkerProfile;
  today: WorkerDay | null;
  office: { name: string; radius_m: number; start_time: string; lat: number; lng: number };
  month: string; summary: MonthSummary;
  recent_scans: { at: string; kind: string; result: string; message: string | null; distance_m: number | null }[];
}
export interface ScanResult {
  kind: "CHECK_IN" | "CHECK_OUT"; message: string; status: string; at: string;
  check_in: string | null; check_out: string | null; distance_m: number;
}

export interface AuditEntry {
  id: number; action: string; entity_type: string; entity_id: number | null;
  actor: string; details: string | null; created_at: string;
}

export interface AttendanceReportRow {
  employee_id: number; employee_code: string; employee_name: string; department: string | null;
  present: number; late: number; absent: number; leave: number; half_day: number;
  hours_worked: string; overtime_hours: string;
}

export interface PayrollSummary {
  year: number;
  months: { run_id: number; label: string; status: string; employees: number; gross: string; ssnit_employee: string; ssnit_employer: string; paye: string; net: string; employer_cost: string }[];
  totals: Record<string, string>;
  latest_run: string | null;
  departments: { department: string; employees: number; gross: string; net: string }[];
}

export interface DashboardStats {
  total_employees: number;
  active_employees: number;
  present_today: number;
  late_today: number;
  absent_today: number;
  pending_runs: number;
  last_run_total: string;
  departments: number;
  on_leave_today?: number;
  pending_leave?: number;
  active_loans?: number;
  payroll_ytd?: string;
}

/* ------------------------------ API calls ------------------------------ */

export const api = {
  login: (body: { username: string; password: string }) =>
    request<{ access_token: string }>("/api/v1/auth/login", { method: "POST", body }),

  posSso: (pos_token: string) =>
    request<{ access_token: string }>("/api/v1/auth/pos-sso", { method: "POST", body: { pos_token } }),

  stamp: (t: string) => request<{ v: string }>("/api/v1/dashboard/stamp", { token: t }),
  dashboard: (t: string) => request<DashboardStats>("/api/v1/dashboard/stats", { token: t }),

  employees: (t: string, params?: { q?: string; status?: string; department?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.status) sp.set("status", params.status);
    if (params?.department) sp.set("department", params.department);
    const qs = sp.toString();
    return request<Employee[]>(`/api/v1/employees${qs ? `?${qs}` : ""}`, { token: t });
  },
  departments: (t: string) => request<string[]>("/api/v1/employees/departments", { token: t }),
  employee: (t: string, id: number | string) => request<Employee>(`/api/v1/employees/${id}`, { token: t }),
  createEmployee: (t: string, body: EmployeePayload) =>
    request<Employee>("/api/v1/employees", { method: "POST", body, token: t }),
  updateEmployee: (t: string, id: number | string, body: EmployeePayload) =>
    request<Employee>(`/api/v1/employees/${id}`, { method: "PATCH", body, token: t }),
  deleteEmployee: (t: string, id: number | string) =>
    request<void>(`/api/v1/employees/${id}`, { method: "DELETE", token: t }),

  attendance: (t: string, params?: { date_from?: string; date_to?: string; employee_id?: number; status?: string }) => {
    const sp = new URLSearchParams();
    if (params?.date_from) sp.set("date_from", params.date_from);
    if (params?.date_to) sp.set("date_to", params.date_to);
    if (params?.employee_id) sp.set("employee_id", String(params.employee_id));
    if (params?.status) sp.set("status", params.status);
    const qs = sp.toString();
    return request<AttendanceRecord[]>(`/api/v1/attendance${qs ? `?${qs}` : ""}`, { token: t });
  },
  manualAttendance: (t: string, body: { employee_id: number; date: string; status: string; notes?: string }) =>
    request<AttendanceRecord>("/api/v1/attendance/manual", { method: "POST", body, token: t }),

  deleteAttendance: (t: string, id: number) =>
    request<void>(`/api/v1/attendance/${id}`, { method: "DELETE", token: t }),
  attendanceReport: (t: string, from: string, to: string) =>
    request<AttendanceReportRow[]>(`/api/v1/attendance/report?date_from=${from}&date_to=${to}`, { token: t }),
  workplaceToken: (t: string) =>
    request<{ token: string; date: string }>("/api/v1/attendance/workplace-token", { token: t }),

  kioskCheckIn: (employee_code: string, pin?: string) =>
    request<AttendanceRecord>("/api/v1/attendance/check-in", { method: "POST", body: { employee_code, pin: pin || undefined } }),
  kioskCheckOut: (employee_code: string, pin?: string) =>
    request<AttendanceRecord>("/api/v1/attendance/check-out", { method: "POST", body: { employee_code, pin: pin || undefined } }),

  changePassword: (t: string, body: { current_password: string; new_password: string }) =>
    request<{ message: string }>("/api/v1/auth/change-password", { method: "POST", body, token: t }),

  components: (t: string, empId: number) => request<Component[]>(`/api/v1/employees/${empId}/components`, { token: t }),
  addComponent: (t: string, empId: number, body: { name: string; kind: string; amount: number; taxable: boolean }) =>
    request<Component>(`/api/v1/employees/${empId}/components`, { method: "POST", body, token: t }),
  deleteComponent: (t: string, empId: number, id: number) =>
    request<void>(`/api/v1/employees/${empId}/components/${id}`, { method: "DELETE", token: t }),

  leave: (t: string, params?: { status?: string }) =>
    request<LeaveRequest[]>(`/api/v1/leave${params?.status ? `?status=${params.status}` : ""}`, { token: t }),
  leaveBalances: (t: string) => request<LeaveBalance[]>("/api/v1/leave/balances", { token: t }),
  createLeave: (t: string, body: { employee_id: number; leave_type: string; start_date: string; end_date: string; reason?: string }) =>
    request<LeaveRequest>("/api/v1/leave", { method: "POST", body, token: t }),
  leaveAction: (t: string, id: number, action: "approve" | "reject" | "cancel", note?: string) =>
    request<LeaveRequest>(`/api/v1/leave/${id}/${action}`, { method: "POST", body: { note }, token: t }),

  loans: (t: string) => request<Loan[]>("/api/v1/loans", { token: t }),
  createLoan: (t: string, body: { employee_id: number; principal: number; installment: number; reason?: string }) =>
    request<Loan>("/api/v1/loans", { method: "POST", body, token: t }),
  cancelLoan: (t: string, id: number) => request<Loan>(`/api/v1/loans/${id}/cancel`, { method: "POST", token: t }),

  holidays: (t: string, year: number) => request<Holiday[]>(`/api/v1/holidays?year=${year}`, { token: t }),
  addHoliday: (t: string, body: { date: string; name: string }) =>
    request<Holiday>("/api/v1/holidays", { method: "POST", body, token: t }),
  deleteHoliday: (t: string, id: number) => request<void>(`/api/v1/holidays/${id}`, { method: "DELETE", token: t }),

  settings: (t: string) => request<PayrollSettings>("/api/v1/settings", { token: t }),
  updateSettings: (t: string, body: Partial<Omit<PayrollSettings, "tax_bands">> & { tax_bands?: TaxBand[] }) =>
    request<PayrollSettings>("/api/v1/settings", { method: "PATCH", body, token: t }),

  auditLogs: (t: string, q?: string) =>
    request<AuditEntry[]>(`/api/v1/audit-logs${q ? `?q=${encodeURIComponent(q)}` : ""}`, { token: t }),
  payrollSummary: (t: string, year: number) =>
    request<PayrollSummary>(`/api/v1/payroll/reports/summary?year=${year}`, { token: t }),

  runs: (t: string) => request<PayrollRun[]>("/api/v1/payroll/runs", { token: t }),
  createRun: (t: string, body: { label: string; period_start: string; period_end: string }) =>
    request<PayrollRun>("/api/v1/payroll/runs", { method: "POST", body, token: t }),
  run: (t: string, id: number | string) => request<PayrollRun>(`/api/v1/payroll/runs/${id}`, { token: t }),
  runPayslips: (t: string, id: number | string) =>
    request<Payslip[]>(`/api/v1/payroll/runs/${id}/payslips`, { token: t }),
  approveRun: (t: string, id: number | string) =>
    request<PayrollRun>(`/api/v1/payroll/runs/${id}/approve`, { method: "POST", token: t }),
  markPaid: (t: string, id: number | string) =>
    request<PayrollRun>(`/api/v1/payroll/runs/${id}/mark-paid`, { method: "POST", token: t }),
  payslip: (t: string, id: number | string) => request<Payslip>(`/api/v1/payroll/payslips/${id}`, { token: t }),
  updatePayslip: (t: string, id: number | string, body: { notes?: string }) =>
    request<Payslip>(`/api/v1/payroll/payslips/${id}`, { method: "PATCH", body, token: t }),
  addPayslipItem: (t: string, id: number | string, body: { kind: string; name: string; amount: number; taxable: boolean }) =>
    request<Payslip>(`/api/v1/payroll/payslips/${id}/items`, { method: "POST", body, token: t }),
  deletePayslipItem: (t: string, id: number | string, itemId: number) =>
    request<Payslip>(`/api/v1/payroll/payslips/${id}/items/${itemId}`, { method: "DELETE", token: t }),
  regenerateRun: (t: string, id: number | string) =>
    request<PayrollRun>(`/api/v1/payroll/runs/${id}/regenerate`, { method: "POST", token: t }),
  reopenRun: (t: string, id: number | string) =>
    request<PayrollRun>(`/api/v1/payroll/runs/${id}/reopen`, { method: "POST", token: t }),
  deleteRun: (t: string, id: number | string) =>
    request<void>(`/api/v1/payroll/runs/${id}`, { method: "DELETE", token: t }),

  /* ------------------------------ Worker ------------------------------ */
  workerRegister: (body: { full_name: string; phone: string; email?: string; password: string; position?: string }) =>
    request<{ message: string; employee_code: string }>("/api/v1/worker/register", { method: "POST", body }),
  workerHome: (t: string) => request<WorkerHome>("/api/v1/worker/me", { token: t }),
  workerHistory: (t: string, month?: string) =>
    request<{ month: string; summary: MonthSummary; days: WorkerDay[] }>(`/api/v1/worker/history${month ? `?month=${month}` : ""}`, { token: t }),
  workerScans: (t: string) =>
    request<{ at: string; kind: string; result: string; message: string | null; distance_m: number | null }[]>("/api/v1/worker/scans", { token: t }),
  workerPayments: (t: string) => request<PaymentLog[]>("/api/v1/worker/payments", { token: t }),
  workerScan: (t: string, body: { code: string; lat: number; lng: number; accuracy: number | null; device_id: string; client_time?: string }) =>
    request<ScanResult>("/api/v1/worker/scan", { method: "POST", body, token: t }),

  // admin: attendance
  qr: (t: string) => request<QrInfo>("/api/v1/attendance/qr", { token: t }),
  rotateQr: (t: string) => request<QrInfo>("/api/v1/attendance/qr/rotate", { method: "POST", token: t }),
  daily: (t: string, date?: string) => request<DailyBoard>(`/api/v1/attendance/daily${date ? `?date=${date}` : ""}`, { token: t }),
  monthly: (t: string, month?: string) => request<MonthlyReport>(`/api/v1/attendance/monthly${month ? `?month=${month}` : ""}`, { token: t }),
  monthlyDetail: (t: string, id: number, month?: string) =>
    request<MonthlyDetail>(`/api/v1/attendance/monthly/${id}${month ? `?month=${month}` : ""}`, { token: t }),
  scanLog: (t: string, from?: string, to?: string, flaggedOnly?: boolean) => {
    const sp = new URLSearchParams();
    if (from) sp.set("date_from", from);
    if (to) sp.set("date_to", to);
    if (flaggedOnly) sp.set("flagged_only", "true");
    return request<ScanLogRow[]>(`/api/v1/attendance/scans?${sp}`, { token: t });
  },
  approveEmployee: (t: string, id: number) => request<Employee>(`/api/v1/employees/${id}/approve`, { method: "POST", token: t }),
  rejectEmployee: (t: string, id: number) => request<void>(`/api/v1/employees/${id}/reject`, { method: "POST", token: t }),

  // admin: payment log
  payments: (t: string, period?: string) => request<PaymentList>(`/api/v1/payments${period ? `?period=${period}` : ""}`, { token: t }),
  recordPayment: (t: string, body: { employee_id: number; period: string; amount: number; method: string; reference?: string; note?: string }) =>
    request<PaymentLog>("/api/v1/payments", { method: "POST", body, token: t }),

  workerLogin: (employee_code: string, pin: string) =>
    request<{ access_token: string; employee: WorkerProfile }>("/api/v1/worker/login", {
      method: "POST", body: { employee_code, pin },
    }),
  workerMe: (t: string) => request<WorkerMe>("/api/v1/worker/me", { token: t }),
  workerPunch: (t: string, workplace?: string | null) =>
    request<AttendanceRecord>("/api/v1/worker/punch", { method: "POST", token: t, headers: workplace ? { "X-Workplace-Token": workplace } : undefined }),
  workerAttendance: (t: string, month?: string) =>
    request<WorkerMonth>(`/api/v1/worker/attendance${month ? `?month=${month}` : ""}`, { token: t }),
  workerPayslips: (t: string) => request<Payslip[]>("/api/v1/worker/payslips", { token: t }),
  workerPayslip: (t: string, id: number | string) => request<Payslip>(`/api/v1/worker/payslips/${id}`, { token: t }),
  workerLeave: (t: string) => request<LeaveRequest[]>("/api/v1/worker/leave", { token: t }),
  workerLeaveBalance: (t: string) => request<LeaveBalance>("/api/v1/worker/leave/balance", { token: t }),
  workerRequestLeave: (t: string, body: { leave_type: string; start_date: string; end_date: string; reason?: string }) =>
    request<LeaveRequest>("/api/v1/worker/leave", { method: "POST", body, token: t }),
  workerCancelLeave: (t: string, id: number) =>
    request<LeaveRequest>(`/api/v1/worker/leave/${id}/cancel`, { method: "POST", token: t }),
  workerChangePin: (t: string, body: { current_pin: string; new_pin: string }) =>
    request<{ message: string }>("/api/v1/worker/change-pin", { method: "POST", body, token: t }),
};

/** Download an authenticated CSV / file as a browser download. */
export async function downloadFile(path: string, token: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiFormData<T>(path: string, file: File, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: (() => { const form = new FormData(); form.append("file", file); return form; })(),
  });
  if (!response.ok) throw new ApiError(response.status, "Upload failed");
  return response.json() as Promise<T>;
}

/* ----------------------------- Formatting ------------------------------- */

export function cedi(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "₵0.00";
  return `₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
