import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseTaxLine, Category, Tax } from "@/lib/types";
import { formatMoney, round2 } from "@/lib/currency";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Expense | null;
  categories: Category[];
  taxes: Tax[];
  currency: string;
  onSaved: () => void;
}

interface DraftTax {
  tax_id: string | null;
  name: string;
  rate: number;
  selected: boolean;
}

export function ExpenseDrawer({
  open,
  onOpenChange,
  editing,
  categories,
  taxes,
  currency,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [draftTaxes, setDraftTaxes] = useState<DraftTax[]>([]);
  const [tipEnabled, setTipEnabled] = useState(false);
  const [tipPct, setTipPct] = useState("");
  const [tipAmt, setTipAmt] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");

  // initialise / reset
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setCategoryId(editing.category_id ?? "");
      setDescription(editing.description ?? "");
      setAmount(String(editing.amount));
      const fromExp = (editing.taxes ?? []).map((t) => ({
        tax_id: t.tax_id,
        name: t.name,
        rate: Number(t.rate),
        selected: true,
      }));
      // merge with the user's saved taxes (so unselected ones still show)
      const seen = new Set(fromExp.filter((t) => t.tax_id).map((t) => t.tax_id));
      const merged: DraftTax[] = [
        ...fromExp,
        ...taxes
          .filter((t) => !seen.has(t.id))
          .map((t) => ({ tax_id: t.id, name: t.name, rate: Number(t.rate), selected: false })),
      ];
      setDraftTaxes(merged);
      setTipEnabled(Number(editing.tip_amount) > 0);
      setTipPct(editing.tip_percentage ? String(editing.tip_percentage) : "");
      setTipAmt(editing.tip_amount ? String(editing.tip_amount) : "");
      setReceiptPath(editing.receipt_url);
      setReceiptFile(null);
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setCategoryId("");
      setDescription("");
      setAmount("");
      setDraftTaxes(
        taxes.map((t) => ({
          tax_id: t.id,
          name: t.name,
          rate: Number(t.rate),
          selected: t.is_default,
        })),
      );
      setTipEnabled(false);
      setTipPct("");
      setTipAmt("");
      setReceiptPath(null);
      setReceiptFile(null);
    }
    setNewCatName("");
    setNewTaxName("");
    setNewTaxRate("");
  }, [open, editing, taxes]);

  const baseNum = Number(amount) || 0;

  const taxLines: ExpenseTaxLine[] = useMemo(
    () =>
      draftTaxes
        .filter((t) => t.selected)
        .map((t) => ({
          tax_id: t.tax_id,
          name: t.name,
          rate: t.rate,
          amount: round2((baseNum * t.rate) / 100),
        })),
    [draftTaxes, baseNum],
  );
  const taxesSum = taxLines.reduce((s, t) => s + t.amount, 0);

  const tipNum = tipEnabled ? Number(tipAmt) || 0 : 0;
  const total = round2(baseNum + taxesSum + tipNum);

  const onTipPctChange = (v: string) => {
    setTipPct(v);
    if (v === "") {
      setTipAmt("");
      return;
    }
    setTipAmt(String(round2((baseNum * Number(v)) / 100)));
  };
  const onTipAmtChange = (v: string) => {
    setTipAmt(v);
    if (v === "" || baseNum === 0) {
      setTipPct("");
      return;
    }
    setTipPct(String(round2((Number(v) * 100) / baseNum)));
  };

  const addInlineCategory = async () => {
    if (!newCatName.trim() || !user) return;
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: user.id, name: newCatName.trim(), is_default: false })
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not create");
      return;
    }
    toast.success("Category added");
    categories.push(data as Category);
    setCategoryId((data as Category).id);
    setNewCatName("");
  };

  const addInlineTax = () => {
    if (!newTaxName.trim() || !newTaxRate) return;
    setDraftTaxes((prev) => [
      ...prev,
      { tax_id: null, name: newTaxName.trim(), rate: Number(newTaxRate), selected: true },
    ]);
    setNewTaxName("");
    setNewTaxRate("");
  };

  const onPickReceipt = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Max file size 10 MB");
      return;
    }
    setReceiptFile(f);
  };

  const removeReceipt = async () => {
    if (receiptPath) {
      await supabase.storage.from("receipts").remove([receiptPath]);
      setReceiptPath(null);
    }
    setReceiptFile(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!amount || Number(amount) < 0) throw new Error("Enter a valid amount");

      let finalReceiptPath = receiptPath;
      if (receiptFile) {
        setUploading(true);
        const ext = receiptFile.name.split(".").pop() ?? "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("receipts")
          .upload(path, receiptFile, { contentType: receiptFile.type });
        setUploading(false);
        if (error) throw error;
        // remove old one if replacing
        if (receiptPath) {
          await supabase.storage.from("receipts").remove([receiptPath]);
        }
        finalReceiptPath = path;
      }

      const payload = {
        user_id: user.id,
        date,
        category_id: categoryId || null,
        description: description.trim() || null,
        amount: round2(baseNum),
        taxes: taxLines,
        tip_amount: round2(tipNum),
        tip_percentage: tipPct ? Number(tipPct) : null,
        total_amount: total,
        receipt_url: finalReceiptPath,
      };

      if (editing) {
        const { error } = await supabase
          .from("expenses")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit expense" : "Add expense"}</SheetTitle>
          <SheetDescription>
            All amounts compute in real time. Save when you're ready.
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Quick add new category</Label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Coworking"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addInlineCategory}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div>
            <Label className="text-xs">Base amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Taxes */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide">Taxes</Label>
            <div className="rounded-lg border divide-y">
              {draftTaxes.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">
                  You have no saved taxes. Add one below or in Settings.
                </p>
              )}
              {draftTaxes.map((t, i) => (
                <label
                  key={`${t.tax_id ?? "x"}-${i}`}
                  className="flex items-center gap-3 p-3 cursor-pointer"
                >
                  <Checkbox
                    checked={t.selected}
                    onCheckedChange={(v) =>
                      setDraftTaxes((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, selected: !!v } : x)),
                      )
                    }
                  />
                  <div className="flex-1 text-sm">
                    {t.name} <span className="text-muted-foreground">({t.rate}%)</span>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {formatMoney(round2((baseNum * t.rate) / 100), currency)}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">One-off tax name</Label>
                <Input
                  value={newTaxName}
                  onChange={(e) => setNewTaxName(e.target.value)}
                  placeholder="e.g. Surcharge"
                />
              </div>
              <div className="w-24">
                <Label className="text-xs text-muted-foreground">Rate %</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={newTaxRate}
                  onChange={(e) => setNewTaxRate(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addInlineTax}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide">Tip</Label>
              <div className="flex items-center gap-2">
                <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} id="tip" />
                <Label htmlFor="tip" className="text-xs">
                  {tipEnabled ? "On" : "Off"}
                </Label>
              </div>
            </div>
            {tipEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Percentage</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tipPct}
                    onChange={(e) => onTipPctChange(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tipAmt}
                    onChange={(e) => onTipAmtChange(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Receipt */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide">Receipt</Label>
            {receiptFile || receiptPath ? (
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 text-sm truncate">
                  {receiptFile ? receiptFile.name : receiptPath?.split("/").pop()}
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={removeReceipt}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground cursor-pointer hover:bg-accent">
                <Upload className="h-4 w-4" />
                Click or drop a JPEG, PNG or PDF
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => onPickReceipt(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {/* Live total */}
          <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base</span>
              <span className="tabular-nums">{formatMoney(baseNum, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxes</span>
              <span className="tabular-nums">{formatMoney(taxesSum, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tip</span>
              <span className="tabular-nums">{formatMoney(tipNum, currency)}</span>
            </div>
            <div className="border-t pt-1 mt-1 flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total, currency)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMut.isPending || uploading}>
              {saveMut.isPending || uploading ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
