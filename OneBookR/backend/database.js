import pg from 'pg';
const { Pool } = pg;

// Skapa databasanslutning
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Skapa tabeller om de inte finns
export async function initDatabase() {
  try {
    // Grupper-tabell
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY,
        creator_email VARCHAR(255) NOT NULL,
        creator_token TEXT NOT NULL,
        group_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Gruppmedlemmar-tabell
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        token TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inbjudningar-tabell
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id UUID PRIMARY KEY,
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        group_name VARCHAR(255),
        responded BOOLEAN DEFAULT FALSE,
        accepted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tidsförslag-tabell
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id UUID PRIMARY KEY,
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        from_email VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        with_meet BOOLEAN DEFAULT TRUE,
        location VARCHAR(255),
        finalized BOOLEAN DEFAULT FALSE,
        meet_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Röster på förslag-tabell
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suggestion_votes (
        id SERIAL PRIMARY KEY,
        suggestion_id UUID REFERENCES suggestions(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        vote VARCHAR(20) NOT NULL CHECK (vote IN ('accepted', 'declined')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(suggestion_id, email)
      )
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating database tables:', error);
  }
}

// Radera all användardata (GDPR)
export async function deleteUserData(email) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Radera grupper där användaren är skapare
    await client.query('DELETE FROM groups WHERE creator_email = $1', [email]);
    
    // Radera från gruppmedlemmar
    await client.query('DELETE FROM group_members WHERE email = $1', [email]);
    
    // Radera inbjudningar
    await client.query('DELETE FROM invitations WHERE email = $1 OR from_email = $1', [email]);
    
    // Radera förslag
    await client.query('DELETE FROM suggestions WHERE from_email = $1', [email]);
    
    // Radera röster
    await client.query('DELETE FROM suggestion_votes WHERE email = $1', [email]);
    
    await client.query('COMMIT');
    console.log(`All data deleted for user: ${email}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;