require('dotenv').config();
const supabase = require('./index');

const BUCKET = 'note-images';

async function setupStorage() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('Failed to list storage buckets:', listError.message);
    process.exit(1);
  }

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`✅ Storage bucket "${BUCKET}" already exists.`);
    process.exit(0);
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  });

  if (createError) {
    console.error(`Failed to create bucket "${BUCKET}":`, createError.message);
    process.exit(1);
  }

  console.log(`✅ Created public storage bucket "${BUCKET}" for note image blocks.`);
  process.exit(0);
}

setupStorage();
