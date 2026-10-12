"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { ImagePicker } from "@/components/ImageUpload";
import { websiteApi, WebsiteApiError, type WebsiteSettings } from "@/lib/website-api";

export default function WebsiteSettingsPage() {
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    websiteApi<WebsiteSettings>("/api/v1/admin/settings")
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await websiteApi<WebsiteSettings>("/api/v1/admin/settings", {
        method: "PATCH",
        body: settings,
      });
      setSettings(updated);
      setSuccess("Settings saved successfully");
    } catch (e) {
      setError(e instanceof WebsiteApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4 sm:p-6 text-[#6B7183]">Loading settings...</div>;
  if (!settings) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 p-6 text-sm text-[#C62828]">
          Could not load settings. Make sure the website backend is running on port 8001.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Website Settings"
        breadcrumb="Website / Settings"
        subtitle="Public website content and configuration"
      />

      {success && <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">{success}</div>}
      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}

      <div className="max-w-3xl rounded-xl border border-[#DADDE6] bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase text-[#4A5060]">Site Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Site Name" value={settings.site_name} onChange={(v) => setSettings({ ...settings, site_name: v })} />
          <SettingsField label="Tagline" value={settings.site_tagline} onChange={(v) => setSettings({ ...settings, site_tagline: v })} />
        </div>

        <h3 className="mb-4 mt-6 text-sm font-semibold uppercase text-[#4A5060]">Hero Banner</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Eyebrow (small label)" value={settings.hero_eyebrow ?? ""} onChange={(v) => setSettings({ ...settings, hero_eyebrow: v || null })} />
          <SettingsField label="CTA Button Label" value={settings.hero_cta_label} onChange={(v) => setSettings({ ...settings, hero_cta_label: v })} />
          <SettingsField label="Hero Title" value={settings.hero_title} onChange={(v) => setSettings({ ...settings, hero_title: v })} />
          <SettingsField label="Hero Subtitle" value={settings.hero_subtitle} onChange={(v) => setSettings({ ...settings, hero_subtitle: v })} />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-[#4A5060]">Banner Image</label>
          <ImagePicker
            value={settings.hero_image ?? ""}
            onChange={(v) => setSettings({ ...settings, hero_image: v || null })}
            onError={(m) => setError(m)}
          />
        </div>

        <h3 className="mb-4 mt-6 text-sm font-semibold uppercase text-[#4A5060]">Contact</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Phone" value={settings.contact_phone} onChange={(v) => setSettings({ ...settings, contact_phone: v })} />
          <SettingsField label="Email" value={settings.contact_email} onChange={(v) => setSettings({ ...settings, contact_email: v })} />
          <SettingsField label="Address" value={settings.contact_address} onChange={(v) => setSettings({ ...settings, contact_address: v })} />
          <SettingsField label="Default Shipping Fee (GH₵)" value={settings.default_shipping_fee} onChange={(v) => setSettings({ ...settings, default_shipping_fee: v })} />
          <SettingsField label="Free delivery over (GH₵, blank = never)" value={settings.free_shipping_threshold ?? ""} onChange={(v) => setSettings({ ...settings, free_shipping_threshold: v || null })} />
        </div>

        <h3 className="mb-4 mt-6 text-sm font-semibold uppercase text-[#4A5060]">Social Media</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SettingsField label="Facebook" value={settings.social_facebook ?? ""} onChange={(v) => setSettings({ ...settings, social_facebook: v || null })} />
          <SettingsField label="Instagram" value={settings.social_instagram ?? ""} onChange={(v) => setSettings({ ...settings, social_instagram: v || null })} />
          <SettingsField label="Twitter" value={settings.social_twitter ?? ""} onChange={(v) => setSettings({ ...settings, social_twitter: v || null })} />
        </div>

        <h3 className="mb-4 mt-6 text-sm font-semibold uppercase text-[#4A5060]">Announcement</h3>
        <SettingsField label="Announcement Banner" value={settings.announcement ?? ""} onChange={(v) => setSettings({ ...settings, announcement: v || null })} />

        <div className="mt-6 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.is_maintenance_mode}
              onChange={(e) => setSettings({ ...settings, is_maintenance_mode: e.target.checked })}
              className="h-4 w-4 rounded border-[#DADDE6] text-[#061161] focus:ring-[#061161]"
            />
            <span className="text-[#0B0E1A]">Maintenance Mode</span>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-[#061161] px-6 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[#4A5060]">{label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none focus:ring-2 focus:ring-[#061161]/20"
      />
    </div>
  );
}
