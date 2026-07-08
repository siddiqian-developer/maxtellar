Feature: Task Due Dates
  As a user
  I want to set and edit due dates for tasks
  So that I can meet deadlines and plan my time

  Background:
    Given the task management app is loaded
    And the current date is 2026-07-08

  Scenario: Set a due date on a new task
    When I create a new task "Complete project"
    And I click on the "Due Date" field
    And I select "2026-07-15" from the date picker
    And I save the task
    Then the task is created with due date "2026-07-15"
    And the due date is persisted

  Scenario: Due date is optional
    When I create a new task "Open-ended task"
    And I leave the due date field empty
    And I save the task
    Then the task is created without a due date
    And no due date is displayed in the task list

  Scenario: Edit due date on existing task
    Given I have a task "Complete report" with due date "2026-07-10"
    When I click on the task
    And I change the due date to "2026-07-20"
    And I save
    Then the task due date is updated to "2026-07-20"
    And the change is persisted

  Scenario: Clear a due date
    Given I have a task "Buy milk" with due date "2026-07-09"
    When I click on the task
    And I click the "Clear Due Date" button
    And I save
    Then the task due date is removed
    And no due date is displayed

  Scenario: Date picker provides easy selection
    When I create a task and click the "Due Date" field
    Then a date picker appears with:
      | Feature            |
      | Calendar view      |
      | Today button       |
      | Next 7 days option |
      | Custom date input  |

  Scenario: Tasks with past due dates show overdue indicator
    Given I have a task "Call vendor" with due date "2026-07-05"
    And the current date is 2026-07-08
    When I view the task list
    Then the task "Call vendor" shows an overdue indicator
    And the overdue indicator is visually distinct (red color or warning icon)

  Scenario: Sort tasks by due date (nearest first)
    When I click the "Sort by" dropdown
    And I select "Due Date"
    Then tasks are sorted by due date with nearest first:
      | Title            | Due Date   |
      | Fix bug #42      | 2026-07-09 |
      | Buy groceries    | 2026-07-10 |
      | Complete report  | 2026-07-15 |
      | Finish proposal  | None       |

  Scenario: Tasks without due dates appear last in date sort
    Given I have tasks with and without due dates
    When I sort by due date
    Then tasks with due dates appear first
    And tasks without due dates appear at the end

  Scenario: Due date is displayed in task list
    When I view the task list
    Then each task shows its due date in the format "MMM DD"
    And overdue tasks show the date in red
    And today's due date shows with special indicator

  Scenario: Set due date in different formats
    When I open the date picker
    And I type "Jul 15, 2026" in the date input
    Then the system recognizes the format
    And the due date is set correctly

  Scenario: Edit due date to today
    Given I have a task "Urgent action" with due date "2026-07-20"
    When I change the due date to "2026-07-08"
    And I save
    Then the task is marked as due today
    And it appears in the "Today" view

  Scenario: Filter by overdue tasks
    When I click the "Filter" button
    And I select "Overdue"
    Then only tasks with past due dates are displayed
    And tasks without due dates are hidden
