Feature: Task Deletion
  As a user
  I want to delete a task
  So that I can remove tasks that are no longer relevant

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title             |
      | Buy groceries     |
      | Call dentist      |
      | Complete report   |

  Scenario: Delete a task via delete button
    When I click on the task "Buy groceries"
    And I click the "Delete" button
    And I confirm the deletion
    Then the task "Buy groceries" is removed from the list
    And only 2 tasks remain
    And the deletion is persisted

  Scenario: Delete a task via context menu
    When I right-click on the task "Buy groceries"
    And I select "Delete" from the context menu
    And I confirm the deletion
    Then the task "Buy groceries" is removed from the list
    And the deletion is persisted

  Scenario: Confirmation dialog appears before deletion
    When I click on the task "Buy groceries"
    And I click the "Delete" button
    Then a confirmation dialog appears with message:
      | "Are you sure you want to delete this task?" |
    And "Cancel" and "Delete" buttons are visible

  Scenario: Cancel task deletion
    When I click on the task "Buy groceries"
    And I click the "Delete" button
    And I click the "Cancel" button in the confirmation dialog
    Then the task "Buy groceries" remains in the list
    And no deletion occurs

  Scenario: Task removed from all views after deletion
    When I have the task "Buy groceries" displayed in multiple views
    And I delete the task "Buy groceries"
    Then the task is removed from:
      | View          |
      | All Tasks     |
      | Today view    |
      | Project view  |
      | Search results |

  Scenario: Delete task with long title
    When I have a task with a long title "This is a very long task description that spans multiple lines"
    And I delete this task
    Then the task is successfully removed

  Scenario: Delete a completed task
    Given I have a completed task "Finished task"
    When I delete the task "Finished task"
    And I confirm the deletion
    Then the task is removed from the list
    And the task count decreases
