import { useEffect, useState } from "react";
import { X } from "lucide-react";
import "./ConfigModal.css";

export default function ConfigModal({ open, config, onClose, onSave }) {
  const [sourceUrls, setSourceUrls] = useState(config.sourceUrls);
  const [destinationDir, setDestinationDir] = useState(config.destinationDir);
  const [moveDestination, setMoveDestination] = useState(
    config.moveDestination,
  );

  useEffect(() => {
    if (open) {
      setSourceUrls(config.sourceUrls);
      setDestinationDir(config.destinationDir);
      setMoveDestination(config.moveDestination);
    }
  }, [open, config]);

  if (!open) return null;

  function handleSave(e) {
    e.preventDefault();
    onSave({ sourceUrls, destinationDir, moveDestination });
    onClose();
  }

  return (
    <div className="config-modal-overlay" onClick={onClose}>
      <form
        className="config-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
      >
        <div className="config-modal-head">
          <h2>Config</h2>
          <button
            type="button"
            className="config-modal-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <label className="config-field">
          <span>Direct file URLs</span>
          <textarea
            rows={4}
            placeholder={
              "https://example.com/song.mp3\nhttps://example.com/photo.jpg"
            }
            value={sourceUrls}
            onChange={(e) => setSourceUrls(e.target.value)}
          />
          <p className="config-hint">
            Direct file links, one per line — used by the Fetch button. This
            downloads exactly the files you list; it doesn't crawl a page for
            links.
          </p>
        </label>

        <label className="config-field">
          <span>Download destination folder</span>
          <input
            type="text"
            placeholder="Songs, or Songs/Telugu"
            value={destinationDir}
            onChange={(e) => setDestinationDir(e.target.value)}
          />
          <p className="config-hint">
            Where Fetch saves files, relative to the backend's Downloads folder.
            An absolute path (e.g. <code>D:\Music</code>) only works if the
            backend was started locally with{" "}
            <code>ALLOW_ABSOLUTE_PATHS=true</code>.
          </p>
        </label>

        <label className="config-field">
          <span>Move / copy destination</span>
          <input
            type="text"
            placeholder="Archive, or D:\Music\Archive (local backend only)"
            value={moveDestination}
            onChange={(e) => setMoveDestination(e.target.value)}
          />
          <p className="config-hint">
            Where selected files go when you use Copy/Move on the folder view
            below.
          </p>
        </label>

        <div className="config-modal-actions">
          <button type="button" className="config-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="config-save-btn">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
