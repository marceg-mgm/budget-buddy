import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Expense, Category, Tax } from "@/lib/types";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Plus, Download, Eye, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExpenseDrawer } from "@/components/expense-drawer";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

const PAGE_SIZE = 20;

function ExpensesPage() {
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "CAD";
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [sort, setSort] = useState<{ col: keyof Expense; dir: "asc" | "desc" }>({
    col: "date",
    dir: "desc",
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptIsPdf, setReceiptIsPdf] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses-page", user?.id, page, from, to, categoryFilter, minAmt, maxAmt, sort],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*", { count: "exact" })
        .order(sort.col as string, { ascending: sort.dir === "asc" })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      if (categoryFilter !== "all") q = q.eq("category_id", categoryFilter);
      if (minAmt) q = q.gte("total_amount", Number(minAmt));
      if (maxAmt) q = q.lte("total_amount", Number(maxAmt));
      const { data, count } = await q;
      return { rows: (data ?? []) as Expense[], count: count ?? 0 };
    },
  });

  const { data: catData } = useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return (data ?? []) as Category[];
    },
  });
  const { data: taxData } = useQuery({
    queryKey: ["taxes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("taxes").select("*").order("name");
      return (data ?? []) as Tax[];
    },
  });

  const categories = catData ?? [];
  const taxes = taxData ?? [];
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses-page"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error("Could not load receipt");
      return;
    }
    setReceiptUrl(data.signedUrl);
    setReceiptIsPdf(path.toLowerCase().endsWith(".pdf"));
  };

  const exportCsv = async () => {
    let q = supabase.from("expenses").select("*").order("date", { ascending: false });
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (categoryFilter !== "all") q = q.eq("category_id", categoryFilter);
    if (minAmt) q = q.gte("total_amount", Number(minAmt));
    if (maxAmt) q = q.lte("total_amount", Number(maxAmt));
    const { data } = await q;
    const all = (data ?? []) as Expense[];
    const lines: string[] = [
      ["Date", "Category", "Description", "Base Amount", "Tax Name", "Tax Rate", "Tax Amount", "Tip", "Total Amount"]
        .map(csvField)
        .join(","),
    ];
    for (const e of all) {
      const cat = e.category_id ? catMap.get(e.category_id)?.name ?? "" : "";
      if (!e.taxes || e.taxes.length === 0) {
        lines.push(
          [e.date, cat, e.description ?? "", e.amount, "", "", "", e.tip_amount, e.total_amount]
            .map(csvField)
            .join(","),
        );
      } else {
        e.taxes.forEach((t, i) => {
          lines.push(
            [
              i === 0 ? e.date : "",
              i === 0 ? cat : "",
              i === 0 ? e.description ?? "" : "",
              i === 0 ? e.amount : "",
              t.name,
              t.rate,
              t.amount,
              i === 0 ? e.tip_amount : "",
              i === 0 ? e.total_amount : "",
            ]
              .map(csvField)
              .join(","),
          );
        });
      }
    }
    downloadFile(lines.join("\n"), `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success("Export ready");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Expenses</h1>
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
            <Plus className="h-4 w-4 mr-2" /> Add expense
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
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Min total</label>
            <Input
              type="number"
              step="0.01"
              value={minAmt}
              onChange={(e) => setMinAmt(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max total</label>
            <Input
              type="number"
              step="0.01"
              value={maxAmt}
              onChange={(e) => setMaxAmt(e.target.value)}
            />
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
              <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No expenses match your filters yet.
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDrawerOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> Add your first expense
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Date" col="date" sort={sort} setSort={setSort} />
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <SortHead label="Base" col="amount" sort={sort} setSort={setSort} className="text-right" />
                    <TableHead className="text-right">Taxes</TableHead>
                    <SortHead label="Tip" col="tip_amount" sort={sort} setSort={setSort} className="text-right" />
                    <SortHead label="Total" col="total_amount" sort={sort} setSort={setSort} className="text-right" />
                    <TableHead>Receipt</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => {
                    const cat = e.category_id ? catMap.get(e.category_id) : null;
                    const taxSum = (e.taxes ?? []).reduce((s, t) => s + Number(t.amount), 0);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(e.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {cat ? `${cat.icon ?? ""} ${cat.name}` : "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{e.description ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(Number(e.amount), currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(taxSum, currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(Number(e.tip_amount), currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatMoney(Number(e.total_amount), currency)}
                        </TableCell>
                        <TableCell>
                          {e.receipt_url ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openReceipt(e.receipt_url!)}
                              title="View receipt"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(e);
                                setDrawerOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmDelete(e.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      <ExpenseDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editing={editing}
        categories={categories}
        taxes={taxes}
        currency={currency}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["expenses-page"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />

      <Dialog
        open={!!receiptUrl}
        onOpenChange={(o) => {
          if (!o) {
            setReceiptUrl(null);
            setReceiptIsPdf(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {receiptUrl &&
            (receiptIsPdf ? (
              <iframe src={receiptUrl} className="w-full h-[70vh] rounded border" title="Receipt" />
            ) : (
              <img src={receiptUrl} alt="Receipt" className="w-full max-h-[70vh] object-contain" />
            ))}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
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
  col: keyof Expense;
  sort: { col: keyof Expense; dir: "asc" | "desc" };
  setSort: (v: { col: keyof Expense; dir: "asc" | "desc" }) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() =>
          setSort({ col, dir: active && sort.dir === "desc" ? "asc" : "desc" })
        }
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

function Receipt(props: React.SVGProps<SVGSVGElement>) {
  return <FileText {...props} />;
}
