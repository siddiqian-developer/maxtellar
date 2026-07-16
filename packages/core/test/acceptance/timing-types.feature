Feature: The five timing types (§3.6)
  Every task classifies as exactly one of the five timing types and settles
  without violating any invariant.

  Background:
    Given the clock reads 9:00

  Scenario: All five timing types coexist and settle cleanly
    Given a budgeted task "B" of 30 minutes
    And a fixed task "F" from 14:00 to 15:00
    And a semi-head task "H" starting at 11:00
    And a semi-tail task "T" ending at 13:00
    And an unscheduled task "U"
    Then task "B" has timing "budgeted"
    And task "F" has timing "fixed"
    And task "H" has timing "semi-head"
    And task "T" has timing "semi-tail"
    And task "U" has timing "unscheduled"
    And no two placements overlap
    And all invariants hold
