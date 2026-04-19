import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Expense, Category } from "@/lib/types";
import { formatMoney } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  format,
} from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Preset = "this_month" | "last_month" | "quarter" | "year" | "custom";

function ReportsPage() {
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "CAD";
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "this_month") {
      setFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setTo(format(endOfMonth(now), "yyyy-MM-dd"));
    } else if (p === "last_month") {
      const lm = subMonths(now, 1);
      setFrom(format(startOfMonth(lm), "yyyy-MM-dd"));
      setTo(format(endOfMonth(lm), "yyyy-MM-dd"));
    } else if (p === "quarter") {
      setFrom(format(startOfQuarter(now), "yyyy-MM-dd"));
      setTo(format(endOfQuarter(now), "yyyy-MM-dd"));
    } else if (p === "year") {
      setFrom(format(startOfYear(now), "yyyy-MM-dd"));
      setTo(format(endOfYear(now), "yyyy-MM-dd"));
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["report", user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: exps }, { data: cats }] = await Promise.all([
        supabase.from("expenses").select("*").gte("date", from).lte("date", to),
        supabase.from("categories").select("*"),
      ]);
      return {
        expenses: (exps ?? []) as Expense[],
        categories: (cats ?? []) as Category[],
      };
    },
  });

  const expenses = data?.expenses ?? [];
  const categories = data?.categories ?? [];
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const breakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; base: number; taxes: number; tips: number; total: number }
    >();
    for (const e of expenses) {
      const key = e.category_id ?? "_none";
      const name =
        e.category_id ? catMap.get(e.category_id)?.name ?? "Uncategorized" : "Uncategorized";
      const taxSum = (e.taxes ?? []).reduce((s, t) => s + Number(t.amount), 0);
      const cur = map.get(key) ?? { name, count: 0, base: 0, taxes: 0, tips: 0, total: 0 };
      cur.count += 1;
      cur.base += Number(e.amount);
      cur.taxes += taxSum;
      cur.tips += Number(e.tip_amount);
      cur.total += Number(e.total_amount);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, catMap]);

  const taxSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const e of expenses) {
      for (const t of e.taxes ?? []) {
        const key = `${t.name}|${t.rate}`;
        const cur = map.get(key) ?? { name: `${t.name} (${t.rate}%)`, count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(t.amount);
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const palette = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  const exportCsv = () => {
    const lines: string[] = [
      ["Date", "Category", "Description", "Base Amount", "Tax Name", "Tax Rate", "Tax Amount", "Tip", "Total"]
        .map(csvField)
        .join(","),
    ];
    for (const e of expenses) {
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
    downloadFile(lines.join("\n"), `report-${from}-to-${to}.csv`);
    toast.success("Report exported");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tax-ready breakdown of your spending
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" /> Download report
        </Button>
      </header>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Range</label>
            <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="quarter">This quarter</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("custom");
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("custom");
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No data in range.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="total"
                      nameKey="name"
                      outerRadius={90}
                      innerRadius={50}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={palette[i % palette.length]} />
                      ))}
                    </Pie>
                    <RTooltip
                      formatter={(v: number) => formatMoney(Number(v), currency)}
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax summary</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : taxSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No taxes recorded in range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Times applied</TableHead>
                    <TableHead className="text-right">Total paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxSummary.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(t.total, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground p-12 text-center">No expenses in this range yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right"># Expenses</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Taxes</TableHead>
                  <TableHead className="text-right">Tips</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.base, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.taxes, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.tips, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatMoney(b.total, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
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
