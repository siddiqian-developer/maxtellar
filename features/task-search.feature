Feature: Task Search
  As a user
  I want to search for tasks by keyword
  So that I can quickly find specific tasks

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title                    | Description              |
      | Buy groceries            | Weekly shopping list     |
      | Call dentist             | Annual checkup           |
      | Complete project report  | Q2 review document       |
      | Fix bug in auth system   | Security issue           |
      | Update project timeline  | Schedule adjustment      |

  Scenario: Search box is visible in main view
    When I view the task list
    Then a search box is visible in the header
    And it has placeholder text "Search tasks..."
    And it has a clear button

  Scenario: Search by exact task title
    When I click in the search box
    And I type "Call dentist"
    Then the task "Call dentist" is displayed
    And other tasks are hidden

  Scenario: Search by partial keyword
    When I click in the search box
    And I type "project"
    Then tasks matching "project" are displayed:
      | Title                   |
      | Complete project report |
      | Update project timeline |
    And other tasks are hidden

  Scenario: Search is case-insensitive
    When I search for "CALL"
    Then the task "Call dentist" is found
    And case doesn't matter

  Scenario: Search by description
    When I click in the search box
    And I type "Security"
    Then the task "Fix bug in auth system" is displayed
    And the search matches description text

  Scenario: Search results update as user types (debounced)
    When I click in the search box
    And I type "b" slowly
    Then results update with slight delay (200ms)
    And I don't see excessive API calls

  Scenario: Clear search results
    When I have searched for "update"
    And I click the clear button in the search box
    Then all tasks are displayed again
    And the search box is emptied

  Scenario: Empty search results message
    When I search for "nonexistent keyword xyz"
    Then a message appears "No tasks match your search"
    And the task list is empty
    And a suggestion to modify search appears

  Scenario: Search with special characters
    When I search for "@bug" or "#urgent"
    Then the search handles special characters
    And appropriate tasks are found if they contain these

  Scenario: Search across multiple fields
    Given I have a task "Buy milk" with description "Dairy and bakery section"
    When I search for "bakery"
    Then the task "Buy milk" is found
    And search matches both title and description

  Scenario: Search is combined with filters
    When I apply a filter for "High" priority
    And I search for "project"
    Then only high priority tasks matching "project" are displayed
    And search and filter work together

  Scenario: Preserve search during session
    When I search for "bug"
    And I click on a task to view details
    And I go back to the task list
    Then the search "bug" is still active
    And the search results are still displayed

  Scenario: Long search queries
    When I search for "a very long search query with multiple words"
    Then the search processes correctly
    And only relevant tasks are displayed
