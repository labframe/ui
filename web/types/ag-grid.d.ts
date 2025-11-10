import "ag-grid-community";

declare module "ag-grid-community" {
  type RowSelectionMode = "singleRow" | "multiRow";

  interface RowSelectionOptions {
    mode?: RowSelectionMode;
    /**
     * Controls whether clicking anywhere on the row toggles selection. Defaults to true in AG Grid 34.
     */
    enableClickSelection?: boolean;
    /**
     * Strategy used when the header checkbox triggers select-all behaviour.
     */
    selectAll?: "all" | "filteredOnly" | "currentPage";
    /**
     * Determines how group selections behave when selecting parent rows.
     */
    groupSelects?: "children" | "filteredDescendants" | "descendants";
    /**
     * Location of per-row selection checkbox when `checkboxes` is enabled.
     */
    checkboxLocation?: "left" | "right";
    /**
     * Enables checkboxes for row selection. String matches AG Grid option values.
     */
    checkboxes?: "none" | "visibleRows" | "always";
    /**
     * Toggles the presence of the header checkbox.
     */
    headerCheckbox?: boolean;
    [key: string]: unknown;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface GridOptions<TData = unknown> {
    /**
     * Row selection configuration. Accepts object-based API introduced in AG Grid 34 along with legacy string values.
     */
    rowSelection?: RowSelectionMode | RowSelectionOptions | "single" | "multiple" | boolean | null;
  }
}
