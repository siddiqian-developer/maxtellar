Feature: Task Creation
  As a user
  I want to create a new task with a title and optional description
  So that I can track something I need to do

  Background:
    Given the task management app is loaded
    And I am viewing the task list

  Scenario: Create a task with title only
    When I click the "Create Task" button
    And I enter "Buy groceries" as the task title
    And I click "Save"
    Then a new task with title "Buy groceries" appears in the list
    And the task status is "Open"
    And the task has a unique ID assigned

  Scenario: Create a task with title and description
    When I click the "Create Task" button
    And I enter "Complete project report" as the task title
    And I enter "Quarterly review document" as the task description
    And I click "Save"
    Then a new task appears with:
      | Field       | Value                    |
      | Title       | Complete project report  |
      | Description | Quarterly review document |
      | Status      | Open                     |
    And the task is created with current timestamp

  Scenario: Attempt to create a task without a title
    When I click the "Create Task" button
    And I leave the task title empty
    And I click "Save"
    Then an error message "Task title is required" is displayed
    And no task is created

  Scenario: Create a task with maximum length title
    When I click the "Create Task" button
    And I enter a title with 255 characters
    And I click "Save"
    Then the task is created successfully
    And the full title is preserved

  Scenario: Attempt to create a task with title exceeding 255 characters
    When I click the "Create Task" button
    And I enter a title with 256 characters
    And I click "Save"
    Then an error message "Title cannot exceed 255 characters" is displayed
    And no task is created

  Scenario: Create a task with special characters in title
    When I click the "Create Task" button
    And I enter "Fix bug: @#$% symbol parsing" as the task title
    And I click "Save"
    Then the task is created with title "Fix bug: @#$% symbol parsing"
    And special characters are preserved in the title

  Scenario: Create a task with long description
    When I click the "Create Task" button
    And I enter "Design UI" as the task title
    And I enter a 2000 character description
    And I click "Save"
    Then the task is created successfully
    And the description is fully preserved

  Scenario: Attempt to create a task with description exceeding 2000 characters
    When I click the "Create Task" button
    And I enter "My Task" as the task title
    And I enter a 2001 character description
    And I click "Save"
    Then an error message "Description cannot exceed 2000 characters" is displayed
    And no task is created
