"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Save,
  Check,
  Plus,
  Pencil,
  Trash2,
  X,
  Lock,
  Star,
} from "lucide-react";
import { invalidateOutputStylesCache } from "@/components/chat/output-style-selector";
import type { OutputStyle } from "@/types";

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

const PROMPT_TEXT_MAX_LENGTH = 500;

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Output styles state
  const [styles, setStyles] = useState<OutputStyle[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPromptText, setFormPromptText] = useState("");
  const [stylesSaving, setStylesSaving] = useState(false);
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [defaultStyleId, setDefaultStyleId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("default-output-style-id") || "preset-default";
    }
    return "preset-default";
  });

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

  const loadStyles = useCallback(async () => {
    try {
      const res = await fetch("/api/output-styles");
      if (res.ok) {
        const data: OutputStyle[] = await res.json();
        setStyles(data);
      }
    } catch {
      // silently fail
    } finally {
      setStylesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStyles();
  }, [loadStyles]);

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

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormPromptText("");
    setShowNewForm(false);
    setEditingId(null);
    setStylesError(null);
  };

  const startEditing = (style: OutputStyle) => {
    setEditingId(style.id);
    setFormName(style.name);
    setFormDescription(style.description || "");
    setFormPromptText(style.promptText || "");
    setShowNewForm(false);
    setStylesError(null);
  };

  const handleCreateStyle = async () => {
    setStylesSaving(true);
    setStylesError(null);
    try {
      const res = await fetch("/api/output-styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          promptText: formPromptText || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "建立失敗");
      }
      resetForm();
      invalidateOutputStylesCache();
      await loadStyles();
    } catch (err) {
      setStylesError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setStylesSaving(false);
    }
  };

  const handleUpdateStyle = async () => {
    if (!editingId) return;
    setStylesSaving(true);
    setStylesError(null);
    try {
      const res = await fetch(`/api/output-styles/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          promptText: formPromptText || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "更新失敗");
      }
      resetForm();
      invalidateOutputStylesCache();
      await loadStyles();
    } catch (err) {
      setStylesError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setStylesSaving(false);
    }
  };

  const handleDeleteStyle = async (styleId: string) => {
    try {
      const res = await fetch(`/api/output-styles/${styleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "刪除失敗");
      }
      if (editingId === styleId) resetForm();
      if (defaultStyleId === styleId) {
        setDefaultStyleId("preset-default");
        localStorage.setItem("default-output-style-id", "preset-default");
      }
      invalidateOutputStylesCache();
      await loadStyles();
    } catch (err) {
      setStylesError(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  const handleSetDefault = (styleId: string) => {
    setDefaultStyleId(styleId);
    localStorage.setItem("default-output-style-id", styleId);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const systemPresets = styles.filter((s) => !s.userId);
  const customStyles = styles.filter((s) => !!s.userId);

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

        {/* 輸出風格 */}
        <section className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">輸出風格</h2>
              <p className="text-xs text-muted-foreground mt-1">
                設定 AI 回答的表達方式。在開始新對話時選擇風格，對話建立後不可切換。
              </p>
            </div>
          </div>

          {stylesLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* System presets */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">系統預設</p>
                {systemPresets.map((style) => (
                  <div
                    key={style.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2"
                  >
                    <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{style.name}</p>
                      {style.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {style.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSetDefault(style.id)}
                      className={`shrink-0 p-1 rounded transition-colors ${
                        defaultStyleId === style.id
                          ? "text-amber-500"
                          : "text-muted-foreground/30 hover:text-amber-500/50"
                      }`}
                      title={defaultStyleId === style.id ? "目前預設" : "設為預設"}
                    >
                      <Star className="h-3.5 w-3.5" fill={defaultStyleId === style.id ? "currentColor" : "none"} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Custom styles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">自訂風格</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setShowNewForm(true);
                    }}
                    className="text-xs h-7"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    新增
                  </Button>
                </div>

                {customStyles.length === 0 && !showNewForm && (
                  <p className="text-xs text-muted-foreground py-2">
                    尚未建立自訂風格。
                  </p>
                )}

                {customStyles.map((style) =>
                  editingId === style.id ? (
                    <StyleForm
                      key={style.id}
                      name={formName}
                      description={formDescription}
                      promptText={formPromptText}
                      onNameChange={setFormName}
                      onDescriptionChange={setFormDescription}
                      onPromptTextChange={setFormPromptText}
                      onSave={handleUpdateStyle}
                      onCancel={resetForm}
                      saving={stylesSaving}
                      saveLabel="更新"
                    />
                  ) : (
                    <div
                      key={style.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{style.name}</p>
                        {style.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {style.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleSetDefault(style.id)}
                        className={`shrink-0 p-1 rounded transition-colors ${
                          defaultStyleId === style.id
                            ? "text-amber-500"
                            : "text-muted-foreground/30 hover:text-amber-500/50"
                        }`}
                        title={defaultStyleId === style.id ? "目前預設" : "設為預設"}
                      >
                        <Star className="h-3.5 w-3.5" fill={defaultStyleId === style.id ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={() => startEditing(style)}
                        className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                        title="編輯"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStyle(style.id)}
                        className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        title="刪除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                )}

                {/* New style form */}
                {showNewForm && (
                  <StyleForm
                    name={formName}
                    description={formDescription}
                    promptText={formPromptText}
                    onNameChange={setFormName}
                    onDescriptionChange={setFormDescription}
                    onPromptTextChange={setFormPromptText}
                    onSave={handleCreateStyle}
                    onCancel={resetForm}
                    saving={stylesSaving}
                    saveLabel="建立"
                  />
                )}
              </div>

              {stylesError && (
                <p className="text-xs text-destructive">{stylesError}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StyleForm({
  name,
  description,
  promptText,
  onNameChange,
  onDescriptionChange,
  onPromptTextChange,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  name: string;
  description: string;
  promptText: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPromptTextChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="風格名稱"
        disabled={saving}
        className="text-sm"
      />
      <Input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="簡短描述（選填）"
        disabled={saving}
        className="text-xs"
      />
      <div>
        <Textarea
          value={promptText}
          onChange={(e) =>
            onPromptTextChange(e.target.value.slice(0, PROMPT_TEXT_MAX_LENGTH))
          }
          placeholder="提示文字 — 這段文字會附加到 AI 的系統提示中，用來控制回答的風格和格式。"
          rows={3}
          disabled={saving}
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">
          {promptText.length}/{PROMPT_TEXT_MAX_LENGTH}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="text-xs h-7"
        >
          <X className="mr-1 h-3 w-3" />
          取消
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !name.trim()}
          className="text-xs h-7"
        >
          {saving ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Save className="mr-1 h-3 w-3" />
          )}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
