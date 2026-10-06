## Purpose

Define the durable Assistant history and replayable streaming contract so clients can render complete ordered work across disconnects without owning backend execution.

## ADDED Requirements

### Requirement: CAP-005 Ordered durable events

Each Session SHALL expose a monotonically ordered durable event history covering completed messages, reasoning items, tools, plans, compaction, interrupts, Run states, usage and artifacts.

#### Scenario: Parallel tools complete out of order

- **WHEN** two pending tools complete in the opposite order from their requests
- **THEN** each result is paired with its own tool-call identity and durable completion order is unambiguous

### Requirement: CAP-005 Bounded history queries

Clients SHALL be able to page durable history by stable cursor without loading an entire Session, and repeated queries for the same committed range SHALL return the same ordered identities.

#### Scenario: Client pages older history

- **WHEN** the CLI requests the page before its oldest loaded event
- **THEN** the Runtime returns a bounded preceding page and a cursor that does not duplicate or skip committed events

### Requirement: CAP-006 Replayable SSE

The stream SHALL emit versioned events with unique event IDs and Session sequence numbers, SHALL support resumption after a cursor, and SHALL separate heartbeat frames from business events.

#### Scenario: Client reconnects after losing events

- **WHEN** the CLI reconnects with its last committed sequence
- **THEN** the Runtime replays every later durable event in order before delivering live events

### Requirement: CAP-006 Slow consumer handling

The Runtime SHALL NOT block Agent execution indefinitely or silently drop business events for a slow subscriber; it SHALL disconnect an over-limit subscriber so it can resume from a durable cursor.

#### Scenario: Subscriber exceeds buffer allowance

- **WHEN** a subscriber cannot consume within the configured bound
- **THEN** its stream closes with a resumable indication and the Run continues independently

### Requirement: CAP-025 Owned artifacts

Artifacts SHALL have stable identity, owner, Session/Run association, MIME type, size and storage reference, and SHALL be retrievable only by authorized users. Fork SHALL copy Session artifact-reference rows without duplicating immutable blobs. Session deletion SHALL remove only the target references, and a blob SHALL be deleted only after its last reference is gone.

#### Scenario: Generated image is committed

- **WHEN** image generation completes with a persisted artifact
- **THEN** history contains an artifact event and the owner can retrieve the image through an authenticated reference

#### Scenario: Artifact persistence fails

- **WHEN** a tool produces content but artifact storage fails
- **THEN** the event reports the artifact failure and does not expose a nonexistent successful reference
