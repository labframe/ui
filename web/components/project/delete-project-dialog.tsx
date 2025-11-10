"use client";

import { Button } from "@/components/ui/button";

interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectName: string;
  isActive: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteProjectDialog({
  isOpen,
  projectName,
  isActive,
  onClose,
  onConfirm,
  isDeleting = false,
}: DeleteProjectDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-auto rounded-lg border border-border bg-card shadow-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Confirm deletion</h2>
          <p className="text-sm text-foreground whitespace-pre-line">
            {isActive
              ? `Are you sure you want to delete the active project "${projectName}"?\n\nThis will delete the project and its database file. This action cannot be undone.\n\nWarning: You are currently using this project.`
              : `Are you sure you want to delete project "${projectName}"?\n\nThis will delete the project and its database file. This action cannot be undone.`}
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

