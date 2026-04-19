import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Category, Tax } from "@/lib/types";
import { CURRENCIES } from "@/lib/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import { Lock, Plus, Trash2, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage categories, taxes and your account
        </p>
      </header>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="taxes">Taxes</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="taxes" className="mt-4">
          <TaxesTab />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────── CATEGORIES ───────────────────
function CategoriesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return (data ?? []) as Category[];
    },
  });
  const { data: hidden } = useQuery({
    queryKey: ["hidden-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("hidden_default_categories")
        .select("category_id");
      return new Set((data ?? []).map((r) => r.category_id as string));
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !user) return;
      const { error } = await supabase
        .from("categories")
        .insert({ user_id: user.id, name: name.trim(), icon: icon.trim() || null, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setName("");
      setIcon("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category removed");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleHiddenMut = useMutation({
    mutationFn: async ({ id, hide }: { id: string; hide: boolean }) => {
      if (!user) return;
      if (hide) {
        const { error } = await supabase
          .from("hidden_default_categories")
          .insert({ user_id: user.id, category_id: id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hidden_default_categories")
          .delete()
          .eq("user_id", user.id)
          .eq("category_id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hidden-categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = categories ?? [];
  const hiddenSet = hidden ?? new Set<string>();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
          <CardDescription>Custom categories appear alongside the defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2 flex-wrap items-end"
            onSubmit={(e) => {
              e.preventDefault();
              addMut.mutate();
            }}
          >
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-24">
              <Label className="text-xs">Emoji</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏷️" />
            </div>
            <Button type="submit" disabled={addMut.isPending}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {list.map((c) => {
            const isHidden = hiddenSet.has(c.id);
            return (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-xl w-8 text-center">{c.icon ?? "•"}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {c.is_default && (
                      <>
                        <Lock className="h-3 w-3" /> Default
                      </>
                    )}
                  </div>
                </div>
                {c.is_default ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleHiddenMut.mutate({ id: c.id, hide: !isHidden })}
                  >
                    {isHidden ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" /> Show
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 mr-1" /> Hide
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => delMut.mutate(c.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────── TAXES ───────────────────
const TAX_PRESETS = [
  { name: "Sales Tax", rate: 8.875 },
  { name: "Self-Employment Tax", rate: 15.3 },
  { name: "GST", rate: 5 },
  { name: "HST (ON)", rate: 13 },
  { name: "VAT", rate: 20 },
];

function TaxesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const { data: taxes } = useQuery({
    queryKey: ["taxes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("taxes").select("*").order("name");
      return (data ?? []) as Tax[];
    },
  });

  const addMut = useMutation({
    mutationFn: async (payload: { name: string; rate: number; is_default: boolean }) => {
      if (!user) return;
      const { error } = await supabase.from("taxes").insert({ ...payload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tax added");
      setName("");
      setRate("");
      setIsDefault(false);
      qc.invalidateQueries({ queryKey: ["taxes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Tax> }) => {
      const { error } = await supabase.from("taxes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["taxes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("taxes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tax removed");
      qc.invalidateQueries({ queryKey: ["taxes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = taxes ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a tax</CardTitle>
          <CardDescription>
            Marking it as <em>default</em> pre-checks it on every new expense.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2 flex-wrap items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !rate) return;
              addMut.mutate({ name: name.trim(), rate: Number(rate), is_default: isDefault });
            }}
          >
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-28">
              <Label className="text-xs">Rate (%)</Label>
              <Input
                type="number"
                step="0.001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2 px-2 h-9">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="def" />
              <Label htmlFor="def" className="text-sm">
                Default
              </Label>
            </div>
            <Button type="submit" disabled={addMut.isPending}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </form>
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
            <div className="flex flex-wrap gap-2">
              {TAX_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    addMut.mutate({ name: p.name, rate: p.rate, is_default: false })
                  }
                >
                  + {p.name} {p.rate}%
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">
              No taxes saved yet. Add one above.
            </p>
          ) : (
            list.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.rate}%</div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Default</Label>
                  <Switch
                    checked={t.is_default}
                    onCheckedChange={(v) =>
                      updateMut.mutate({ id: t.id, patch: { is_default: v } })
                    }
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => delMut.mutate(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────── ACCOUNT ───────────────────
function AccountTab() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pwd, setPwd] = useState("");
  const [savingCur, setSavingCur] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateCurrency = async (code: string) => {
    if (!user) return;
    setSavingCur(true);
    const { error } = await supabase
      .from("profiles")
      .update({ currency: code })
      .eq("id", user.id);
    setSavingCur(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Currency updated");
      await refreshProfile();
      qc.invalidateQueries();
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      setPwd("");
    }
  };

  const deleteAccount = async () => {
    // Deleting auth.users requires admin privileges. From the client we wipe
    // all user data (profile cascades to everything) and sign out.
    if (!user) return;
    const { error } = await supabase.from("profiles").delete().eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Your data has been deleted. Contact support to remove the auth record.");
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Select
              value={profile?.currency ?? "CAD"}
              onValueChange={updateCurrency}
              disabled={savingCur}
            >
              <SelectTrigger className="w-full md:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} — {c.code} · {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit">Update password</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete all your expenses, categories, taxes and receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete my data
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes every expense, category, tax and receipt linked to your account. The
              auth record itself can only be removed from the Supabase dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAccount}>Delete everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
