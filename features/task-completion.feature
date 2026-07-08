Feature: Task Completion Tracking
  As a user
  I want to mark a task as complete
  So that I can track my progress

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title             | Status    |
      | Buy groceries     | Open      |
      | Call dentist      | Open      |
      | Complete report   | Open      |
      | Email summary     | Completed |

  Scenario: Mark task as complete
    When I click the checkbox on the "Buy groceries" task
    Then the task is marked as complete
    And the task is visually updated (strikethrough, grayed out)
    And the completion_at timestamp is recorded

  Scenario: Uncheck a completed task to reopen it
    Given the task "Email summary" is completed
    When I click the checkbox on the "Email summary" task
    Then the task is marked as open
    And the strikethrough is removed
    And the visual styling returns to normal

  Scenario: Completed tasks are visually distinct
    Given I have a completed task "Finish presentation"
    When I view the task list
    Then the task displays with:
      | Visual Style       |
      | Strikethrough text |
      | 50% opacity        |
      | Gray color         |

  Scenario: Filter to show only open tasks
    When I click the "Filter" button
    And I select "Status: Open"
    Then only open tasks are displayed:
      | Title           |
      | Buy groceries   |
      | Call dentist    |
      | Complete report |
    And completed tasks are hidden

  Scenario: Filter to show only completed tasks
    When I click the "Filter" button
    And I select "Status: Completed"
    Then only completed tasks are displayed:
      | Title         |
      | Email summary |
    And open tasks are hidden

  Scenario: Show all tasks without filtering
    When I click the "Filter" button
    And I select "All"
    Then all tasks are displayed regardless of completion status

  Scenario: Progress stats show percentage of completed tasks
    Given I have 10 tasks total
    And 3 tasks are completed
    When I view the progress indicator
    Then the progress shows:
      | Information        | Value |
      | Completed tasks    | 3/10  |
      | Completion percent | 30%   |

  Scenario: Progress updates when task is completed
    Given I have 4 open tasks and 1 completed task (20% complete)
    When I mark another task as complete
    Then the progress updates immediately to:
      | Information        | Value |
      | Completed tasks    | 2/5   |
      | Completion percent | 40%   |

  Scenario: Completion timestamp is recorded
    Given the current time is 2026-07-08 at 14:30 UTC
    When I mark a task as complete
    And I view the task details
    Then the completed_at timestamp shows "2026-07-08 14:30 UTC"
    And the created_at timestamp is unchanged

  Scenario: Quick complete from list view
    When I view the task list
    And I click the checkbox on any task
    Then the task is completed immediately
    And I don't need to open the task details

  Scenario: Complete a task with past due date
    Given I have a task "Submit proposal" with due date "2026-07-05"
    And the current date is 2026-07-08
    When I mark the task as complete
    Then the task is marked complete
    And the overdue indicator is removed
