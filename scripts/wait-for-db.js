const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function waitForDatabase() {
  const maxAttempts = 30;
  const delay = 2000; // 2 seconds

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Try to connect using Prisma/Node.js approach (more reliable)
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.$connect();
      await prisma.$disconnect();
      
      console.log('✅ Database is ready!');
      process.exit(0);
    } catch (error) {
      // Fallback: try psql command if available
      try {
        const env = { ...process.env, PGPASSWORD: 'autotrader_password' };
        await execAsync('PGPASSWORD=autotrader_password psql -h localhost -p 5432 -U autotrader -d autotrader -c "SELECT 1;" 2>/dev/null', { env });
        console.log('✅ Database is ready!');
        process.exit(0);
      } catch (err) {
        // Try pg_isready as last resort
        try {
          const env = { ...process.env, PGPASSWORD: 'autotrader_password' };
          await execAsync('pg_isready -h localhost -p 5432 -U autotrader 2>/dev/null', { env });
          console.log('✅ Database is ready!');
          process.exit(0);
        } catch (pgErr) {
          console.log(`⏳ Waiting for database... (attempt ${i + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  console.error('❌ Database failed to start within timeout');
  console.error('💡 Make sure PostgreSQL is installed and running:');
  console.error('   sudo apt install -y postgresql postgresql-contrib');
  console.error('   sudo systemctl start postgresql');
  console.error('   See SETUP.md for detailed instructions');
  process.exit(1);
}

waitForDatabase();

