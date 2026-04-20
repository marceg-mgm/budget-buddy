export interface Profile {
  id: string;
  email: string | null;
  currency: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Tax {
  id: string;
  user_id: string;
  name: string;
  rate: number;
  is_default: boolean;
  created_at: string;
}

export interface ExpenseTaxLine {
  tax_id: string | null;
  name: string;
  rate: number;
  amount: number;
}

export interface Expense {
  id: string;
  user_id: string;
  date: string;
  category_id: string | null;
  description: string | null;
  amount: number;
  taxes: ExpenseTaxLine[];
  tip_amount: number;
  tip_percentage: number | null;
  total_amount: number;
  receipt_url: string | null;
  created_at: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid";

export interface Invoice {
  id: string;
  user_id: string;
  date: string;
  transaction_type: string;
  invoice_number: string;
  client_name: string;
  currency: string;
  amount: number;
  net_amount: number;
  tax_amount: number;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
}

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}
