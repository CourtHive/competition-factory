---
title: Data Standards
---

## The Importance of Standardization

**Data standards** are critical for the long-term viability, interoperability, and accessibility of sports competition data. The **Competition Factory** is built on the **[Tennis Open Data Standards (TODS)](https://itftennis.atlassian.net/wiki/spaces/TODS/overview)**, which provide a comprehensive, document-based representation of all tournament elements.

### Why Data Standards Matter

**Long-Term Data Accessibility**: Tournament data represents significant historical and statistical value. Without standards, organizations risk losing access to their own data when:

- Software vendors go out of business
- Maintenance contracts expire
- Systems are upgraded with breaking changes
- Database platforms become obsolete

**Interoperability**: Standardized data enables:

- Integration between different tournament management systems
- Data exchange with governing bodies and ranking systems
- Aggregation of historical data across multiple platforms
- Third-party analysis and visualization tools

**Platform Independence**: Standards-based data removes dependency on:

- Specific database platforms (Oracle, SQL Server, MySQL, PostgreSQL)
- Database versions and licensing models
- Proprietary data formats
- Vendor-specific APIs

**Reproducibility**: Standardized tournament records enable:

- Complete reconstruction of tournament state at any point in time
- Verification of seeding, draw generation, and progression logic
- Audit trails for dispute resolution
- Historical analysis and statistical research

### Tennis Open Data Standards (TODS)

The **Competition Factory** began as an implementation of the **[Tennis Open Data Standards (TODS)](https://itftennis.atlassian.net/wiki/spaces/TODS/overview)**, an ITF-led initiative to create a vendor-independent, JSON-based document format for tennis competition data. TODS provided the foundational data model — tournaments, events, draws, matchUps, participants, scoring, venues, and scheduling — and the factory fully supports TODS-compliant documents.

### From TODS to CODES {#codes}

As the **Competition Factory** was deployed across more sports it was proven that the underlying data structures are not tennis-specific. The core concepts of participants, events, draws, matchUps, and scoring translate naturally across any sport that organizes bracket-based or round-robin competitions. The [matchUpFormat](/docs/codes/matchup-format) code capabilities were extended to support the scoring needs of almost all imaginable sports.

To reflect this cross-sport reality, the data model used by the Competition Factory is now called **CODES** — **Competition Open Data Exchange Standards**.

**CODES builds on TODS rather than replacing it.** Any valid TODS document is a valid CODES document. CODES extends the model with:

- Sport-agnostic terminology and conventions
- Broader applicability beyond racquet sports
- A governance model open to multiple sports federations

### What CODES Provides

CODES provides a **JSON-based document format** that captures:

**Tournament Structure**:

- Tournament metadata (dates, location, categories)
- Events (singles, doubles, team competitions)
- Draw definitions and structures (elimination, round robin, compass)
- Venues and courts with scheduling capabilities

**Participants**:

- Individual persons with biographical and contact information
- Pair participants (doubles teams)
- Team participants with roster management
- Representative organizations and officials

**Competition Elements**:

- MatchUps with scheduling, scoring, and outcomes
- Entry management and seeding protocols
- Tie formats for team competitions
- Participant lineups and substitutions

**Temporal Data**:

- [Scale Items](./concepts/scaleItems) (rankings, ratings, seeding scales)
- [Time Items](./concepts/timeItems) (data with effective dates)
- [Extensions](./concepts/extensions) (custom data and metadata)

**Audit and Metadata**:

- Position actions and draw modifications
- Score history and point-by-point data
- Officials assignments and notes
- External references and media

### Benefits Over Legacy Systems

Traditional tournament management systems store data in **relational database schemas** that evolve over time, creating:

**Schema Fragmentation**: Each system version introduces schema changes, requiring:

- Complex migration scripts
- Business logic to handle multiple schema versions
- Stored procedures specific to database platforms
- Version-specific query patterns

**Vendor Dependency**: Database-centric architectures create reliance on:

- Specific database platform licenses
- Database administrator expertise
- Backup and recovery procedures tied to database vendors
- Export tools that may not preserve all relationships

**Integration Challenges**: Moving data between systems requires:

- Schema mapping and transformation
- Data type conversions
- Relationship reconstruction
- Manual validation and reconciliation

**CODES Eliminates These Problems**:

- **Single Document Format**: All tournament data in one JSON file
- **Self-Describing**: Schema embedded in document structure
- **Version Independent**: Documents readable by any CODES-compliant processor
- **Database Agnostic**: Store in filesystem, NoSQL, or relational databases
- **Human Readable**: JSON format accessible to developers and analysts

### Implementation in Competition Factory

The **Competition Factory** provides:

**Validation**: Ensuring tournament records conform to CODES specifications
**Transformation**: Converting legacy data to CODES format
**Generation**: Creating valid CODES documents from scratch
**Querying**: Extracting information from CODES documents efficiently
**Mutation**: Modifying tournament state while maintaining CODES compliance

All factory operations preserve CODES compliance, ensuring that tournament records remain portable, accessible, and standards-compliant throughout their lifecycle.

### The JSON Schema

`src/global/schema/tournament.schema.json` is the **third declaration of CODES**, after the TypeScript types and these docs. It is held in the repository and exercised by the test suite; it is not part of the published package, whose surface is `dist`.

Because it is a third declaration it can drift from the other two, and drift here is consequential in both directions: a closed definition turns a CODES field added to the types but not mirrored in the schema into a loud validation failure, while an open one hides it.

**Strictness is a stated convention, not an accident.** Of the 68 object definitions, **64 declare `additionalProperties: false`**. Four are deliberately open:

| definition | why it is open |
| --- | --- |
| `Extension` | extensions carry caller-defined payloads by design |
| `Tournament` | permissive pending the undeclared fields real records still carry |
| `Venue` | as above |
| `Organisation` | as above |

Closing the three record-shaped definitions is **blocked rather than declined**: measured against the TODS fixtures, making them strict fails most of them and exposes undeclared fields carried by real records — `venueIds`, `deleted`, `Venue.parentOrganisation`, `Organisation.createdAt` / `updatedAt`, and others. Each needs a decision about whether it belongs in CODES before the definition can be closed around it.

A producer writing CODES records should treat `additionalProperties: false` as the expected case and not rely on the four open definitions staying open.

## Related Documentation

- **[Introduction](./)** - Overview of Competition Factory architecture
- **[Time Capsule](./time-capsule)** - CODES as immutable historical records
- **[Scale Items](./concepts/scaleItems)** - Rankings and ratings in CODES
- **[Time Items](./concepts/timeItems)** - Temporal data management
- **[Extensions](./concepts/extensions)** - Custom data and metadata
