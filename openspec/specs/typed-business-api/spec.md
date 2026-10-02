# Typed Business API Specification

## Purpose

Provide a contract-first business API boundary that gives web consumers runtime-validated data, end-to-end types and a standard OpenAPI description without coupling them to backend source code.

## Requirements

### Requirement: Shared contract boundary

The system SHALL publish the typed business API contract from a dedicated shared-package export, SHALL derive request and response types from runtime schemas, and SHALL allow base-schema consumers to load their existing export without loading the RPC client or server runtime.

#### Scenario: Frontend consumes the contract

- **WHEN** the web client is compiled against the typed business API
- **THEN** it imports the shared contract without importing any NestJS application source

#### Scenario: Base schema consumer remains isolated

- **WHEN** a consumer imports only the base contracts package entry point
- **THEN** the RPC contract runtime is not part of that import path

### Requirement: Typed greeting operation

The business service SHALL expose a contract-defined read operation that returns a greeting conforming to the shared greeting response schema, and the web client SHALL use the typed contract client for that operation.

#### Scenario: Greeting succeeds

- **WHEN** the web client requests the greeting from an available business service
- **THEN** it receives a runtime-validated greeting with a string message

#### Scenario: Greeting response is invalid

- **WHEN** the business service returns a payload that violates the greeting response contract
- **THEN** the client rejects the response rather than returning unvalidated data

#### Scenario: Business service is unavailable

- **WHEN** the greeting request cannot reach the business service
- **THEN** the client exposes a failure and the existing page-level fallback remains renderable

### Requirement: OpenAPI description

The business service SHALL expose a machine-readable OpenAPI document that describes every operation implemented by this PoC, including the greeting method, path, success response and runtime schema.

#### Scenario: OpenAPI document is requested

- **WHEN** a consumer requests the documented OpenAPI endpoint
- **THEN** it receives a valid OpenAPI document containing the typed greeting operation

### Requirement: Legacy endpoint compatibility

The business service SHALL preserve the existing `GET /` greeting endpoint while the typed API remains under evaluation.

#### Scenario: Existing consumer uses the legacy endpoint

- **WHEN** an existing consumer sends `GET /`
- **THEN** it continues to receive the same contract-valid greeting and HTTP success status
