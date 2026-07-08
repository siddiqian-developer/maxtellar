Feature: Task Priority Management
  As a user
  I want to assign a priority level to tasks
  So that I can focus on what matters most

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title           | Priority |
      | Buy groceries   | Low      |
      | Call dentist    | Medium   |
      | Fix critical bug | Urgent   |

  Scenario: Priority levels are available
    When I create a new task
    Then the following priority options are available:
      | Priority |
      | Low      |
      | Medium   |
      | High     |
      | Urgent   |

  Scenario: Set priority on new task
    When I click the "Create Task" button
    And I enter "Complete quarterly review" as the title
    And I select "High" as the priority
    And I save the task
    Then the task is created with priority "High"
    And the priority is persisted

  Scenario: Default priority is Medium for new tasks
    When I create a task without specifying priority
    Then the task is assigned "Medium" priority by default

  Scenario: Change priority of existing task
    Given I have a task "Buy groceries" with priority "Low"
    When I click on the task
    And I change the priority to "High"
    And I save
    Then the task priority is updated to "High"
    And the updated_at timestamp is refreshed

  Scenario: Priority is displayed with visual indicator
    When I view the task list
    Then each task shows a priority badge with appropriate color:
      | Priority | Color  |
      | Low      | Green  |
      | Medium   | Blue   |
      | High     | Orange |
      | Urgent   | Red    |

  Scenario: Sort tasks by priority
    When I click the "Sort by" dropdown
    And I select "Priority"
    Then tasks are sorted by priority from highest to lowest:
      | Order | Title            | Priority |
      | 1     | Fix critical bug | Urgent   |
      | 2     | Call dentist     | Medium   |
      | 3     | Buy groceries    | Low      |

  Scenario: Change priority quickly from list view
    When I view the task list
    And I click the priority badge on the "Buy groceries" task
    Then a priority menu appears with options
    And I can select a new priority directly
    And the task priority is updated immediately

  Scenario: Multiple tasks with same priority
    Given I have multiple "High" priority tasks
    When I view the task list sorted by priority
    Then all "High" priority tasks are grouped together
    And they maintain their relative order (by creation date)

  Scenario: Filter tasks by priority
    When I click the "Filter" button
    And I select "High" priority
    Then only tasks with "High" priority are displayed
    And the other priorities are temporarily hidden
