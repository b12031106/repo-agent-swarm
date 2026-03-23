"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Check } from "lucide-react";

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: "number";
  defaultValue: string;
  suffix?: string;
  min?: number;
  max?: number;
}

const SETTINGS_FIELDS: SettingField[] = [
  {
    key: "githubRepoCacheTtlMinutes",
    label: "組織 Repo 清單快取時間",
    description: "從 GitHub 組織取得的 Repository 列表會快取在本地資料庫，避免重複呼叫 GitHub API。設為 0 表示不快取。",
    type: "number",
    defaultValue: "10",
    suffix: "分鐘",
    min: 0,
    max: 1440,
  },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const results: Record<string, string> = {};
      await Promise.all(
        SETTINGS_FIELDS.map(async (field) => {
          try {
            const res = await fetch(`/api/settings?key=${field.key}`);
            const data = await res.json();
            results[field.key] = data?.value ?? field.defaultValue;
          } catch {
            results[field.key] = field.defaultValue;
          }
        })
      );
      setValues(results);
      setLoading(false);
    }
    loadSettings();
  }, []);

  const handleSave = async (field: SettingField) => {
    setSaving(field.key);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: field.key, value: values[field.key] }),
      });
      setSaved(field.key);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系統設定</h1>
        <p className="text-muted-foreground mt-1">管理平台的全域設定</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* GitHub 整合 */}
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">GitHub 整合</h2>

          {SETTINGS_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-xs text-muted-foreground">{field.description}</p>
              <div className="flex items-center gap-2">
                <Input
                  id={field.key}
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={values[field.key] ?? field.defaultValue}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-32"
                />
                {field.suffix && (
                  <span className="text-sm text-muted-foreground">{field.suffix}</span>
                )}
                <Button
                  size="sm"
                  onClick={() => handleSave(field)}
                  disabled={saving === field.key}
                >
                  {saving === field.key ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : saved === field.key ? (
                    <Check className="mr-1 h-3 w-3" />
                  ) : (
                    <Save className="mr-1 h-3 w-3" />
                  )}
                  {saved === field.key ? "已儲存" : "儲存"}
                </Button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
