Feature: Scheduling laws — no-overlap, overrun slide, amputation-at-birth
  Derived from §3 (the scheduler). Restates the G10 worked example and its
  neighbouring rules at the level of the public core API.

  Background:
    Given the clock reads 9:00
    And a running budgeted task "R" of 60 minutes
    And a budgeted task "E" of 30 minutes
    And a fixed task "F" from 10:30 to 11:00
    And a budgeted task "G" of 45 minutes

  @G7
  Scenario: A settled plan never overlaps and tiles the leading chain
    When the clock advances to 10:00
    Then task "E" is placed at 10:00 to 10:30
    And task "F" is placed at 10:30 to 11:00
    And task "G" is placed at 11:00 to 11:45
    And no two placements overlap
    And all invariants hold

  @G10
  Scenario: An overrun wraps the breakable task around the fixed obstacle
    When the clock advances to 10:05
    Then task "E" is split into 10:05 to 10:30 and 11:00 to 11:05
    And task "G" is placed at 11:05 to 11:50
    And no two placements overlap
    And all invariants hold

  @G18
  Scenario: A fixed task caught by an overrun is amputated at birth, never moved
    When the clock advances to 10:31
    Then task "F" is amputated to 10:31 to 11:00 with a skipped record from 10:30 to 10:31
    And all invariants hold
