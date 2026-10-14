# toojibee_period

Health data, encrypted. Tables: `period_user_keys` (per-user data key wrapped by the server master key), `period_profiles`, `period_cycles`. All `enc_*` columns are AES-256-GCM; see the header of `001_period_schema.sql` for the format. Deleting a user's key row destroys their data (crypto-shredding).
