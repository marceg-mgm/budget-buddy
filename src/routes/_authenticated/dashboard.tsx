import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Expense, Category } from "@/lib/types";
import { formatMoney } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, TrendingUp, Calculator } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "CAD";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = startOfMonth(subMonths(new Date(), 5)).toISOString().slice(0, 10);
      const [{ data: exps }, { data: cats }] = await Promise.all([
        supabase
          .from("expenses")
          .select("*")
          .gte("date", since)
          .order("date", { ascending: false }),
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
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const thisMonth = expenses.filter((e) => {
    const d = new Date(e.date);
    return d >= monthStart && d <= monthEnd;
  });
  const monthTotal = thisMonth.reduce((s, e) => s + Number(e.total_amount), 0);
  const monthTaxes = thisMonth.reduce(
    (s, e) => s + (e.taxes ?? []).reduce((ss, t) => ss + Number(t.amount), 0),
    0,
  );

  // chart data: last 6 months × top categories
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM") };
  });
  const chartData = months.map((m) => {
    const row: Record<string, number | string> = { month: m.label };
    expenses
      .filter((e) => format(new Date(e.date), "yyyy-MM") === m.key)
      .forEach((e) => {
        const c = e.category_id ? catMap.get(e.category_id)?.name ?? "Other" : "Other";
        row[c] = (Number(row[c] ?? 0) + Number(e.total_amount)) as number;
      });
    return row;
  });
  const usedCats = Array.from(
    new Set(
      expenses
        .map((e) => (e.category_id ? catMap.get(e.category_id)?.name : null))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 5);
  const palette = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  const recent = expenses.slice(0, 5);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your activity for {format(new Date(), "MMMM yyyy")}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Expenses this month"
          value={isLoading ? null : formatMoney(monthTotal, currency)}
        />
        <SummaryCard
          icon={<Calculator className="h-4 w-4" />}
          label="Taxes paid this month"
          value={isLoading ? null : formatMoney(monthTaxes, currency)}
        />
        <SummaryCard
          icon={<Receipt className="h-4 w-4" />}
          label="Number of expenses"
          value={isLoading ? null : String(thisMonth.length)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly expenses by category</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.every((r) => Object.keys(r).length === 1) ? (
            <EmptyChart />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip
                    formatter={(v: number) => formatMoney(Number(v), currency)}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  {usedCats.map((c, i) => (
                    <Bar key={c} dataKey={c} stackId="a" fill={palette[i % palette.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No expenses yet. Head to the Expenses tab to add your first one.
            </p>
          ) : (
            <div className="divide-y">
              {recent.map((e) => {
                const cat = e.category_id ? catMap.get(e.category_id) : null;
                return (
                  <div key={e.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {cat?.icon} {cat?.name ?? "Uncategorized"}
                        {e.description ? (
                          <span className="text-muted-foreground font-normal"> — {e.description}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(e.date), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">
                      {formatMoney(Number(e.total_amount), currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {value === null ? <Skeleton className="h-7 w-32" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
      No data yet for the last 6 months.
    </div>
  );
}
