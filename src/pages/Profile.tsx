import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, Save, User as UserIcon, Mail, Phone, MapPin } from "lucide-react";

interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
  location: string;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: "",
    email: "",
    phone: "",
    location: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      // Only redirect on explicit sign out, not during token refresh
      if (event === 'SIGNED_OUT') {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, phone, location")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || user.email || "",
          phone: data.phone || "",
          location: data.location || "",
        });
      } else {
        setProfile((prev) => ({
          ...prev,
          email: user.email || "",
        }));
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const initials = profile.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || user?.email?.[0]?.toUpperCase() || "U";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/chat")}
          className="mr-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Profile Settings</h1>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <Avatar className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500">
            <AvatarFallback className="bg-transparent text-white text-2xl font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="font-medium text-lg">{profile.full_name || "Your Name"}</p>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm text-muted-foreground">
              Full Name
            </Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="fullName"
                type="text"
                placeholder="Your name"
                value={profile.full_name}
                onChange={(e) => setProfile((prev) => ({ ...prev, full_name: e.target.value }))}
                className="pl-10 h-12 bg-card border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm text-muted-foreground">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={profile.email}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                className="pl-10 h-12 bg-card border-border"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Note: This is your profile email. Your login email ({user?.email}) cannot be changed here.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm text-muted-foreground">
              Phone Number
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={profile.phone}
                onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                className="pl-10 h-12 bg-card border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm text-muted-foreground">
              Location
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="location"
                type="text"
                placeholder="City, Country"
                value={profile.location}
                onChange={(e) => setProfile((prev) => ({ ...prev, location: e.target.value }))}
                className="pl-10 h-12 bg-card border-border"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
