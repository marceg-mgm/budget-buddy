import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Invoice, InvoiceStatus, BusinessProfile } from "@/lib/types";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Download, Pencil, Trash2, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { InvoiceDrawer } from "@/components/invoice-drawer";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
});

const PAGE_SIZE = 20;
const CUSTOM_TYPES_KEY = "ledger.invoice.custom_types";

const STATUS_VARIANT: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

type SortCol = "date" | "invoice_number" | "client_name" | "amount" | "net_amount" | "tax_amount" | "status";

function InvoicesPage() {
  const { user, profile } = useAuth();
  const defaultCurrency = profile?.currency ?? "USD";
  const qc = useQueryClient();

  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({
    col: "date",
    dir: "desc",
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const addCustomType = useCallback((t: string) => {
    setCustomTypes((prev) => {
      if (prev.includes(t)) return prev;
      const next = [...prev, t];
      try {
        localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: [
      "invoices-page",
      user?.id,
      page,
      from,
      to,
      clientSearch,
      typeFilter,
      statusFilter,
      sort,
    ],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*", { count: "exact" })
        .order(sort.col, { ascending: sort.dir === "asc" })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      if (clientSearch) q = q.ilike("client_name", `%${clientSearch}%`);
      if (typeFilter !== "all") q = q.eq("transaction_type", typeFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Invoice[], count: count ?? 0 };
    },
  });

  // For "next number" suggestion: fetch the latest invoice number for this user
  const { data: lastNumber } = useQuery({
    queryKey: ["invoices-last-number", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("invoice_number")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []).map((r) => r.invoice_number as string);
    },
  });

  const suggestNextNumber = useCallback(() => {
    const list = lastNumber ?? [];
    // Find a "PREFIX-NNN" style match and bump
    for (const num of list) {
      const m = num.match(/^(.*?)(\d+)\s*$/);
      if (m) {
        const prefix = m[1];
        const n = parseInt(m[2], 10);
        const width = m[2].length;
        return `${prefix}${String(n + 1).padStart(width, "0")}`;
      }
    }
    return "INV-001";
  }, [lastNumber]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices-page"] });
      qc.invalidateQueries({ queryKey: ["invoices-last-number"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const allTypes = useMemo(
    () => Array.from(new Set(["Invoice", "Credit Note", "Receipt", "Quote", ...customTypes])),
    [customTypes],
  );

  const exportCsv = async () => {
    let q = supabase.from("invoices").select("*").order("date", { ascending: false });
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (clientSearch) q = q.ilike("client_name", `%${clientSearch}%`);
    if (typeFilter !== "all") q = q.eq("transaction_type", typeFilter);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    const all = (data ?? []) as Invoice[];
    const header = [
      "Date",
      "Invoice #",
      "Type",
      "Client",
      "Currency",
      "Amount",
      "Tax",
      "Net",
      "Status",
      "Notes",
    ];
    const lines = [header.map(csvField).join(",")];
    for (const inv of all) {
      lines.push(
        [
          inv.date,
          inv.invoice_number,
          inv.transaction_type,
          inv.client_name,
          inv.currency,
          inv.amount,
          inv.tax_amount,
          inv.net_amount,
          inv.status,
          inv.notes ?? "",
        ]
          .map(csvField)
          .join(","),
      );
    }
    downloadFile(lines.join("\n"), `invoices-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success("Export ready");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalCount} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New invoice
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Client</label>
            <Input
              placeholder="Search…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {allTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No invoices yet. Create your first invoice!
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDrawerOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> New invoice
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Date" col="date" sort={sort} setSort={setSort} />
                    <SortHead label="Invoice #" col="invoice_number" sort={sort} setSort={setSort} />
                    <TableHead>Type</TableHead>
                    <SortHead label="Client" col="client_name" sort={sort} setSort={setSort} />
                    <TableHead>Currency</TableHead>
                    <SortHead label="Amount" col="amount" sort={sort} setSort={setSort} className="text-right" />
                    <SortHead label="Tax" col="tax_amount" sort={sort} setSort={setSort} className="text-right" />
                    <SortHead label="Net" col="net_amount" sort={sort} setSort={setSort} className="text-right" />
                    <SortHead label="Status" col="status" sort={sort} setSort={setSort} />
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(inv.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.transaction_type}
                      </TableCell>
                      <TableCell>{inv.client_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inv.currency}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(inv.amount), inv.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(inv.tax_amount), inv.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(Number(inv.net_amount), inv.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize border-0 ${STATUS_VARIANT[inv.status]}`}
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(inv);
                              setDrawerOpen(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDelete(inv.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <InvoiceDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editing={editing}
        defaultCurrency={defaultCurrency}
        customTypes={customTypes}
        onAddType={addCustomType}
        suggestNextNumber={suggestNextNumber}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["invoices-page"] });
          qc.invalidateQueries({ queryKey: ["invoices-last-number"] });
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortHead({
  label,
  col,
  sort,
  setSort,
  className,
}: {
  label: string;
  col: SortCol;
  sort: { col: SortCol; dir: "asc" | "desc" };
  setSort: (v: { col: SortCol; dir: "asc" | "desc" }) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort({ col, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
      >
        {label}
        {active && <span className="text-xs">{sort.dir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </TableHead>
  );
}

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
