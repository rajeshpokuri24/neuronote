require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Database is managed by Supabase — raw SQL must be applied via the Supabase Dashboard.
// This script prints the SQL files that need to be run so you can paste them into
// the Supabase SQL Editor at https://app.supabase.com → your project → SQL Editor.

async function setup() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const migrationsDir = path.join(__dirname, 'migrations');

  console.log('\n📋 NeuroNote Database Setup (Supabase)\n');
  console.log('The app uses @supabase/supabase-js — raw SQL cannot be executed via the JS client.');
  console.log('Apply the following files via the Supabase SQL Editor:\n');
  console.log('  👉 https://app.supabase.com → your project → SQL Editor\n');

  if (fs.existsSync(schemaPath)) {
    console.log('1. schema.sql (base schema)');
    console.log(`   Path: ${schemaPath}\n`);
  }

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    files.forEach((file, i) => {
      console.log(`${i + 2}. migrations/${file}`);
      console.log(`   Path: ${path.join(migrationsDir, file)}\n`);
    });
  }

  console.log('After applying all SQL files, start the backend with: npm run dev\n');
  process.exit(0);
}

setup();
