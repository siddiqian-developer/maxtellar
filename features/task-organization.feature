Feature: Task Organization with Projects
  As a user
  I want to group related tasks into projects
  So that I can organize tasks by area of responsibility or goal

  Background:
    Given the task management app is loaded
    And I have the following projects:
      | Project Name |
      | Work         |
      | Personal     |
      | Home         |

  Scenario: Create a new project
    When I click the "Create Project" button
    And I enter "Fitness" as the project name
    And I enter "Track fitness goals" as the project description
    And I click "Create"
    Then the project "Fitness" appears in the projects list
    And the project has no tasks initially

  Scenario: Create a project with name only
    When I click the "Create Project" button
    And I enter "Shopping" as the project name
    And I leave the description empty
    And I click "Create"
    Then the project "Shopping" is created successfully
    And the project has an empty description

  Scenario: Assign task to project
    When I create a new task "Complete presentation"
    And I assign it to project "Work"
    And I save the task
    Then the task appears in the "Work" project
    And the task is associated with the "Work" project

  Scenario: Assign existing task to different project
    Given I have a task "Update resume" in project "Personal"
    When I open the task
    And I change the project to "Work"
    And I save the changes
    Then the task is moved to the "Work" project
    And the task no longer appears in "Personal" project

  Scenario: Filter tasks by project
    When I click on the "Work" project
    Then only tasks assigned to "Work" project are displayed
    And the task count shows the correct number
    And other projects' tasks are hidden

  Scenario: View all tasks in a project
    Given the "Work" project has 5 tasks
    When I click on the "Work" project
    Then all 5 tasks are displayed
    And each task shows its title and metadata

  Scenario: Rename a project
    When I right-click on the "Personal" project
    And I select "Rename"
    And I change the name to "Personal Life"
    And I click "Save"
    Then the project is renamed to "Personal Life"
    And all tasks in the project remain associated

  Scenario: Delete a project (with confirmation)
    When I right-click on the "Shopping" project
    And I select "Delete"
    Then a confirmation dialog appears
    And the message indicates what will happen to tasks
    When I confirm the deletion
    Then the project is deleted
    And tasks in that project are moved to "Inbox" (default project)

  Scenario: Move task between projects
    Given I have a task "Buy milk" in project "Shopping"
    When I click on the task
    And I change the project to "Home"
    And I save
    Then the task is reassigned to "Home" project
    And the "Shopping" project task count decreases

  Scenario: Default project exists for unassigned tasks
    When I create a task without assigning a project
    And I save the task
    Then the task appears in the "Inbox" project
    And the Inbox project is created automatically if it doesn't exist

  Scenario: View project count with task statistics
    When I view the projects list
    Then each project shows:
      | Information    |
      | Project name   |
      | Task count     |
      | Description    |
