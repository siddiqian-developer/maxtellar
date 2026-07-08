Feature: Task Filtering
  As a user
  I want to apply multiple filters to my task list
  So that I can focus on a specific subset

  Background:
    Given the task management app is loaded
    And I have the following tasks:
      | Title            | Project  | Priority | Status   | Due Date   |
      | Buy groceries    | Personal | Low      | Open     | 2026-07-10 |
      | Call dentist     | Personal | Medium   | Open     | 2026-07-08 |
      | Fix critical bug | Work     | Urgent   | In Progress | 2026-07-09 |
      | Complete report  | Work     | High     | Open     | 2026-07-15 |
      | Email team       | Work     | Medium   | Completed | 2026-07-07 |

  Scenario: Filter panel is accessible
    When I click the "Filter" button
    Then a filter panel appears with options:
      | Filter Option  |
      | By Project     |
      | By Priority    |
      | By Status      |
      | By Due Date    |

  Scenario: Filter by single project
    When I click the "Filter" button
    And I select "Project: Work"
    Then only tasks in the "Work" project are displayed:
      | Title            |
      | Fix critical bug |
      | Complete report  |
      | Email team       |
    And tasks from other projects are hidden

  Scenario: Filter by multiple projects (OR logic)
    When I click the "Filter" button
    And I select "Project: Work"
    And I select "Project: Personal"
    Then all tasks from both projects are displayed
    And all 5 tasks remain visible

  Scenario: Filter by priority
    When I click the "Filter" button
    And I select "Priority: High"
    Then only tasks with "High" priority are displayed:
      | Title           |
      | Complete report |

  Scenario: Filter by status
    When I click the "Filter" button
    And I select "Status: Open"
    Then only open tasks are displayed:
      | Title            |
      | Buy groceries    |
      | Call dentist     |
      | Complete report  |
    And completed tasks are hidden

  Scenario: Apply multiple filters with AND logic
    When I click the "Filter" button
    And I select "Project: Work"
    And I select "Status: Open"
    Then only open tasks in "Work" project are displayed:
      | Title           |
      | Complete report |
    And tasks from "Personal" or non-open tasks are hidden

  Scenario: Complex filter combination
    When I apply the following filters:
      | Filter Type | Value       |
      | Project     | Work        |
      | Priority    | High, Urgent |
      | Status      | Open        |
    Then only tasks matching all criteria are displayed:
      | Title           |
      | Complete report |

  Scenario: Active filters are displayed as chips
    When I have filters applied
    Then each active filter shows as a removable chip:
      | Chip Display         |
      | "Project: Work" [×]  |
      | "Status: Open" [×]   |

  Scenario: Remove individual filter
    When I have multiple filters applied
    And I click the [×] on the "Status: Open" chip
    Then the status filter is removed
    And other filters remain active

  Scenario: Clear all filters
    When I have multiple filters applied
    And I click the "Clear All Filters" button
    Then all filters are removed
    And all tasks are displayed

  Scenario: Filter by due date range
    When I click the "Filter" button
    And I select "Due Date: This Week"
    Then only tasks due within 7 days are displayed
    And tasks with later due dates are hidden

  Scenario: Due date filter options
    When I click the "Filter" button
    And I expand "Due Date" filter
    Then options are available:
      | Option       |
      | Today        |
      | This Week    |
      | This Month   |
      | Overdue      |
      | No Due Date  |
      | Custom Range |

  Scenario: Filter state persists during session
    When I apply filters and navigate away
    And I return to the task list
    Then the filters remain active
    And the filtered results are still displayed

  Scenario: No results with filter combination
    When I apply filters that have no matching tasks
    Then a message appears "No tasks match these filters"
    And an option to "Clear filters" is available

  Scenario: Filter and search work together
    When I apply a filter "Project: Work"
    And I search for "report"
    Then only tasks in "Work" that match "report" are displayed
    And both constraints are applied
