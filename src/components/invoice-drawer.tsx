import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";
import { CURRENCIES, formatMoney, round2 } from "@/lib/currency";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Invoice | null;
  defaultCurrency: string;
  customTypes: string[];
  onAddType: (t: string) => void;
  suggestNextNumber: () => string;
  onSaved: () => void;
}

const BASE_TYPES = ["Invoice", "Credit Note", "Receipt", "Quote"];
const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

function emptyItem(): InvoiceItem {
  return { description: "", quantity: 1, unit_price: 0, tax_rate: 0 };
}

function itemSubtotal(it: InvoiceItem): number {
  return round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
}
function itemTax(it: InvoiceItem): number {
  return round2((itemSubtotal(it) * (Number(it.tax_rate) || 0)) / 100);
}
function itemTotal(it: InvoiceItem): number {
  return round2(itemSubtotal(it) + itemTax(it));
}

export function InvoiceDrawer({
  open,
  onOpenChange,
  editing,
  defaultCurrency,
  customTypes,
  onAddType,
  suggestNextNumber,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [transactionType, setTransactionType] = useState("Invoice");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [notes, setNotes] = useState("");
  const [newType, setNewType] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setTransactionType(editing.transaction_type);
      setInvoiceNumber(editing.invoice_number);
      setClientName(editing.client_name);
      setCurrency(editing.currency);
      setStatus(editing.status);
      setNotes(editing.notes ?? "");
      const existing = Array.isArray(editing.items) ? editing.items : [];
      if (existing.length > 0) {
        setItems(
          existing.map((it) => ({
            description: it.description ?? "",
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            tax_rate: Number(it.tax_rate) || 0,
          })),
        );
      } else {
        // Legacy invoice with totals only — seed a single line from the totals.
        const subtotal = Number(editing.amount) || 0;
        const tax = Number(editing.tax_amount) || 0;
        const rate = subtotal > 0 ? round2((tax / subtotal) * 100) : 0;
        setItems([
          {
            description: editing.notes?.split("\n")[0]?.slice(0, 80) || "Item",
            quantity: 1,
            unit_price: subtotal,
            tax_rate: rate,
          },
        ]);
      }
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTransactionType("Invoice");
      setInvoiceNumber(suggestNextNumber());
      setClientName("");
      setCurrency(defaultCurrency);
      setItems([emptyItem()]);
      setStatus("draft");
      setNotes("");
    }
    setNewType("");
  }, [open, editing, defaultCurrency, suggestNextNumber]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      subtotal += itemSubtotal(it);
      tax += itemTax(it);
    }
    subtotal = round2(subtotal);
    tax = round2(tax);
    return { subtotal, tax, total: round2(subtotal + tax) };
  }, [items]);

  const allTypes = useMemo(() => {
    const set = new Set([...BASE_TYPES, ...customTypes]);
    return Array.from(set);
  }, [customTypes]);

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!invoiceNumber.trim()) throw new Error("Invoice number is required");
      if (!clientName.trim()) throw new Error("Client name is required");
      if (items.length === 0) throw new Error("Add at least one item");
      for (const [i, it] of items.entries()) {
        if (!it.description.trim()) throw new Error(`Item ${i + 1}: description required`);
        if ((Number(it.quantity) || 0) <= 0) throw new Error(`Item ${i + 1}: quantity must be > 0`);
        if ((Number(it.unit_price) || 0) < 0) throw new Error(`Item ${i + 1}: unit price invalid`);
        if ((Number(it.tax_rate) || 0) < 0) throw new Error(`Item ${i + 1}: tax % invalid`);
      }

      const cleanItems: InvoiceItem[] = items.map((it) => ({
        description: it.description.trim(),
        quantity: round2(Number(it.quantity) || 0),
        unit_price: round2(Number(it.unit_price) || 0),
        tax_rate: round2(Number(it.tax_rate) || 0),
      }));

      const payload = {
        user_id: user.id,
        date,
        transaction_type: transactionType,
        invoice_number: invoiceNumber.trim(),
        client_name: clientName.trim(),
        currency,
        amount: totals.subtotal,
        tax_amount: totals.tax,
        net_amount: totals.total,
        status,
        notes: notes.trim() || null,
        items: cleanItems,
      };

      if (editing) {
        const { error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Invoice updated" : "Invoice saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit invoice" : "New invoice"}</SheetTitle>
          <SheetDescription>
            Add one or more items. Subtotal, tax and total are calculated automatically.
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
              <Label className="text-xs">Transaction type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Add custom type
              </Label>
              <Input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="e.g. Proforma"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const t = newType.trim();
                if (!t) return;
                onAddType(t);
                setTransactionType(t);
                setNewType("");
              }}
            >
              Add
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as InvoiceStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Client name</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Acme Inc."
              required
            />
          </div>

          <div>
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="max-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── LINE ITEMS ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => {
                const sub = itemSubtotal(it);
                const tax = itemTax(it);
                const tot = itemTotal(it);
                return (
                  <div
                    key={idx}
                    className="rounded-lg border bg-card p-3 space-y-2"
                  >
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">
                          Description
                        </Label>
                        <Input
                          value={it.description}
                          onChange={(e) =>
                            updateItem(idx, { description: e.target.value })
                          }
                          placeholder="What are you charging for?"
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-5 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(idx, { quantity: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Unit price
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unit_price}
                          onChange={(e) =>
                            updateItem(idx, { unit_price: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Tax %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.tax_rate}
                          onChange={(e) =>
                            updateItem(idx, { tax_rate: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 text-xs text-muted-foreground pt-1 border-t">
                      <span>
                        Subtotal:{" "}
                        <span className="tabular-nums text-foreground font-medium">
                          {formatMoney(sub, currency)}
                        </span>
                      </span>
                      <span>
                        Tax:{" "}
                        <span className="tabular-nums text-foreground font-medium">
                          {formatMoney(tax, currency)}
                        </span>
                      </span>
                      <span>
                        Total:{" "}
                        <span className="tabular-nums text-foreground font-semibold">
                          {formatMoney(tot, currency)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="rounded-lg bg-muted p-4 grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Subtotal</div>
              <div className="tabular-nums font-medium">
                {formatMoney(totals.subtotal, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tax</div>
              <div className="tabular-nums font-medium">
                {formatMoney(totals.tax, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="tabular-nums font-semibold">
                {formatMoney(totals.total, currency)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
