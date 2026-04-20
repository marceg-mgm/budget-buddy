import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Invoice, InvoiceStatus } from "@/lib/types";
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
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [netManual, setNetManual] = useState(false);
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
      setAmount(String(editing.amount));
      setTaxAmount(String(editing.tax_amount));
      setNetAmount(String(editing.net_amount));
      setNetManual(true);
      setStatus(editing.status);
      setNotes(editing.notes ?? "");
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTransactionType("Invoice");
      setInvoiceNumber(suggestNextNumber());
      setClientName("");
      setCurrency(defaultCurrency);
      setAmount("");
      setTaxAmount("");
      setNetAmount("");
      setNetManual(false);
      setStatus("draft");
      setNotes("");
    }
    setNewType("");
  }, [open, editing, defaultCurrency, suggestNextNumber]);

  const baseNum = Number(amount) || 0;
  const taxNum = Number(taxAmount) || 0;

  const computedNet = useMemo(() => round2(baseNum - taxNum), [baseNum, taxNum]);
  const netNum = netManual && netAmount !== "" ? Number(netAmount) || 0 : computedNet;

  // Auto-fill net when not manually edited
  useEffect(() => {
    if (!netManual) setNetAmount(String(computedNet));
  }, [computedNet, netManual]);

  const allTypes = useMemo(() => {
    const set = new Set([...BASE_TYPES, ...customTypes]);
    return Array.from(set);
  }, [customTypes]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!invoiceNumber.trim()) throw new Error("Invoice number is required");
      if (!clientName.trim()) throw new Error("Client name is required");
      if (!amount || baseNum < 0) throw new Error("Enter a valid amount");

      const payload = {
        user_id: user.id,
        date,
        transaction_type: transactionType,
        invoice_number: invoiceNumber.trim(),
        client_name: clientName.trim(),
        currency,
        amount: round2(baseNum),
        tax_amount: round2(taxNum),
        net_amount: round2(netNum),
        status,
        notes: notes.trim() || null,
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
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit invoice" : "New invoice"}</SheetTitle>
          <SheetDescription>
            Net updates as you change Amount or Tax. Save when you&apos;re ready.
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
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
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Tax amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Net amount</Label>
              {netManual && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setNetManual(false);
                    setNetAmount(String(computedNet));
                  }}
                >
                  Reset to auto
                </button>
              )}
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={netAmount}
              onChange={(e) => {
                setNetManual(true);
                setNetAmount(e.target.value);
              }}
            />
            {!netManual && (
              <p className="text-xs text-muted-foreground mt-1">
                Auto = Amount − Tax. Type to override.
              </p>
            )}
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
              <div className="text-xs text-muted-foreground">Amount</div>
              <div className="tabular-nums font-medium">
                {formatMoney(baseNum, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tax</div>
              <div className="tabular-nums font-medium">
                {formatMoney(taxNum, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net</div>
              <div className="tabular-nums font-semibold">
                {formatMoney(netNum, currency)}
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
