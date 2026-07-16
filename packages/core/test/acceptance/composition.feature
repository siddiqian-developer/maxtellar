Feature: Subtask composition — the zero-sum bracket (§2.7, G24)
  Decomposing a task replaces its budget with the sum of its children; the
  leaves live on the spine and the parent is their derived bracket.

  @G24
  Scenario: A decomposed parent's budget becomes the sum of its children
    Given the clock reads 9:00
    And a budgeted task "P" of 25 minutes
    When "P" is decomposed into:
      | title  | budget |
      | write  | 30     |
      | review | 20     |
    Then the budget of "P" is 50 minutes
    And "P" has 2 leaves
    And all invariants hold
