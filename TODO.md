# Task Planner

## Planner

------------------------------------------------------------------------------------




### Current Tasks

#### GitHub

#### Server
- [ ] DO: Auth implementation
      - See build plan
      - [ ] Enter Clerk keys in Cloudflare Pages
      - [ ] Enter Clerk keys in Hetzner VPS
- [ ] DO: Set up deployment
	  - [x] Find most cost efficient yet acceptable solution for full stack (domain, DB, API and UI) hosting and deployment.
      - See build plan
      - [ ] Rent Hetzner CX11 VPS (API + DB)
            - Alternatives (Vercel, Render, ...) cost more or are less performant (API sleeps etc), even though they offer more QoL features
              - Host FastAPI externally or on own domain
              - Host DB externally
      - [ ] Set up Hetzner VPS
      - [ ] Set up Cloudflare Pages (= domain hosting?)

#### Backend

#### Cross-Stack
- [ ] Undo/Redo functionality
      - Implement backend support for undo/redo of actions like deleting and creating and everything else.
        - Copy actions from previous chat request  
        - Why was this not implemented yet? In which chat did I request this? Probably Button collapsing | Delete feature
- [ ] TEST: Invalidation
  	  Remove unused options from the dropdowns.
      Currently, once they are added momentarily, they appear in the cell value dropdowns but never disappear again once not used anymore.
      e.g. in target_family
- [ ] TEST: Project manager
      - I like your implementation suggestions for the dropdown and the overlay. Include everything you suggested:
        - List of all projects with actions
        - "Create new project" button (could reuse the existing dialog)
        - Rename button/input per project
        - Delete button with confirmation dialog
        - Current active project indicator
      - Possibly cards would be better, but I'm not sure yet. I want each card to give a summary of the most important facts of the project, including:
        - project name (= header/title)
        - institutes which are tasked with the project
        - person(s) responsible for the project
        - people involved (derive from the authors assigned roles in the database)
        - person who created the project (in the future users will be able to share and collaborate on projects)
        - date of creation
        - datetime last modified
        - status of the project (e.g. database health etc)
        - stage of the project: progress in sample preparation, experiment setup, measurements, analysis, writing, publication
        - number of samples
        - number of parameters (with and without values)
        - number of measurement runs, number of data points(=?)
        - anything else I'm missing
      Since there is so much information to show here, it might make sense to have a collapsed card (or list item) state which shows an essential subset of this information and a fully open state which shows everything.
      The most recent projects (with toggle for most recently opened by the user or most recently modified by anyone) should float to the top.
      A list or tabs for the projects could pose an alternative, but I'm not sure how they could integrate this recency functionality. Or we use a mixture given the collapsed and open states. Please advise.
      - I want a grid-wide overlay (like the sample details overlay).
      - I also want rename functionality.

#### Frontend
- [ ] Migrate from Next.js to Tanstack
	  - I'm considering migrating from React and Next.js to Tanstack
	    Reasons: more code clarity, less "magic", simplicity, reliable deploying, and better state handling and mutation.
        This consideration is inspired by 
		- difficulties in achieving working solutions for certain UI components (column width handling, though this may be due to AG Grid limitations)
		- problems with layout responsitivity (e.g. slow or lacking layout changes upon changes in viewport width)
		- problems with render speed (a lot of slow, jagged behavior e.g. when scrolling, sliding column handlers, changing selections etc.)
		- the following Reddit post: <https://www.reddit.com/r/reactjs/comments/1k27s0y/how_is_tanstack_a_better_choice/>
	  - Advise me on this choice: Is this a smart decision? What do I win/lose?
	  - Work out which parts of the code will need to change in this migration.
	  - Work out the build plan.
- [ ] Migrate away from AG Grid
      I'm considering moving away from AG Grid to another library or a self-built implementation for my sample data table.
      - Advantages/reasons why I chose it for my implementation:
        - It looks nice out of the box
        - It's predestined for my application type: data-heavy tabular UI
        - It's claimed to be top-notch in terms of speed and reactivity
      - But some customizations turn out almost impossible to achieve
        (e.g. custom column width handling, custom filter button behavior, custom cell behavior and looks)
	  - And some things might even be impossible
	    (e.g. multi-cell/range selections: is offered only by the Enterprise license, so I assume it cannot be implemented manually?)
	  - Alternatives?
    	- TanStack Table
    	- Anything else?
- [ ] Migrate from React to Solid

#### UI
- [ ] Button collapsing
	  - Improve behavior: still not reacting in the right way
- [ ] Settings page
      - [ ] Improve compactness
        - List is too big
        - Compact has bigger headers than normal does. That makes no sense; make them smaller.
      - [ ] Refine the available accent colors
  	    - Use ice/pastel versions: ice blue, ice green, ...
  	    - Use different color sets for dark and light mode

- [ ] TEST: Change cell focus behavior and looks
      - There is still a shape which appears behind cell text when activating the cell using mouse or Enter (it has a subtle darker background and a subtle border with round corners). Prevent this shape from appearing.
      - Currently there are still three different focus borders in grid cells.
      (1) The border which appears when selecting a cell using arrow keys or Tab and has square corners. This is the only border that is allowed to appear!
      (2) When selecting a cell using the mouse or Enter, two things happen which shouldn't happen: a subtle border appears which has rounded corners (described above), and border number (1) is replaced by a similar rectangle border which has a thinner stroke.
      (3) The one which appears when clicking on a cell which was already selected, and has strongly rounded corners and a thick stroke.
      I need you to remove borders (2) and (3). I only want to see border (1).
      - Improve Enter behavior: when a cell is selected, pressing Enter should make the cell go into text edit mode and insert a cursor at the end of the text/value. Pressing Enter again should make the cell go out of text edit mode, back into selection mode.
- [ ] TEST: Details overlay
		New feature:
		- I need a distinction between parameters assigned to a sample and values assigned to a parameter. In other words, parameters can be created in the database without assigning them to a sample, and assigning parameters to a sample does not require assigning values to the parameter for this sample (i.e. parameters can be left empty). This will require a modification in the backend, either by allowing spv entries to remain empty (null), which is probably the easiest way (not sure yet if it is correct and safe though), or by adding a new table for sample parameter linking.
		- For existing samples, consider parameters with empty values as not assigned to the sample.

		Concerning Sample Details overlay:
		- The overlay should show for a sample only parameters assigned to it, which happens either when the parameters are copied from a template, or when they are manually added to the sample through the detail overlay.
		- Include a checkbox which activates showing all parameters in the database regardless of assigment ("Show all parameters") and remember its state (i.e. the checkbox should not be sample-specific but independent of samples). Give the unassigned parameter rows a different coloring: somewhat darker text.
		- Currently, only parameter names and values are listed in the overlay. Instead, use the same 4-field setup as the add new parameter row (see below). Only difference is: here, only the Value field will get a dropdown (for historical values), since the other ones were already decided upon when the parameter was assigned.
		- Use space wisely: make all columns aligned throughout, fit all fields to content, and cut off fields without ellipsis (use a short fadeout) to fit the viewport.
		- Remove the section headers for the parameter groups.
		- If multiple samples are selected, the overlay should show the values of the different samples side by side (i.e. in columns) for each parameter. The Type field comes at the end (to the right of the value columns). Horizontal scrolling through the sample columns if necessary. If there are parameters which are only assigned to some but not all of the selected samples, assign them to the other ones.

		Concerning the Add New Parameter row:
		- Most recently used options for prefills refer to most recently inserted into the database, not to localstorage. No need to track this in localStorage: just query the database.
		- Add a nice blue border around the value field to signal the value is prefilled, until the user edits the value.
		- Don't offer or allow options from the sample(s) currently being edited, since they are already added.
		- Only allow changing type if the parameter is completely new or is numeric but has no unit yet. Existing parameters have types and possibly units already assigned to them and these cannot be changed.
		- Right-align the Add Parameter button.
		- Collapse Value Type and Unit into a Type field which lists units (for numeric types) as well as types (include the numeric type for unitless and for when the user doesn't know which unit it needs yet), like Text, Date (in ISO format), ... This field should populate units and types from the database and provide an option to type in a new one and another option to define a new type format.
		- Increase the padding to the right of the chevron a bit so it doesn't stick to the edge as much.
		- In the parameter group and name dropdowns, include an option to type in a new group/name.
		- The Value field should be prefilled with the most recently used value for the chosen parameter and get a dropdown list with other historical values (from the database), like in the AG Grid. Also include an option to type in a new value.
		- When pressing the Add Parameter button, the entry is added to the list and the add new parameter row is emptied, ready for the next entry.
- [ ] TEST: Add sample dialog/overlay
      - [ ] Improve calendar styling
      - [ ] etc...

- [ ] TEST: Fix toast clicking and error dialog window appearing
- [ ] TEST: Column picker overlay

##### Hard Tasks
- [ ] Improve column width handling
	  - Rebuild from scratch!
      - Unify column width handling for base and parameter columns.
        - Base column sizing is not (auto)sizing regularly.
      - Fix missing padding
      - Fix width calculations. Still not working properly.
      - Max size: why? If so, cut longer content using ellipsis or introduce wrapping.
- [ ] Fix column autosize when using handler
- [ ] Fix column filter button behavior
- [ ] Synchronize horizontal scrolling
      Header and floating filter bar experience lag and jag when scrolling and don't scroll in unity with the rows.
	  Possibly an AG Grid bug.

	  Post bug:
		AG Grid GitHub issue URL:
		```
		https://github.com/ag-grid/ag-grid/issues/new
		```

		Bug report title:
		```
		Horizontal scroll lag/jagged scrolling: Header and filter bar out of sync with body rows
		```

		Bug report text:
		```markdown
		## Description
		When scrolling horizontally, the header row and floating filter bar experience lag and jagged scrolling, causing them to scroll out of sync with the body rows (region of cells). The header and filter bar do not scroll in unity with the rows.

		## Expected Behavior
		The header row and floating filter bar should scroll smoothly and stay perfectly synchronized with the body rows during horizontal scrolling.

		## Actual Behavior
		When scrolling horizontally (especially with trackpad/touchpad or mouse wheel):
		- Header row scrolls with lag/jagged movement
		- Floating filter bar scrolls with lag/jagged movement  
		- Header and filter bar get progressively out of sync with body rows the further you scroll
		- This creates a misaligned appearance between headers/filters and their corresponding columns

		## Environment
		- **AG Grid Version:** 34.3.0
		- **React Version:** 19.2.0
		- **Framework:** Next.js 16.0.0
		- **Theme:** ag-theme-quartz
		- **Browser:** [Please specify: Chrome/Firefox/Safari and version]
		- **OS:** [Please specify: macOS/Windows/Linux]

		## Grid Configuration
		```typescript
		<AgGridReact
		rowData={data}
		columnDefs={columnDefs}
		defaultColDef={{
			sortable: true,
			filter: true,
			resizable: true,
			floatingFilter: false,
			flex: 0,
			minWidth: 90,
			editable: false,
		}}
		animateRows
		suppressAnimationFrame
		suppressNoRowsOverlay
		stopEditingWhenCellsLoseFocus
		suppressRowClickSelection
		theme="legacy"
		rowSelection="multiple"
		/>
		```

		## Steps to Reproduce
		1. Create a grid with many columns requiring horizontal scrolling
		2. Enable filters on columns
		3. Scroll horizontally using:
		- Mouse wheel (horizontal scroll)
		- Trackpad/touchpad horizontal swipe
		- Scrollbar drag
		1. Observe the header and filter bar behavior

		## Additional Information
		- The issue occurs consistently during horizontal scrolling
		- Manual attempts to sync via `scrollLeft` property do not work (AG Grid appears to use CSS transforms internally)
		- The lag/jagged behavior is more noticeable with smooth scrolling inputs (trackpad)
		- This issue affects both the main header row and any floating filter rows

		## Related Issues
		N/A - First time reporting this issue

		## Notes
		Attempted workarounds (setting `scrollLeft` on `.ag-header-viewport` elements) were unsuccessful, suggesting AG Grid manages scrolling through internal mechanisms (possibly CSS transforms) that are not directly accessible.
		```

		**Additional notes for posting:**
		- Fill in your browser and OS in the Environment section
		- If you can record a short video/gif showing the issue, attach it
		- Link to any related discussions if found




------------------------------------------------------------------------------------




### Next Tasks

#### GitHub
- [ ] Update .github README
  	  - So it is correct
  	  - So it is fully written by me and not by some AI

#### Backend
- [ ] Fix sequence number
      Currently the db increments the sequence number for same-day samples,
      but the sequence needs to be limited to one person since they work independently from each other.
      Right now, when two persons make samples for the same project,
      they share the sequence.
      But when a person makes samples for different projects on the same day,
      they will increment their own sequence and won't think about how many someone else makes.
      It would be crazy if they'd need to account for that when ID-ing their samples!
- [ ] Switch all *_notes parameters in the catalog to TEXT.
- [ ] Implement unfrozen option lists.
      Currently, all parameters with options are limited to those options.
      When I add a new parameter value in the UI, it says this value is not allowed.
      So I have to review which parameters should have only these options,
      and which should have suggested/seeded options but allow new ones too.
      Or just allow new options for all
      -- it's simpler to implement and you can always delete values after.
- [ ] Reorder notes parameters
      Put the _notes parameters first in the group
      and make sure they are shown in this order in the grid
- [ ] Consider value option controlling/warning
      I will have to think about how to implement a control or warning function
	  for some parameters to prevent possibly critically wrong values
	  to prevent human stupidity from introducing questionable data...
- [ ] Implement the parameter deletion use case.

#### Cross-Stack
- [ ] Parameter display names
      - Add display names to the parameters
		Currently, the UI surfaces the parameter names just like they are given in the catalog (database seed). These are in snake_case.
		I want the schema and catalog to have an additional display_name attribute so the UI can show a display name which uses Title Case.
		When the user adds a new parameter from the UI, the app will need to derive a snake_case parameter name from the entered parameter name.
- [ ] Units
	  - Link the numeric parameter definitions in the seed to fitting units.
      - Then implement proper unit and dimension handling in the engine.
      - Then make sure the units and values surface properly in the UI.

#### UI
- [ ] Plan big UI design concepts
      - How to handle the different divisions:
	    samples / planning / experiments / results / plotting / parameter diffing
      - [ ] Add buttons to the top next to the project button: Samples, Experiments, Results,
      		or View and Plan.
			These need to open different grids or overlays.
	  		I need to plan experiments etc.
- [ ] Composition weight calculator
      Implement a weight calculator in the details window of parameter columns
      so I can insert a wt% or a ratio and it automatically calculates exactly how much I need.
- [ ] Parameter editing
      Implement edit mode for the parameters,
      with a +-pill which allows adding parameters.




------------------------------------------------------------------------------------



### Long-Term Future Tasks

- [ ] Parameter diffing (USP feature)
      - [ ] Integrate it in cell selections
			or just make an overlay which allows selecting arbitrary parameters
- [ ] Export functionality
	  - Export filtered grid to CSV/PDF/...
- [ ] Migrate to Postgres DB
- [ ] Collaboration
      - [ ] Sharing of databases
      - [x] Polling/SSE updates is already implemented
- [ ] Create example database for invited users/beta testers



------------------------------------------------------------------------------------




### Maintenance

- [ ] Refactoring
      - [ ] Make samples-page more modular: outsource its parts into separate pages and components.
            The file has become quite chaotic and big by now, clear overview is lacking/legibility and code maintenance suffer
      - [ ] Define general classes (?) for more systematic code and design
            e.g. for: grid, overlay wrapper, buttons, colors, ...
	  - [ ] Offload computations currently in the frontend to the backend (app or database) (if useful)
    	    - Example: initially the frontend computed unique values for the cell value dropdown lists,
                       whereas this should have been done by SQL queries
			- But parsing and validation of values inserted by the user in the UI is apparently better done directly in the UI,
			  otherwise each edit/insertion would require a round-trip through API, app and DB,
			  which would reduce responsiveness
- [ ] Write tests for the whole application








### Deferred

#### Unimportant

- [ ] Manually implement range selection behavior (without enterprise license) when possible

- [ ] Save last filters into localStorage, so it is remembered after page reload.
- [ ] When in the direct vicinity of a column width handler, the tooltip with the column header's full name should not show.
	  Allow it only when the mouse hovers over the text glyph (not the complete header cell).
	  There is already some non-working code for this.

- [ ] Improve the checkbox column:
      - Create custom checkbox column in the same style as the column picker overlay. This is because we can't seem to hack AG Grid's implementation to remove the focus border.
	  - Remove the old checkbox column and all its code.
      - Move the checkboxes toward the right edge of the checkbox column (i.e. remove the right padding) so they can be closer to the ID vaues in the column next to it.
- [ ] Implement column pinning. Currently, the ID column is pinned and this cannot be changed.
- [ ] Implement more toasts.
- [ ] Let Enter activate text edit mode and select all instead of adding a cursor at the end?

- Add a second header row to the top of the parameters table,
  which shows the parameter group for each column's parameter.
  Merge its cells to span all the columns pertaining to the same parameter group.
  Alternatively, give the columns which pertain to one group a color
  which differs from the neighboring columns (so group colors alternate)
- OR split the parameter section of the sample rows into one row per group,
  so the table is much less wide and the groups are stacked.

#### Sample creation page

- [ ] Add an extra sample creation page?
  With a table similar to what the Streamlit UI used to have.
  Alternatively, add a dedicated sample creation row
  to the bottom or above of the samples matrix.
- Add an extra bottom row with dropdown fields for parameter entry.
- Also add a sample selection dropdown field just above the table
  so the user can choose other samples than the newly created one.
- Add a toast, which gives value editing feedback,
  that floats and appears at the bottom of the page.

#### Landing page

- Add landing page?
  It should show the app logo and name and include a project chooser.
- Initially, show an empty logo container and empty project name field.
  When clicking the logo container, the user can choose an image file from the system to use as a (new) logo.
  When clicking the project name field, the user can type in a project name




### Declined

- Implement a summary SQL-view and add it to the base columns in the UI.
      It should list the most important parameters for quick appraisal.
      The per-stage _notes parameters should be viewed by filtering by "notes" I guess.
      I assume per-stage notes are enough for all notes.
      "General" notes with pertinent info can go into one of them?
