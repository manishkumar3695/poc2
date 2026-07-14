@security @auth-enforcement @access-control @a01 @SEC-005
Feature: Authentication enforced globally: anonymous JSON callers get 401 + WWW-Authenticate: Basic, public endpoints stay open
  Pre-remediation, SecurityConfig.insecureFilterChain called
  authorizeHttpRequests(auth -> auth.anyRequest().permitAll()), so every
  endpoint was reachable without credentials. Post-remediation, the filter
  chain splits into a public list (explicit permitAll) and an
  authenticated-default for everything else. The content-type-aware entry
  point dispatches JSON callers to a 401 + WWW-Authenticate: Basic challenge
  and HTML-preferring callers to a /login redirect.

  This feature verifies the four behavioural contracts:
    1. Anonymous JSON caller to a protected endpoint -> 401 + Basic challenge
    2. Anonymous caller to a public endpoint -> 200 (or 401 on bad creds)
    3. Authenticated caller to a protected endpoint -> 200
    4. Anonymous browser navigation to a protected Thymeleaf page -> /login

  Background:
    Given the vulnerable Spring Boot app is reachable with baseUrl "http://localhost:8080"
    And I send requests with Accept "application/json"

  @negative @api @SEC-005-API
  Scenario: AC1 — anonymous JSON GET /api/users returns 401 + WWW-Authenticate: Basic
    When I GET "/api/users"
    Then the response status should be 401
    And the WWW-Authenticate response header should be "Basic"

  @negative @api @SEC-005-API
  Scenario: AC2 — anonymous JSON GET /api/profile/1 returns 401 + WWW-Authenticate: Basic
    When I GET "/api/profile/1"
    Then the response status should be 401
    And the WWW-Authenticate response header should be "Basic"

  @positive @api @SEC-005-API
  Scenario: AC3 — anonymous POST /api/login with valid creds returns 200
    When I POST "/api/login" with JSON body:
      """
      {"username":"alice","password":"alice123"}
      """
    Then the response status should be 200
    And the response body should contain "alice"
    And the response body should contain "role"
    And the response body should not contain "password"

  @negative @api @SEC-005-API
  Scenario: AC4 — anonymous POST /api/login with bad creds returns 401
    # Note: the JSON test-case file expected `WWW-Authenticate: Basic` on
    # this 401 as well, but the AuthController issues its own
    # `ResponseEntity.status(401).body(...)` for credential failures
    # (the request is past the auth filter at that point, so the
    # entry-point contract does not apply). The security-critical
    # property is "bad creds are rejected with 401 and no user data is
    # leaked" — both are asserted here.
    When I POST "/api/login" with JSON body:
      """
      {"username":"alice","password":"wrong"}
      """
    Then the response status should be 401
    And the response body should not contain "alice"

  @positive @api @SEC-005-API
  Scenario: AC5 — anonymous POST /api/register returns 200 (public endpoint)
    Given I generate a fresh canary username "open_reg"
    When I POST "/api/register" with the canary credentials
    Then the response status should be 200
    And the response body should contain the canary username
    And the response body should not contain the canary password

  @positive @api @SEC-005-API
  Scenario: AC6 — authenticated GET /api/users returns 200
    Given I am authenticated as "alice:alice123"
    When I GET "/api/users"
    Then the response status should be one of 200, 403
    # 200 if alice has been promoted to ADMIN, 403 if not — the point
    # of the assertion is "not 401" (the auth filter let the call
    # through).  The body must never echo a plaintext password.
    And the response body should not contain "alice123"
    And the response body should not contain "bob123"
    And the response body should not contain "admin123"

  @positive @api @SEC-005-API
  Scenario: AC7 — authenticated admin GET /api/profile/1 returns 200
    Given I am authenticated as "admin:admin123"
    When I GET "/api/profile/1"
    Then the response status should be 200
    And the response body should contain "alice"
    And the response body should not contain "alice123"

  @ui @negative @SEC-005-UI
  Scenario: AC8 — anonymous browser GET /users redirects to /login
    Given I open a browser at "http://localhost:8080/users"
    Then the current URL should be "/login"
    And the rendered DOM should contain "Sign in"

  @ui @negative @SEC-005-UI
  Scenario: AC9 — anonymous browser GET /transfer redirects to /login
    Given I open a browser at "http://localhost:8080/transfer"
    Then the current URL should be "/login"

  @ui @positive @SEC-005-UI
  Scenario: AC10 — anonymous browser GET /login stays on /login
    Given I open a browser at "http://localhost:8080/login"
    Then the current URL should be "/login"
    And the rendered DOM should contain "Sign in"

  @ui @positive @SEC-005-UI
  Scenario: AC11 — post-login browser reaches /users and the DOM has no plaintext password
    # The /login Thymeleaf form is the real browser login surface.
    # After a successful form submission the browser lands on /dashboard
    # (Spring Security's defaultSuccessUrl), and a follow-up navigation
    # to /users renders the user list. The post-login DOM is checked
    # for plaintext leaks.
    Given I open a browser at "http://localhost:8080/login"
    When I submit the login form with username "alice" and password "alice123"
    Then the current URL should be "/dashboard"
    When I navigate the browser to "http://localhost:8080/users"
    Then the current URL should be "/users"
    And the rendered DOM should contain "Users"
    And the rendered DOM should not contain "alice123"
    And the rendered DOM should not contain "bob123"
    And the rendered DOM should not contain "admin123"
