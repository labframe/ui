# Task Plan

- [ ] Write an AGENTS.md file for the UI.

# Cross-Stack
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

# Database

- [ ] Currently, all parameters with options are limited to those options.
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

- [ ] Project chooser:
      This project chooser can choose from among already created databases or allow creating a new one.
      When creating a new one, provide the option of choosing from among the already created databases to use as a template,
      with the additional option of selecting (with checkboxes) which types of data to clone:
      the parameter groups, the parameters (requires groups too), or the parameter values (requires groups and parameters too, so the other 2 checkboxes are auto-selected when selecting this).
      The new database will then be cloned from the template database.

## Samples page

- [ ] Implement easy data entry in the samples page:
  - In-line editing of parameter values:
    It would be great if the user could just double-click a cell in the table
    and then modify the current value text (if the cell already contains a value)
    or type in a new value (if the cell is currently empty).
    Once the user leaves the cell, the database is updated with the newly typed value and the table shows the new value.
    Ideally, for performance, not the whole page or table is reloaded, but just the cell.
  - Add an extra column to the right which allows choosing a parameter which has not been used by any sample yet.
- Add a second header row to the top of the parameters table,
  which shows the parameter group for each column's parameter.
  Merge its cells to span all the columns pertaining to the same parameter group.
  Alternatively, give the columns which pertain to one group a color
  which differs from the neighboring columns (so group colors alternate)
- OR split the parameter section of the sample rows into one row per group,
  so the table is much less wide and the groups are stacked.

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
