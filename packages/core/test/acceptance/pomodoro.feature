Feature: Pomodoro channels and breaks-eat-budget (§5.2)
  Phases are ledger channels, not spine segments: work accrues to spent,
  work-overshoot to managed, break to breaks, break-overshoot to wasted. Breaks
  eat the budget, and the wall identity holds across every phase.

  Background:
    Given the clock reads 8:00

  Scenario: Work accrues to spent; overshoot accrues to managed
    Given a pomodoro task of 120 minutes with work 25 and break 5
    When 30 minutes pass
    Then the spent channel is 25
    And the managed channel is 5
    And a pomodoro transition is due

  Scenario: Breaks eat the budget — remaining = budget minus spent and breaks
    Given a pomodoro task of 60 minutes with work 25 and break 5
    When 25 minutes pass
    And a break is taken
    And 5 minutes pass
    Then the breaks channel is 5
    And the remaining budget is 30

  Scenario: The wall identity holds across work, break and resume
    Given a pomodoro task of 600 minutes with work 25 and break 5
    When 30 minutes pass
    And a break is taken
    And 8 minutes pass
    And work resumes
    And 20 minutes pass
    Then the spent channel is 45
    And the wasted channel is 3
    And the wall identity spent plus wasted plus managed plus breaks equals the elapsed wall
