@security @sqli @login @SEC-002-API @a03
Feature: SQL injection in /api/login does not bypass authentication
  loginUnsafe historically concatenated username and password into a native
  SQL string. The tautology ' OR '1'='1 short-circuited the WHERE clause.
  Post-remediation, the query is parameterised and the password is compared
  against a BCrypt hash. This feature verifies the SQLi vectors are
  rejected with 401 and the seeded credentials still authenticate.

  Background:
    Given the vulnerable Spring Boot app is reachable with baseUrl "http://localhost:8080"

  @positive
  Scenario: AC1 — positive control: alice with the correct seeded password returns 200
    When I POST "/api/login" with JSON body:
      """
      {"username":"alice","password":"alice123"}
      """
    Then the response status should be 200
    And the response body should contain "alice"
    And the response body should contain "role"
    And the response body should not contain "password"

  @negative
  Scenario: AC2 — SQLi tautology in the username field is rejected with 401
    When I POST "/api/login" with JSON body:
      """
      {"username":"' OR '1'='1","password":"anything"}
      """
    Then the response status should be 401
    And the response body should not contain "alice"
    And the response body should not contain "admin"
    And the response body should not contain "bob"

  @negative
  Scenario: AC3 — UNION-based probe leaks no SQL error and no column-count
    When I POST "/api/login" with JSON body:
      """
      {"username":"' UNION SELECT 1,2,3,4,5 FROM users--","password":"x"}
      """
    Then the response status should be 401
    And the response body should not match "/Hibernate|SQL|ORA-|JpaSystemException|constraint/i"

  @negative
  Scenario: AC4 — SQLi tautology in the password field is rejected with 401
    When I POST "/api/login" with JSON body:
      """
      {"username":"alice","password":"' OR '1'='1"}
      """
    Then the response status should be 401
    And the response body should not contain "alice"

  @positive
  Scenario: AC5 — positive control: admin with the correct seeded password returns 200
    When I POST "/api/login" with JSON body:
      """
      {"username":"admin","password":"admin123"}
      """
    Then the response status should be 200
    And the response body should contain "admin"
    And the response body should contain "role"
    And the response body should not contain "password"
