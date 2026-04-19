import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export function SetupBanner() {
  return (
    <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm space-y-2">
          <p className="font-semibold">Supabase isn't configured yet</p>
          <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
            <li>
              Run <code className="px-1 py-0.5 rounded bg-muted text-foreground">supabase/schema.sql</code>{" "}
              in your Supabase SQL editor.
            </li>
            <li>
              Open{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-foreground">src/config/supabase.ts</code>{" "}
              and paste your <em>Project URL</em> and <em>anon public key</em> (Project Settings → API).
            </li>
            <li>Reload the app and create your account.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
