Feature: Task Status Workflow
  As a user
  I want to track task status beyond just complete/incomplete
  So that I can see what's in progress or blocked

  Background:
    Given the task management app is loaded
    And the following status options are available:
      | Status       |
      | Open         |
      | In Progress  |
      | On Hold      |
      | Completed    |
      | Cancelled    |

  Scenario: Available status transitions
    When I have a task with status "Open"
    Then I can change the status to:
      | Status      |
      | In Progress |
      | On Hold     |
      | Completed   |
      | Cancelled   |

  Scenario: Change task status from Open to In Progress
    Given I have a task "Design mockups" with status "Open"
    When I click on the task
    And I change the status to "In Progress"
    And I save
    Then the task status is updated to "In Progress"
    And the status is persisted

  Scenario: Transition from In Progress to Completed
    Given I have a task "Review code" with status "In Progress"
    When I click on the task
    And I change the status to "Completed"
    And I save
    Then the task is marked as completed
    And the completed_at timestamp is recorded

  Scenario: Change status to On Hold
    Given I have a task "Implement feature" with status "In Progress"
    When I click on the task
    And I change the status to "On Hold"
    And I save
    Then the task status shows "On Hold"
    And the task is visually distinguished from active tasks

  Scenario: Cancel a task
    Given I have a task "Old requirement" with status "Open"
    When I click on the task
    And I change the status to "Cancelled"
    And I save
    Then the task is marked as cancelled
    And the task displays with cancellation styling (strikethrough or faded)

  Scenario: Status colors are consistent
    When I view the task list
    Then each status displays with consistent colors:
      | Status      | Color   |
      | Open        | Blue    |
      | In Progress | Orange  |
      | On Hold     | Yellow  |
      | Completed   | Green   |
      | Cancelled   | Gray    |

  Scenario: Filter tasks by status
    When I click the "Filter" button
    And I select "Status: In Progress"
    Then only tasks with "In Progress" status are displayed
    And I can apply this filter along with other filters

  Scenario: Filter by multiple statuses
    When I click the "Filter" button
    And I select "Status: Open"
    And I also select "Status: In Progress"
    Then tasks with either "Open" or "In Progress" status are displayed
    And completed and cancelled tasks are hidden

  Scenario: Default status for new tasks is Open
    When I create a new task
    And I don't explicitly set a status
    Then the task is created with status "Open"

  Scenario: Change status from any state to any other
    Given I have a task with status "On Hold"
    When I click on the task
    And I change the status to "Cancelled"
    And I save
    Then the status transitions successfully
    And no error occurs

  Scenario: Reopen a cancelled task
    Given I have a cancelled task "Revisit later"
    When I click on the task
    And I change the status back to "Open"
    And I save
    Then the task is reopened
    And the cancellation styling is removed

  Scenario: View progress by status
    When I view the dashboard
    Then I see a breakdown:
      | Status      | Count |
      | Open        | 3     |
      | In Progress | 2     |
      | On Hold     | 1     |
      | Completed   | 5     |
      | Cancelled   | 1     |
