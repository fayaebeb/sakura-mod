import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as moderatorSchema from '@shared/moderatorSchema';

neonConfig.webSocketConstructor = ws;

if (!process.env.USER_DATABASE_URL) {
  throw new Error("USER_DATABASE_URL must be set");
}

// Create Neon serverless client
export const pool = new Pool({
  connectionString: process.env.USER_DATABASE_URL,
});

export const moderatorDb = drizzle(pool, { schema: moderatorSchema });