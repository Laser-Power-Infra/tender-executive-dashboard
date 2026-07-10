import React, { useState, useEffect } from "react";
import "./SupplyAttachmentModal.css";

interface FileRecord {
  fileId: string;
  filename: string;
  extension: string;
  size: number;
  lastModified: number;
  relativePath: string;
}

interface SupplyAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleBillNumber: string;
  authToken?: string;
}

export const SupplyAttachmentModal: React.FC<SupplyAttachmentModalProps> = ({
  isOpen,
  onClose,
  saleBillNumber,
  authToken = "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE"
}) => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !saleBillNumber) return;

    const fetchFiles = async () => {
      setLoading(true);
      setError(null);
      setFiles([]);

      try {
        const response = await fetch(`/api/supply-history/${encodeURIComponent(saleBillNumber)}/files`, {
          headers: {
            Authorization: authToken
          }
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Failed to load supply bill files.");
        }

        const data = await response.json();
        setFiles(data.files || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [isOpen, saleBillNumber, authToken]);

  if (!isOpen) return null;

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Get file icon based on extension
  const getFileIcon = (ext: string): string => {
    const normalized = ext.toLowerCase();
    if (normalized === ".pdf") return "📕";
    if ([".xlsx", ".xls", ".csv"].includes(normalized)) return "📗";
    if ([".docx", ".doc"].includes(normalized)) return "📘";
    if ([".png", ".jpg", ".jpeg", ".gif"].includes(normalized)) return "🖼️";
    return "📄";
  };

  const handleDownload = (fileId: string) => {
    window.open(`/api/files/download/${fileId}?auth=${encodeURIComponent(authToken)}`, "_blank");
  };

  const handlePreview = (fileId: string) => {
    window.open(`/api/files/view/${fileId}?auth=${encodeURIComponent(authToken)}`, "_blank");
  };

  return (
    <div className="attachment-modal-overlay" onClick={onClose}>
      <div className="attachment-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="attachment-modal-header">
          <h3>Documents for Sale Bill #{saleBillNumber}</h3>
          <button className="attachment-modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        <div className="attachment-modal-body">
          {loading && (
            <div className="skeleton-container">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton-icon"></div>
                  <div className="skeleton-text-group">
                    <div className="skeleton-title"></div>
                    <div className="skeleton-subtitle"></div>
                  </div>
                  <div className="skeleton-btn"></div>
                  <div className="skeleton-btn"></div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="attachment-error-state">
              <span className="error-icon">⚠️</span>
              <p className="error-message">{error}</p>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="attachment-empty-state">
              <span className="empty-icon">📂</span>
              <p>No documents found for this Sale Bill folder.</p>
            </div>
          )}

          {!loading && !error && files.length > 0 && (
            <ul className="file-list">
              {files.map((file) => (
                <li key={file.fileId} className="file-item">
                  <div className="file-icon" title={file.extension}>
                    {getFileIcon(file.extension)}
                  </div>
                  <div className="file-info-group">
                    <span className="file-name" title={file.filename}>
                      {file.filename}
                    </span>
                    <span className="file-meta">
                      {formatSize(file.size)} • {new Date(file.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="file-actions">
                    {file.extension.toLowerCase() === ".pdf" && (
                      <button
                        className="file-action-btn view-btn"
                        onClick={() => handlePreview(file.fileId)}
                        title="Preview PDF inline"
                      >
                        👁️ Preview
                      </button>
                    )}
                    <button
                      className="file-action-btn download-btn"
                      onClick={() => handleDownload(file.fileId)}
                      title="Download file"
                    >
                      📥 Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="attachment-modal-footer">
          <button className="footer-close-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
