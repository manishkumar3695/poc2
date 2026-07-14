@security @sqli @search @SEC-003-API @a03
Feature: SQL injection in /api/search does not dump the users table
  findByUsernameUnsafe historically concatenated the q parameter into a
  native SELECT. A tautology dumped every user row including the password
  field. Post-remediation, the query is parameterised. This feature
  verifies the negative payloads return zero rows and the positive
  controls return exactly one row, with no plaintext password leakage.

  Background:
    Given the vulnerable Spring Boot app is reachable with baseUrl "http://localhost:8080"
    And I am authenticated as "alice:alice123"

  @positive
  Scenario: AC1 — exact username search returns the single alice row, with BCrypt-hashed password if any
    When I GET "/api/search?q=alice"
    Then the response status should be 200
    And the response body should match a JSON array of length 1
    And the response body should contain "alice"
    And the response body should not contain "alice123"

  @negative
  Scenario: AC2 — SQLi tautology in q returns zero rows (no mass disclosure)
    When I GET "/api/search?q=' OR '1'='1"
    Then the response status should be 200
    And the response body should match a JSON array of length 0

  @negative
  Scenario: AC3 — UNION probe returns zero rows and leaks no SQL error
    When I GET "/api/search?q=' UNION SELECT 1,2,3,4,5 FROM users--"
    Then the response status should be 200
    And the response body should match a JSON array of length 0
    And the response body should not match "/Hibernate|SQL|ORA-|JpaSystemException|constraint/i"

  @negative
  Scenario: AC4 — wildcard payload returns zero rows (no LIKE expansion)
    # A single percent is sent URL-encoded as `%25` so the request
    # reaches the server with a well-formed query string. The server
    # treats the literal `%` as an exact-match username (no row matches),
    # proving the parameter is bound as a literal and not used in a
    # `LIKE` expression that would expand to all rows.
    When I GET "/api/search?q=%25"
    Then the response status should be 200
    And the response body should match a JSON array of length 0

  @positive
  Scenario: AC5 — exact username search for bob returns a single row, never a plaintext password
    When I GET "/api/search?q=bob"
    Then the response status should be 200
    And the response body should match a JSON array of length 1
    And the response body should contain "bob"
    And the response body should not contain "bob123"
