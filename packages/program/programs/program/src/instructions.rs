pub mod register_provider;
pub mod deregister_provider;
pub mod lock_job;
pub mod settle_job;
pub mod slash_provider;

// Glob re-export everything from each module — brings context structs AND
// their generated __client_accounts_* macros to the crate root.
// The `handler` name collision produces a warning only, not an error.
pub use register_provider::*;
pub use deregister_provider::*;
pub use lock_job::*;
pub use settle_job::*;
pub use slash_provider::*;
