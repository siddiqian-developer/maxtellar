Feature: Task Editing
  As a user
  I want to edit an existing task's title, description, or metadata
  So that I can update information as my needs change

  Background:
    Given the task management app is loaded
    And I have a task "Complete project report" with description "Q2 review"

  Scenario: Edit task title
    When I click on the task "Complete project report"
    And I change the title to "Complete Q2 project report"
    And I save the changes
    Then the task title is updated to "Complete Q2 project report"
    And the updated_at timestamp is refreshed
    And the change is persisted

  Scenario: Edit task description
    When I click on the task "Complete project report"
    And I change the description to "Q2 review with metrics"
    And I save the changes
    Then the task description is updated
    And the updated_at timestamp is refreshed

  Scenario: Edit multiple task fields simultaneously
    When I click on the task "Complete project report"
    And I change the title to "Complete and review report"
    And I change the priority to "Urgent"
    And I change the due date to "2026-07-10"
    And I save the changes
    Then all fields are updated:
      | Field      | New Value              |
      | Title      | Complete and review report |
      | Priority   | Urgent                 |
      | Due Date   | 2026-07-10             |
    And the updated_at timestamp reflects the change time

  Scenario: Cancel editing without saving changes
    When I click on the task "Complete project report"
    And I change the title to "New title"
    And I change the description to "New description"
    And I click the "Cancel" button
    Then the task title remains "Complete project report"
    And the task description remains "Q2 review"
    And no changes are persisted

  Scenario: Edit task status
    When I click on the task "Complete project report"
    And I change the status to "In Progress"
    And I save the changes
    Then the task status is updated to "In Progress"
    And the status icon in the list view is updated

  Scenario: Save changes on blur (auto-save)
    When I click on the task "Complete project report"
    And I change the title to "New title"
    And I click outside the text field
    Then the changes are automatically saved
    And the updated_at timestamp is updated

  Scenario: Edit task with very long description
    When I click on the task "Complete project report"
    And I enter a 2000 character description
    And I save the changes
    Then the full description is saved
    And the description is displayed correctly in the task view

  Scenario: Verify last modified timestamp is tracked
    Given the task was created at 2026-07-07 10:00 AM
    When I edit the task at 2026-07-08 3:00 PM
    And I save the changes
    Then the created_at timestamp remains 2026-07-07 10:00 AM
    And the updated_at timestamp is 2026-07-08 3:00 PM
