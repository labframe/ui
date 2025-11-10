"use client";

import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { fetchProjects, createProjectWithTemplate, type Project } from "@/lib/api";

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (project: Project) => void;
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateProjectDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [templateProjectName, setTemplateProjectName] = useState<string | null>(null);
  const [cloneGroups, setCloneGroups] = useState(false);
  const [cloneParameters, setCloneParameters] = useState(false);
  const [cloneValues, setCloneValues] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const createProjectMutation = useMutation({
    mutationFn: createProjectWithTemplate,
    onSuccess: async (newProject) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onSuccess?.(newProject);
      handleClose();
    },
  });

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when dialog closes
      setProjectName("");
      setTemplateProjectName(null);
      setCloneGroups(false);
      setCloneParameters(false);
      setCloneValues(false);
    }
  }, [isOpen]);

  useEffect(() => {
    // Auto-select dependencies when cloneValues is checked
    if (cloneValues) {
      setCloneGroups(true);
      setCloneParameters(true);
    }
  }, [cloneValues]);

  useEffect(() => {
    // Auto-select groups when cloneParameters is checked
    if (cloneParameters) {
      setCloneGroups(true);
    }
  }, [cloneParameters]);

  const handleClose = () => {
    setProjectName("");
    setTemplateProjectName(null);
    setCloneGroups(false);
    setCloneParameters(false);
    setCloneValues(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      return;
    }

    createProjectMutation.mutate({
      name: projectName.trim(),
      template_project_name: templateProjectName || null,
      clone_groups: cloneGroups,
      clone_parameters: cloneParameters,
      clone_values: cloneValues,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-dialog-title"
    >
      <div
        className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="create-project-dialog-title" className="text-2xl font-semibold">
            Create New Project
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="project-name"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Project Name
            </label>
            <input
              ref={inputRef}
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              disabled={createProjectMutation.isPending}
            />
          </div>

          <div>
            <label
              htmlFor="template-project"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Template Project (Optional)
            </label>
            <select
              id="template-project"
              value={templateProjectName || ""}
              onChange={(e) => setTemplateProjectName(e.target.value || null)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={createProjectMutation.isPending || projects.length === 0}
            >
              <option value="">None (empty project)</option>
              {projects.map((project) => (
                <option key={project.name} value={project.name}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {templateProjectName && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground mb-2">
                Clone Data from Template
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneGroups}
                  onChange={(e) => setCloneGroups(e.target.checked)}
                  disabled={createProjectMutation.isPending || cloneParameters || cloneValues}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">
                  Parameter Groups
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneParameters}
                  onChange={(e) => setCloneParameters(e.target.checked)}
                  disabled={createProjectMutation.isPending || cloneValues}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">
                  Parameters{" "}
                  {!cloneGroups && (
                    <span className="text-muted-foreground text-xs">
                      (requires groups)
                    </span>
                  )}
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneValues}
                  onChange={(e) => setCloneValues(e.target.checked)}
                  disabled={createProjectMutation.isPending}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">
                  Parameter Values{" "}
                  {(!cloneGroups || !cloneParameters) && (
                    <span className="text-muted-foreground text-xs">
                      (requires groups and parameters)
                    </span>
                  )}
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!projectName.trim() || createProjectMutation.isPending}
            >
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}











