# Features TODO

## Workspace: Quick Actions Selector

Status: idea
Priority: later

Goal:
Add a Workspace setting that lets the user choose which quick actions appear in the right-side Quick Actions widget.

Why:
- Quick Actions customization is useful, but it is less urgent than current product features.
- The system should support future actions automatically instead of requiring manual UI updates every time a new action is added.

Requirements:
- Add this under Workspace settings.
- Show a list of available quick actions with selection controls so the user can choose which ones appear in the widget.
- User choices should control only visibility/order in the Quick Actions widget, not whether the action exists elsewhere in the app.
- The feature must work with future actions added later.

Technical direction:
- Create a centralized action registry for all app actions that can appear in quick actions.
- Each registered action should define at minimum:
  - `id`
  - `label`
  - `icon`
  - `location/surfaces`
  - `enabled/availability rules`
  - `handler`
- The Workspace setting should read from that registry instead of hardcoding a static action list.
- The Quick Actions widget should also read from that registry plus the user’s saved selections.
- Any new action added to the registry should become automatically selectable in Workspace settings.

Storage:
- No database migration is required if preferences are stored in existing local app settings/local storage.
- A database migration is only needed later if these preferences must sync across users/devices through backend persistence.

Behavior notes:
- If an action is unavailable in the current context, it can still appear in settings but should be marked unavailable or disabled there if needed.
- The widget should hide actions the user did not select.
- The registry should support future reuse across widget settings, menus, shortcuts, and command surfaces.

Tradeoff:
- This becomes truly automatic only after existing scattered actions are normalized into the shared registry pattern.
