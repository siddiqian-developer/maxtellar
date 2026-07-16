Feature: Start-of-day ceremony — sweep and Lost Hours (§4.2)
  SOD sweeps the span between two Finished Sleeps into a day record and books
  every unaccounted minute as Lost Hours, so accounted + lost tiles the wall.

  Scenario: SOD books unaccounted gaps as Lost Hours (zero-sum)
    Given the clock reads 6:00
    And the following logged spans in hours since day-start:
      | kind  | start | end |
      | sleep | 0     | 8   |
      | work  | 10    | 13  |
      | sleep | 24    | 30  |
    When the day is started with SOD
    Then the day record spans 24 hours
    And the unaccounted time booked as Lost Hours totals 13 hours
    And accounted plus lost equals the 24-hour wall
    And all invariants hold

  Scenario: A fully-accounted day books no Lost Hours
    Given the clock reads 6:00
    And the following logged spans in hours since day-start:
      | kind  | start | end |
      | sleep | 0     | 24  |
      | sleep | 24    | 30  |
    When the day is started with SOD
    Then the day record spans 24 hours
    And no Lost Hours are booked
    And all invariants hold
