# Task Plan

# Cross-Stack
- [ ] Back up our current dev db: rename it to dev. We shouldn't lose it.
- [ ] Implement the capability of holding multiple databases and choosing one of them.
      They will be assigned project names and will be chosen in the UI,
      directly as a menu option at the top of the samples page
      (or alternatively in a possible app landing page).
- [ ] Implement a way of assigning an author name and a project name to the databases.
      Should that be done directly in the database?
- [ ] Add display names to the parameters:
      Currently, the UI surfaces the parameter names just like they are given in the catalog (database seed). These are in snake_case.
      I want the schema and catalog to have an additional display_name attribute so the UI can show a display name which uses Title Case.
      When the user adds a new parameter from the UI, the app will need to derive a snake_case parameter name from the entered parameter name.
- [ ] Implement a summary view and add it to the base columns in the UI.
      It should list the most important parameters for quick appraisal.
	  The per-stage _notes parameters should be viewed by filtering by "notes" I guess.
	  I assume per-stage notes are enough for all notes.
	  "General" notes with pertinent info can go into one of them?

# Backend

- [ ] Link the numeric parameter definitions in the seed to fitting units.
- [ ] Switch all *_notes parameters in the catalog to TEXT.
- [ ] Implement the value deletion and parameter deletion use cases.
- [ ] Implement unfrozen option lists.
      Currently, all parameters with options are limited to those options.
      When I add a new parameter value in the UI, it says this value is not allowed.
      So I have to review which parameters should have only these options,
      and which should have suggested/seeded options but allow new ones too.
      Or just allow new options for all
      -- it's simpler to implement and you can always delete values after.
- I will have to think about how to implement a control or warning function
  for some parameters to prevent possibly critically wrong values,
  to prevent human stupidity from introducing questionable data...
- [ ] Move to Postgres DB

# UI

- [ ] Make the cell dropdown button appear on hover.
- [ ] Fix the text field shift that happens when the cell is activated.
      Currently, when the cell is activated, a dark field appears behind the value (this is the field for typing),
	  but the right edge of this field is shifted one character to the left and
	  causes the text to shift to the left too.
	  Remove this shift by extending the field 1 character distance to the right,
	  so it sits flush with the left edge of the dropdown button.
	  (The left, top and bottom edges of the field are already correctly in line with the cell edges.)
- [ ] Project chooser:
      This project chooser can choose from among already created databases or allow creating a new one.
      When creating a new one, provide the option of choosing from among the already created databases to use as a template,
      with the additional option of selecting (with checkboxes) which types of data to clone:
      the parameter groups, the parameters (requires groups too), or the parameter values (requires groups and parameters too, so the other 2 checkboxes are auto-selected when selecting this).
      The new database will then be cloned from the template database.
- [ ] Implement a toast feature for future toasts.
      Have non-allowed values produce a toast instead of a Next.js Console error.
- Add a second header row to the top of the parameters table,
  which shows the parameter group for each column's parameter.
  Merge its cells to span all the columns pertaining to the same parameter group.
  Alternatively, give the columns which pertain to one group a color
  which differs from the neighboring columns (so group colors alternate)
- OR split the parameter section of the sample rows into one row per group,
  so the table is much less wide and the groups are stacked.
- [ ] Ability to select a range of cells instead of just a single cell.

# Server

- Get domain hosting
- Host FastAPI externally or on own domain
- Host DB externally

# Deferred

## Sample creation page

- [ ] Add an extra sample creation page?
  With a table similar to what the Streamlit UI used to have.
  Alternatively, add a dedicated sample creation row
  to the bottom or above of the samples matrix.
- Add an extra bottom row with dropdown fields for parameter entry.
- Also add a sample selection dropdown field just above the table
  so the user can choose other samples than the newly created one.
- Add a toast, which gives value editing feedback,
  that floats and appears at the bottom of the page.

## Landing page

- Add landing page?
  It should show the app logo and name and include a project chooser.
- Initially, show an empty logo container and empty project name field.
  When clicking the logo container, the user can choose an image file from the system to use as a (new) logo.
  When clicking the project name field, the user can type in a project name
