"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Edit2, Trash2, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type { ProjectDetails } from "@/lib/api";

interface ProjectCardProps {
  project: ProjectDetails;
  isActive: boolean;
  onRename: (projectName: string, newName: string) => void;
  onDelete: (projectName: string) => void;
  onSwitch: (projectName: string) => void;
  isRenaming?: boolean;
  isDeleting?: boolean;
}

export function ProjectCard({
  project,
  isActive,
  onRename,
  onDelete,
  onSwitch,
  isRenaming = false,
  isDeleting = false,
}: ProjectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project.name);

  const handleRename = () => {
    if (editedName.trim() && editedName.trim() !== project.name) {
      onRename(project.name, editedName.trim());
      setIsEditingName(false);
    } else {
      setEditedName(project.name);
      setIsEditingName(false);
    }
  };

  const handleCancelRename = () => {
    setEditedName(project.name);
    setIsEditingName(false);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Never";
    try {
      return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={`rounded-lg border border-border bg-card shadow-sm transition-all ${
        isActive ? "ring-2 ring-primary" : ""
      }`}
    >
      {/* Collapsed state */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary text-primary-foreground shrink-0">
              Active
            </span>
          )}
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  } else if (e.key === "Escape") {
                    handleCancelRename();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1 text-sm font-medium rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            ) : (
              <h3 className="text-sm font-semibold text-foreground truncate">
                {project.name}
              </h3>
            )}
            <p className="text-xs text-subtle mt-1">
              {project.stats.sample_count} sample{project.stats.sample_count !== 1 ? "s" : ""}
              {project.last_modified && ` • Modified ${formatDate(project.last_modified)}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expanded state */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-subtle mb-1">Created</p>
              <p className="text-foreground">
                {project.created_at ? formatDate(project.created_at) : "Unknown"}
              </p>
              {project.created_by && (
                <p className="text-xs text-subtle mt-1">by {project.created_by}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Last Opened</p>
              <p className="text-foreground">
                {project.last_opened ? formatDate(project.last_opened) : "Never"}
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Last Modified</p>
              <p className="text-foreground">
                {project.stats.last_modified
                  ? formatDate(project.stats.last_modified)
                  : "Never"}
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Database Health</p>
              <p
                className={`text-foreground ${
                  project.stats.database_health === "healthy"
                    ? "text-green-600"
                    : project.stats.database_health === "degraded"
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {project.stats.database_health}
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-subtle mb-1">Samples</p>
              <p className="text-foreground font-medium">{project.stats.sample_count}</p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Runs</p>
              <p className="text-foreground font-medium">{project.stats.run_count}</p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Parameter Definitions</p>
              <p className="text-foreground font-medium">
                {project.stats.parameter_definitions_count}
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Data Points</p>
              <p className="text-foreground font-medium">{project.stats.data_points_count}</p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">People Involved</p>
              <p className="text-foreground font-medium">{project.stats.people_involved}</p>
            </div>
            <div>
              <p className="text-xs text-subtle mb-1">Project Stage</p>
              <p className="text-foreground font-medium">{project.stats.project_stage}</p>
            </div>
          </div>

          {/* Institutes and Responsible Persons */}
          {project.stats.institutes.length > 0 && (
            <div>
              <p className="text-xs text-subtle mb-1">Institutes</p>
              <p className="text-sm text-foreground">
                {project.stats.institutes.join(", ")}
              </p>
            </div>
          )}

          {project.stats.responsible_persons.length > 0 && (
            <div>
              <p className="text-xs text-subtle mb-1">Responsible Persons</p>
              <p className="text-sm text-foreground">
                {project.stats.responsible_persons.join(", ")}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              disabled={isRenaming || isDeleting}
              className="flex-1"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Rename
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.name);
              }}
              disabled={isRenaming || isDeleting || isActive}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            {!isActive && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitch(project.name);
                }}
                disabled={isRenaming || isDeleting}
                className="flex-1"
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                Switch to
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

