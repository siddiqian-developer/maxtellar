Feature: Weekly quota redistribution and the at-least/at-most asymmetry (§5.1)
  A shortfall against an at-least quota spreads forward, availability-weighted
  and conserved; an overshoot trims future shares proportionally; an at-most
  ceiling never redistributes — it warns, it never blocks.

  Scenario: A shortfall spreads forward, availability-weighted and conserved
    When a shortfall of 180 minutes is redistributed across the remaining days:
      | weekday | share | netCore |
      | 4       | 120   | 600     |
      | 5       | 120   | 360     |
    Then the resulting deltas are:
      | weekday | delta |
      | 4       | 120   |
      | 5       | 60    |
    And 0 minutes remain unplaced
    And the redistribution conserves the total

  Scenario: A shortfall beyond capacity reports the remainder unplaced, never dropped
    When a shortfall of 300 minutes is redistributed across the remaining days:
      | weekday | share | netCore |
      | 5       | 120   | 180     |
    Then 240 minutes remain unplaced
    And the redistribution conserves the total

  Scenario: An overshoot trims future shares proportionally, clamped at zero
    When an overshoot of 90 minutes is redistributed across the remaining days:
      | weekday | share | netCore |
      | 4       | 120   | 600     |
      | 5       | 60    | 600     |
    Then the resulting deltas are:
      | weekday | delta |
      | 4       | -60   |
      | 5       | -30   |
    And 0 minutes remain unplaced

  Scenario: An at-most ceiling never redistributes — warn, never block
    Given an at-most weekly quota "Job" of 2 hours per day over the workweek, sealed on Monday with 60 minutes achieved
    When SOD quota adjustments are computed for Tuesday
    Then no quota days are adjusted
