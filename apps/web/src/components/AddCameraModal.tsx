'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCameras } from '@/hooks/useCameras';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddCameraModal({ open, onClose }: Props) {
  const { addCamera } = useCameras();
  const [formData, setFormData] = useState({ name: '', rtspUrl: '', locationLabel: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await addCamera({
        name: formData.name,
        rtspUrl: formData.rtspUrl,
        locationLabel: formData.locationLabel || undefined,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add camera');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', rtspUrl: '', locationLabel: '' });
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Camera"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={submitting} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} className="flex-1">
            Add Camera
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Camera Name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Backyard Feeder"
        />
        <Input
          label="RTSP URL"
          required
          value={formData.rtspUrl}
          onChange={(e) => setFormData({ ...formData, rtspUrl: e.target.value })}
          placeholder="rtsp://user:pass@192.168.1.100:554/stream"
          className="font-mono text-xs"
          hint="From your camera's settings"
        />
        <Input
          label="Location"
          value={formData.locationLabel}
          onChange={(e) => setFormData({ ...formData, locationLabel: e.target.value })}
          placeholder="Backyard, Front porch..."
        />
      </form>
    </Modal>
  );
}
