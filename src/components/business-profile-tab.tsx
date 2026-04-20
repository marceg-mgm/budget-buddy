import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { BusinessProfile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export function BusinessProfileTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["business-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_profile_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data ?? null) as BusinessProfile | null;
    },
  });

  useEffect(() => {
    if (profile) {
      setName(profile.business_name ?? "");
      setEmail(profile.business_email ?? "");
      setPhone(profile.business_phone ?? "");
      setAddress(profile.business_address ?? "");
      setLogoUrl(profile.logo_url ?? null);
    }
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      business_name: name.trim() || null,
      business_email: email.trim() || null,
      business_phone: phone.trim() || null,
      business_address: address.trim() || null,
      logo_url: logoUrl,
    };
    const { error } = await supabase
      .from("user_profile_settings")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Business profile saved");
    qc.invalidateQueries({ queryKey: ["business-profile"] });
  };

  const handleFile = async (file: File) => {
    if (!user) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Only PNG, JPG or WEBP images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("File must be 2MB or smaller");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
    setLogoUrl(pub.publicUrl);
    setUploading(false);
    toast.success("Logo uploaded — don't forget to save");
  };

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const removeLogo = () => {
    setLogoUrl(null);
    toast.message("Logo removed — save to apply");
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            This information appears on every PDF invoice you generate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs">Business name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@acme.com"
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Toronto, ON"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG, JPG or WEBP. Max 2MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 items-start">
            <div className="w-40 h-40 border rounded-md flex items-center justify-center bg-muted/30 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div
              className={`flex-1 min-w-[240px] border-2 border-dashed rounded-md p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm mb-3">Drag & drop, or click to select</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED.join(",")}
                onChange={onSelect}
                className="hidden"
              />
              <div className="flex gap-2 justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Choose file
                </Button>
                {logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || uploading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}
