"use client";

import { useState, useMemo } from "react";
import { X, Plus, ArrowUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  fetchProjectDetails,
  renameProject,
  deleteProject,
  setActiveProject,
  type ProjectDetails,
  type Project,
} from "@/lib/api";
import { ProjectCard } from "./project-card";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { CreateProjectDialog } from "./create-project-dialog";

interface ProjectManagementOverlayProps {
  onClose: () => void;
}

type SortMode = "recently_opened" | "recently_modified";

export function ProjectManagementOverlay({
  onClose,
}: ProjectManagementOverlayProps) {
  const [sortMode, setSortMode] = useState<SortMode>("recently_opened");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{
    name: string;
    isActive: boolean;
  } | null>(null);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projectDetails"],
    queryFn: () => fetchProjectDetails(),
  });

  const renameMutation = useMutation({
    mutationFn: ({ projectName, newName }: { projectName: string; newName: string }) =>
      renameProject(projectName, newName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["activeProject"] });
      setRenamingProject(null);
    },
    onError: (error) => {
      console.error("Failed to rename project:", error);
      setRenamingProject(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectName: string) => deleteProject(projectName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["activeProject"] });
      setProjectToDelete(null);
      setDeletingProject(null);
    },
    onError: (error) => {
      console.error("Failed to delete project:", error);
      setProjectToDelete(null);
      setDeletingProject(null);
    },
  });

  const switchProjectMutation = useMutation({
    mutationFn: (projectName: string) =>
      setActiveProject({ project_name: projectName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["activeProject"] });
      await queryClient.invalidateQueries({ queryKey: ["samples"] });
      await queryClient.invalidateQueries({ queryKey: ["parameterDefinitions"] });
    },
  });

  const sortedProjects = useMemo(() => {
    const sorted = [...projects];
    if (sortMode === "recently_opened") {
      sorted.sort((a, b) => {
        const aTime = a.last_opened ? new Date(a.last_opened).getTime() : 0;
        const bTime = b.last_opened ? new Date(b.last_opened).getTime() : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        // Fallback to alphabetical
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "recently_modified") {
      sorted.sort((a, b) => {
        const aTime = a.stats.last_modified
          ? new Date(a.stats.last_modified).getTime()
          : 0;
        const bTime = b.stats.last_modified
          ? new Date(b.stats.last_modified).getTime()
          : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        // Fallback to alphabetical
        return a.name.localeCompare(b.name);
      });
    }
    return sorted;
  }, [projects, sortMode]);

  const handleRename = (projectName: string, newName: string) => {
    if (newName.trim() === projectName) {
      return;
    }
    setRenamingProject(projectName);
    renameMutation.mutate({ projectName, newName });
  };

  const handleDelete = (projectName: string) => {
    const project = projects.find((p) => p.name === projectName);
    if (project) {
      setProjectToDelete({
        name: projectName,
        isActive: project.is_active ?? false,
      });
    }
  };

  const handleConfirmDelete = () => {
    if (projectToDelete) {
      setDeletingProject(projectToDelete.name);
      deleteMutation.mutate(projectToDelete.name);
    }
  };

  const handleSwitch = (projectName: string) => {
    switchProjectMutation.mutate(projectName);
  };

  const handleProjectCreated = async (project: Project) => {
    await queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    // Automatically switch to the new project
    handleSwitch(project.name);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manage Projects</h2>
          <p className="text-xs text-subtle">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`flex items-center gap-2 rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                sortMode === "recently_opened" ? "bg-muted/90" : ""
              }`}
              onClick={() =>
                setSortMode(sortMode === "recently_opened" ? "recently_modified" : "recently_opened")
              }
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortMode === "recently_opened" ? "Recently Opened" : "Recently Modified"}
            </button>
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create New Project
          </Button>
          <button
            type="button"
            className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-subtle">Loading projects...</p>
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <p className="text-sm text-subtle">No projects found</p>
            <Button
              type="button"
              variant="default"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create New Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                isActive={project.is_active ?? false}
                onRename={handleRename}
                onDelete={handleDelete}
                onSwitch={handleSwitch}
                isRenaming={renamingProject === project.name}
                isDeleting={deletingProject === project.name}
              />
            ))}
          </div>
        )}
      </div>
      <CreateProjectDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={handleProjectCreated}
      />
      {projectToDelete && (
        <DeleteProjectDialog
          isOpen={!!projectToDelete}
          projectName={projectToDelete.name}
          isActive={projectToDelete.isActive}
          onClose={() => setProjectToDelete(null)}
          onConfirm={handleConfirmDelete}
          isDeleting={deletingProject === projectToDelete.name}
        />
      )}
    </div>
  );
}

