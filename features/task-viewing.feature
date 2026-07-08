Feature: Task Viewing
  As a user
  I want to see all my tasks in a list view
  So that I can get an overview of what I need to do

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title              | Due Date   | Priority | Status   |
      | Buy groceries      | 2026-07-10 | High     | Open     |
      | Call dentist       | 2026-07-08 | Medium   | Open     |
      | Complete report    | 2026-07-15 | Urgent   | Open     |
      | Fix bug #42        | 2026-07-09 | High     | In Progress |
      | Email team         | 2026-07-07 | Low      | Completed |

  Scenario: View empty task list
    Given I have no tasks
    When I view the task list
    Then an empty state message "No tasks yet. Create one to get started!" is displayed
    And the "Create Task" button is visible

  Scenario: View all tasks in list
    When I view the task list
    Then all 5 tasks are displayed
    And each task shows:
      | Field          |
      | Title          |
      | Due Date       |
      | Priority badge |
      | Status icon    |

  Scenario: Default sort is by due date (nearest first)
    When I view the task list
    Then tasks are sorted by due date with nearest first:
      | Order | Title           | Due Date   |
      | 1     | Email team      | 2026-07-07 |
      | 2     | Call dentist    | 2026-07-08 |
      | 3     | Fix bug #42     | 2026-07-09 |
      | 4     | Buy groceries   | 2026-07-10 |
      | 5     | Complete report | 2026-07-15 |

  Scenario: Sort tasks by creation date (newest first)
    When I click the "Sort by" dropdown
    And I select "Date Created (Newest)"
    Then tasks are reordered by creation timestamp newest first
    And the sort order persists in the current view

  Scenario: Sort tasks by priority (highest first)
    When I click the "Sort by" dropdown
    And I select "Priority"
    Then tasks are sorted by priority with Urgent first:
      | Order | Title           | Priority |
      | 1     | Complete report | Urgent   |
      | 2     | Buy groceries   | High     |
      | 3     | Fix bug #42     | High     |
      | 4     | Call dentist    | Medium   |
      | 5     | Email team      | Low      |

  Scenario: Sort tasks by status
    When I click the "Sort by" dropdown
    And I select "Status"
    Then tasks are grouped and sorted by status in order:
      | Status      |
      | Open        |
      | In Progress |
      | Completed   |

  Scenario: List updates in real-time when a task is modified
    When I have the task list open
    And I open another window and complete the "Buy groceries" task
    Then the "Buy groceries" task in the current window shows as completed
    And the visual indicator (strikethrough) is updated immediately

  Scenario: View list with many tasks (performance)
    Given I have 100 tasks in the system
    When I view the task list
    Then all tasks load within 500 milliseconds
    And the list is scrollable
    And scrolling is smooth and responsive

  Scenario: Display overdue tasks with visual indicator
    Given the current date is 2026-07-08
    When I view the task list
    Then the task "Email team" (due 2026-07-07) shows an overdue indicator
    And overdue tasks are displayed with red text or warning icon
