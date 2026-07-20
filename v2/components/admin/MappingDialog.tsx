"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Check } from "lucide-react";

interface MappingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    excelHeader: string;
    dbField: string;
    displayName: string | null;
  }) => Promise<void>;
  dbFieldOptions: string[];
  initialData?: {
    excelHeader: string;
    dbField: string;
    displayName: string | null;
  } | null;
  preSelectedDbField?: string;
}

export default function MappingDialog({
  open,
  onClose,
  onSave,
  dbFieldOptions,
  initialData,
  preSelectedDbField,
}: MappingDialogProps) {
  const [excelHeader, setExcelHeader] = useState("");
  const [dbField, setDbField] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!initialData;

  useEffect(() => {
    if (open) {
      if (initialData) {
        setExcelHeader(initialData.excelHeader);
        setDbField(initialData.dbField);
        setDisplayName(initialData.displayName ?? "");
      } else {
        setExcelHeader("");
        setDbField(preSelectedDbField ?? "");
        setDisplayName("");
      }
      setError("");
      setSaving(false);
    }
  }, [open, initialData, preSelectedDbField]);

  const handleSave = async () => {
    const trimmedHeader = excelHeader.trim();
    const trimmedField = dbField.trim();
    if (!trimmedHeader) {
      setError("Excel Header is required");
      return;
    }
    if (!trimmedField) {
      setError("DB Field is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        excelHeader: trimmedHeader,
        dbField: trimmedField,
        displayName: displayName.trim() || null,
      });
      onClose();
    } catch {
      setError("Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {isEditing ? "Edit Mapping" : "Add Mapping"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="text-slate-500 text-[11px] block mb-1">
              DB FIELD
            </label>
            <select
              value={dbField}
              onChange={(e) => setDbField(e.target.value)}
              disabled={isEditing || !!preSelectedDbField}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Select a field...</option>
              {dbFieldOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-500 text-[11px] block mb-1">
              EXCEL HEADER
            </label>
            <input
              value={excelHeader}
              onChange={(e) => setExcelHeader(e.target.value)}
              placeholder="e.g. portalId"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-slate-500 text-[11px] block mb-1">
              DISPLAY NAME{" "}
              <span className="text-slate-300 font-normal">(optional)</span>
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="UI column header override"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {error && (
            <p className="text-red-500 text-[12px]">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[13px] text-slate-600 hover:text-slate-800 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-[13px] text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {isEditing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
