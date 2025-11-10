"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  fetchProjects,
  getActiveProject,
  setActiveProject,
} from "@/lib/api";
import { ProjectManagementOverlay } from "./project-management-overlay";

export function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [isManagementOverlayOpen, setIsManagementOverlayOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const { data: activeProject, isLoading: isLoadingActive } = useQuery({
    queryKey: ["activeProject"],
    queryFn: () => getActiveProject(),
  });

  const setActiveProjectMutation = useMutation({
    mutationFn: setActiveProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activeProject"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
      // Invalidate all sample queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["samples"] });
      await queryClient.invalidateQueries({ queryKey: ["parameterDefinitions"] });
      setIsOpen(false);
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectProject = (projectName: string | null) => {
    setActiveProjectMutation.mutate({ project_name: projectName });
  };

  const displayName =
    activeProject?.name ?? (isLoadingActive ? "Loading..." : "No Project");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex h-9 items-center gap-1 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {displayName}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          {isLoadingProjects ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Loading projects...
            </li>
          ) : projects.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No projects found
            </li>
          ) : (
            <>
              {projects
                .filter((project) => project.name !== activeProject?.name)
                .map((project) => {
                  return (
                    <li
                      key={project.name}
                      role="option"
                      className="hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm transition-colors"
                        onClick={() => {
                          handleSelectProject(project.name);
                        }}
                      >
                        {project.name}
                      </button>
                    </li>
                  );
                })}
              <li
                role="option"
                className="border-t border-border hover:bg-muted/60"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                  onClick={() => {
                    setIsManagementOverlayOpen(true);
                    setIsOpen(false);
                  }}
                >
                  <Settings className="h-4 w-4" />
                  Manage Projects
                </button>
              </li>
            </>
          )}
        </ul>
      ) : null}
      {isManagementOverlayOpen ? (
        <div className="fixed inset-0 z-50 flex max-w-full flex-col overflow-hidden bg-popover">
          <ProjectManagementOverlay
            onClose={() => setIsManagementOverlayOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

