Feature: Property Rental Listing
  As a property owner
  I want to list my property for rent with flexible durations
  So that I can reach tenants looking for shortlet, weekly, monthly, or annual rentals

  Scenario: Owner lists a property for multiple rental durations
    Given I am a registered property owner
    When I create a new property listing
    And I select shortlet, weekly, monthly, and annual as available rental durations
    Then the property listing should display all selected rental durations

  Scenario: Tenant searches for properties by rental duration
    Given there are properties listed with various rental durations
    When I search for properties available for monthly rent
    Then I should see only properties that offer monthly rental

  Scenario: Owner lists a property for only shortlet
    Given I am a registered property owner
    When I create a new property listing
    And I select only shortlet as the rental duration
    Then the property listing should display shortlet as the available rental duration

  Scenario: Tenant cannot find properties for unavailable durations
    Given there are no properties listed for annual rent
    When I search for properties available for annual rent
    Then I should see no results