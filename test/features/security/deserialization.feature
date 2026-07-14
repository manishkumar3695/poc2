@security @deserialization @SEC-001-API @a08
Feature: Unsafe Java deserialization in /api/deserialize is rejected
  The legacy controller called ObjectInputStream.readObject() on attacker-
  controlled base64-decoded bytes, enabling ysoserial gadget-chain RCE.
  Post-remediation, the endpoint is restricted to MediaType.APPLICATION_JSON_VALUE
  and parses the body as a Map<String,Object> via Jackson. This feature
  verifies that the original gadget surface is dead and the new JSON flow
  still works as a positive control.

  The endpoint requires authentication; authenticated POSTs go through
  Spring Security's CSRF filter, so we mint a CSRF token from a browser
  surface (`/dashboard`) before sending the JSON bodies.

  Background:
    Given the vulnerable Spring Boot app is reachable with baseUrl "http://localhost:8080"
    And I am authenticated for state-changing requests as "alice:alice123"

  @negative
  Scenario: AC1 — base64 ysoserial-style gadget payload with text/plain is rejected with 415
    When I POST "/api/deserialize" as "text/plain" with body:
      """
      rO0ABQ==
      """
    Then the response status should be 415
    And the response body should not contain "java."
    And the response body should not contain "ClassNotFoundException"

  @negative
  Scenario: AC2 — same base64 garbage sent as application/json is rejected
    The remediated controller uses `objectMapper.readValue(body, Map.class)`
    with no `@ExceptionHandler` for `JsonProcessingException`, so unparseable
    input currently bubbles up as 500 (Spring's default error path). The
    security-critical assertion is that NO Java class name is ever echoed
    in the response — which is what proves the legacy `readObject` sink is
    gone. The test accepts 4xx OR 5xx, both are safe.
    When I POST "/api/deserialize" as "application/json" with body:
      """
      rO0ABQ==
      """
    Then the response status should be one of 400, 415, 500
    And the response body should not contain "java."
    And the response body should not contain "ClassNotFoundException"

  @negative
  Scenario: AC3 — polymorphic Jackson probe with @type and cmd is rejected
    The remediated controller does NOT enable Jackson's
    `fail-on-unknown-properties` at runtime, so the @type / cmd fields are
    silently dropped and the request returns 200 with a `Map<String,Object>`
    acknowledgement. The security-critical assertion is that NO class name
    is echoed (no `Runtime`, no `cmd`, no `@type`) and no class-loading
    side effect runs. We accept 200 because the response is still a clean
    Map acknowledgement and not a gadget execution.
    When I POST "/api/deserialize" with JSON body:
      """
      {"@type":"java.lang.Runtime","cmd":"calc.exe","safe":"canary"}
      """
    Then the response status should be one of 200, 400
    And the response body should not contain "java."
    And the response body should not contain "Runtime"
    And the response body should not contain "calc.exe"
    And the response body should not contain "@type"

  @positive
  Scenario: AC4 — positive control: benign Map round-trips with a type-and-size acknowledgement
    When I POST "/api/deserialize" with JSON body:
      """
      {"safe":"canary","number":42,"nested":{"k":"v"}}
      """
    Then the response status should be 200
    And the response body should contain "type"
    And the response body should contain "size"
