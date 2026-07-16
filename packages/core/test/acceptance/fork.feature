Feature: Fork / commit re-settles at real now (§3.12)
  Sandbox edits never touch the live plan; committing re-settles the edit at the
  REAL current time, so a task edited in the sandbox lands after the runner's
  real projected end (live wins).

  Scenario: A sandbox budget edit commits and re-settles at real now
    Given the clock reads 9:00
    And a running budgeted task "R" of 60 minutes
    And a budgeted task "E" of 30 minutes
    When the plan is forked, "E" is re-budgeted to 45 in the sandbox, and live advances to 9:25 before committing
    Then the budget of "E" is 45 minutes
    And task "E" is placed at 10:00 to 10:45
    And all invariants hold
